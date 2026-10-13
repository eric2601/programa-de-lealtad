import compression from 'compression';
import { VEHICLE_KINDS, VEHICLE_KIND_LABELS } from '../plate.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { atLeast, loginWithPin, logout, sessionFromToken, type Session } from '../auth.js';
import type { Ctx } from '../context.js';
import { iso, loadProgram } from '../context.js';
import { AppError } from '../errors.js';
import { describeProgram } from '../rules.js';
import * as customers from '../services/customers.js';
import * as redemptions from '../services/redemptions.js';
import * as reports from '../services/reports.js';
import * as sales from '../services/sales.js';
import * as scratch from '../services/scratch.js';
import * as analytics from '../services/analytics.js';
import * as notifications from '../services/notifications.js';
import * as overview from '../services/overview.js';
import * as partners from '../services/partners.js';
import * as promotions from '../services/promotions.js';
import * as research from '../services/research.js';
import * as segments from '../services/segments.js';
import * as wallet from '../services/wallet.js';
import { generateProposals } from '../promo/generator.js';
import { adContent } from '../promo/terms.js';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, OBJECTIVES, OBJECTIVE_LABELS, PAYMENT_METHODS, PROMO_TYPES, PROMO_TYPE_LABELS, SEGMENTS, SEGMENT_LABELS } from '../promo/types.js';
import { all } from '../db.js';

declare module 'express-serve-static-core' {
  interface Request { session?: Session }
}

export function createApp(ctx: Ctx, opts: { webDist?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.removeHeader('X-Powered-By'); next(); });
  // gzip para JSON, JS y CSS: el JS de la web baja de ~450 KB a ~130 KB en la red.
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '256kb' }));

  const requireSession = (minRole: Session['role'] = 'attendant') => (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const s = sessionFromToken(token);
    if (!s) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Inicia sesión con tu NIP.' } });
    if (!atLeast(s.role, minRole)) return res.status(403).json({ error: { code: 'ROLE_REQUIRED', message: `Esta acción requiere rol ${minRole} o superior.` } });
    req.session = s;
    next();
  };
  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); }
  };

  app.get('/v1/health', (_req, res) => res.json({ ok: true, at: iso(ctx.now()) }));

  // ---- Sesión de estación ----
  app.post('/v1/auth/pin', wrap((req, res) => {
    const { stationCode, pin } = req.body ?? {};
    const s = loginWithPin(ctx, String(stationCode ?? ''), String(pin ?? ''));
    const cfg = loadProgram(ctx, s.tenantId);
    res.json({ token: s.token, user: { id: s.userId, name: s.name, role: s.role }, station: { id: s.stationId, code: s.stationCode, name: s.stationName }, tenant: { id: s.tenantId, name: s.tenantName }, program: { ...cfg, description: describeProgram(cfg) } });
  }));
  app.post('/v1/auth/logout', requireSession(), (req, res) => { logout(req.session!.token); res.json({ ok: true }); });

  // ---- Isla ----
  app.post('/v1/lookup', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.json(customers.lookup(ctx, s.tenantId, s.userId, String(req.body?.plate ?? req.body?.phone ?? '')));
  }));
  app.post('/v1/memberships', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.status(201).json(customers.enroll(ctx, s.tenantId, s.userId, s.stationId, req.body));
  }));
  app.post('/v1/verify/start', requireSession(), wrap((req, res) => {
    res.json(customers.startOtp(ctx, String(req.body?.phone ?? ''), 'verify'));
  }));
  app.post('/v1/verify/confirm', requireSession(), wrap((req, res) => {
    res.json(customers.confirmOtp(ctx, String(req.body?.challengeId ?? ''), String(req.body?.code ?? '')));
  }));
  app.post('/v1/sales/preview', requireSession(), wrap((req, res) => {
    res.json(sales.previewSale(ctx, req.session!, req.body));
  }));
  app.post('/v1/sales', requireSession(), wrap((req, res) => {
    const s = req.session!;
    const key = req.header('idempotency-key') ?? '';
    res.status(201).json(sales.registerSale(ctx, s, key, req.body));
  }));
  app.post('/v1/coupons/redeem', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.json(promotions.redeemCoupon(ctx, s.tenantId, s.userId, String(req.body?.code ?? ''), req.body?.saleId ? String(req.body.saleId) : null));
  }));
  app.post('/v1/sales/:id/void', requireSession(), wrap((req, res) => {
    res.json(sales.voidSale(ctx, req.session!, req.params.id, String(req.body?.reason ?? 'sin motivo')));
  }));
  app.post('/v1/returns', requireSession(), wrap((req, res) => {
    res.json(sales.returnStore(ctx, req.session!, String(req.body?.saleId ?? ''), Number(req.body?.amountCents), String(req.body?.reason ?? 'sin motivo')));
  }));
  app.post('/v1/redemptions/prepare', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.status(201).json(redemptions.prepare(ctx, s.tenantId, s.userId, req.body));
  }));
  app.post('/v1/redemptions/confirm', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.json(redemptions.confirm(ctx, s.tenantId, s.userId, String(req.body?.redemptionId ?? ''), String(req.body?.code ?? '')));
  }));
  app.post('/v1/redemptions/:id/cancel', requireSession(), wrap((req, res) => {
    const s = req.session!;
    redemptions.cancel(ctx, s.tenantId, s.userId, req.params.id);
    res.json({ ok: true });
  }));

  // Rasca y Gana desde la pantalla de la isla (el cliente rasca en la tableta).
  app.post('/v1/scratch/:id/reveal', requireSession(), wrap((req, res) => {
    const s = req.session!;
    res.json(scratch.revealCard(ctx, req.params.id, { tenantId: s.tenantId, actorUserId: s.userId }));
  }));

  // ---- Reportes (gerente en adelante) ----
  // Dashboard de operación del día (gerente en adelante). ?station=<id> filtra una estación; sin parámetro, todo el grupo.
  app.get('/v1/dashboard', requireSession('manager'), wrap((req, res) => {
    const station = req.query.station === undefined ? req.session!.stationId : req.query.station === 'all' ? null : String(req.query.station);
    res.json(overview.today(ctx, req.session!.tenantId, station));
  }));

  app.get('/v1/reports/summary', requireSession('manager'), wrap((req, res) => {
    const now = ctx.now();
    const to = String(req.query.to ?? iso(new Date(now.getTime() + 86_400_000)));
    const from = String(req.query.from ?? iso(new Date(now.getTime() - 30 * 86_400_000)));
    res.json(reports.summary(ctx, req.session!.tenantId, from, to));
  }));

  // ---- Administración de campañas y promociones (gerente en adelante) ----
  const admin = requireSession('manager');
  const range = (req: Request) => {
    const now = ctx.now();
    const to = String(req.query.to ?? iso(new Date(now.getTime() + 86_400_000)));
    const from = String(req.query.from ?? iso(new Date(now.getTime() - 30 * 86_400_000)));
    return { from, to };
  };
  app.get('/v1/admin/catalog', admin, (_req, res) => res.json({
    objectives: OBJECTIVES.map((k) => ({ key: k, label: OBJECTIVE_LABELS[k] })),
    promoTypes: PROMO_TYPES.map((k) => ({ key: k, label: PROMO_TYPE_LABELS[k] })),
    customerTypes: CUSTOMER_TYPES.map((k) => ({ key: k, label: CUSTOMER_TYPE_LABELS[k] })),
    vehicleKinds: VEHICLE_KINDS.map((k) => ({ key: k, label: VEHICLE_KIND_LABELS[k] })),
    segments: SEGMENTS.map((k) => ({ key: k, label: SEGMENT_LABELS[k] })),
    paymentMethods: [...PAYMENT_METHODS],
    partnerTypes: partners.PARTNER_TYPES.map((k) => ({ key: k, label: partners.PARTNER_TYPE_LABELS[k] })),
    researchTypes: research.RESEARCH_TYPES.map((k) => ({ key: k, label: research.RESEARCH_TYPE_LABELS[k] })),
  }));
  app.get('/v1/admin/stations', admin, wrap((req, res) => {
    res.json(all(ctx.db, 'SELECT id, code, name, state, city, municipality, region FROM stations WHERE tenant_id = ? ORDER BY code', req.session!.tenantId));
  }));
  app.get('/v1/admin/dashboard', admin, wrap((req, res) => { const { from, to } = range(req); res.json(analytics.dashboard(ctx, req.session!.tenantId, from, to)); }));

  app.get('/v1/admin/campaigns', admin, wrap((req, res) => res.json(promotions.listCampaigns(ctx, req.session!.tenantId))));
  app.post('/v1/admin/campaigns', admin, wrap((req, res) => res.status(201).json(promotions.createCampaign(ctx, req.session!.tenantId, req.session!.userId, req.body))));
  app.patch('/v1/admin/campaigns/:id', admin, wrap((req, res) => res.json(promotions.updateCampaign(ctx, req.session!.tenantId, req.session!.userId, req.params.id, req.body ?? {}))));
  app.get('/v1/admin/campaigns/:id/evaluation', admin, wrap((req, res) => res.json(analytics.evaluateCampaign(ctx, req.session!.tenantId, req.params.id))));

  app.get('/v1/admin/promotions', admin, wrap((req, res) => res.json(promotions.listPromotions(ctx, req.session!.tenantId, { campaignId: req.query.campaignId ? String(req.query.campaignId) : undefined, status: req.query.status ? String(req.query.status) : undefined }))));
  app.post('/v1/admin/promotions', admin, wrap((req, res) => res.status(201).json(promotions.publicView(ctx, promotions.createPromotion(ctx, req.session!.tenantId, req.session!.userId, req.body)))));
  app.get('/v1/admin/promotions/:id', admin, wrap((req, res) => res.json(promotions.promotionDetail(ctx, req.session!.tenantId, req.params.id))));
  app.patch('/v1/admin/promotions/:id', admin, wrap((req, res) => res.json(promotions.publicView(ctx, promotions.updatePromotion(ctx, req.session!.tenantId, req.session!.userId, req.params.id, req.body ?? {})))));
  app.get('/v1/admin/promotions/:id/impact', admin, wrap((req, res) => res.json(analytics.promotionImpact(ctx, req.session!.tenantId, req.params.id))));
  app.get('/v1/admin/promotions/:id/ads', admin, wrap((req, res) => res.json(adContent(promotions.getPromotion(ctx, req.session!.tenantId, req.params.id), promotions.stationNameLookup(ctx, req.session!.tenantId)))));

  app.post('/v1/admin/generator', admin, wrap((req, res) => res.json(generateProposals(req.body ?? {}))));

  app.get('/v1/admin/research', admin, wrap((req, res) => res.json({ items: research.list(ctx, req.session!.tenantId, { type: req.query.type ? String(req.query.type) : undefined, state: req.query.state ? String(req.query.state) : undefined, competitor: req.query.competitor ? String(req.query.competitor) : undefined }), summary: research.summary(ctx, req.session!.tenantId) })));
  app.post('/v1/admin/research', admin, wrap((req, res) => res.status(201).json(research.create(ctx, req.session!.tenantId, req.session!.userId, req.body))));
  app.delete('/v1/admin/research/:id', admin, wrap((req, res) => { research.remove(ctx, req.session!.tenantId, req.session!.userId, req.params.id); res.json({ ok: true }); }));

  app.get('/v1/admin/partners', admin, wrap((req, res) => res.json(partners.listPartners(ctx, req.session!.tenantId))));
  app.post('/v1/admin/partners', admin, wrap((req, res) => res.status(201).json(partners.createPartner(ctx, req.session!.tenantId, req.session!.userId, req.body))));
  app.post('/v1/admin/partners/:id/benefits', admin, wrap((req, res) => res.status(201).json(partners.createBenefit(ctx, req.session!.tenantId, req.session!.userId, req.params.id, req.body))));

  app.get('/v1/admin/segments', admin, wrap((req, res) => res.json(segments.segmentCounts(ctx, req.session!.tenantId))));
  app.get('/v1/admin/segments/:key/members', admin, wrap((req, res) => res.json(segments.membersInSegment(ctx, req.session!.tenantId, req.params.key))));

  app.get('/v1/admin/wallet', admin, wrap((req, res) => {
    const { customer } = customers.findCustomerByPhone(ctx, String(req.query.phone ?? ''));
    const m = customer ? customers.findMembership(ctx, req.session!.tenantId, customer.id) : undefined;
    if (!customer || !m) return res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Ese teléfono no participa en este programa.' } });
    res.json({ member: customers.membershipSummary(ctx, m, customer), wallet: wallet.summary(ctx, req.session!.tenantId, m.id), coupons: promotions.couponsFor(ctx, req.session!.tenantId, m.id) });
  }));
  app.post('/v1/admin/wallet/credit', admin, wrap((req, res) => {
    const s = req.session!;
    const { customer } = customers.findCustomerByPhone(ctx, String(req.body?.phone ?? ''));
    const m = customer ? customers.findMembership(ctx, s.tenantId, customer.id) : undefined;
    if (!customer || !m) return res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Ese teléfono no participa en este programa.' } });
    const mv = wallet.credit(ctx, { tenantId: s.tenantId, membershipId: m.id, amountCents: Number(req.body?.amountCents), sourceType: (req.body?.sourceType ?? 'manual'), stationId: s.stationId, expiresDays: req.body?.expiresDays ? Number(req.body.expiresDays) : 30, note: String(req.body?.note ?? 'Bonificación manual') });
    res.status(201).json({ movementId: mv.id, availableCents: wallet.availableCents(ctx, s.tenantId, m.id) });
  }));

  app.get('/v1/admin/notifications', admin, wrap((req, res) => res.json(notifications.list(ctx, req.session!.tenantId))));
  app.post('/v1/admin/notifications/run', admin, wrap((req, res) => res.json(notifications.run_(ctx, req.session!.tenantId))));

  // ---- Portal del cliente ----
  app.post('/v1/portal/session/start', wrap((req, res) => {
    res.json(customers.startOtp(ctx, String(req.body?.phone ?? ''), 'portal'));
  }));
  app.post('/v1/portal/session/confirm', wrap((req, res) => {
    const r = customers.confirmOtp(ctx, String(req.body?.challengeId ?? ''), String(req.body?.code ?? ''));
    res.json({ token: r.portalToken });
  }));
  const requirePortal = (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const c = customers.customerFromPortalToken(ctx, token);
    if (!c) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tu sesión venció. Pide un código nuevo.' } });
    (req as Request & { customer: customers.CustomerRow }).customer = c;
    next();
  };
  app.get('/v1/portal/me', requirePortal, wrap((req, res) => {
    res.json(customers.portalView(ctx, (req as Request & { customer: customers.CustomerRow }).customer));
  }));
  app.post('/v1/portal/scratch/:id/reveal', requirePortal, wrap((req, res) => {
    const c = (req as Request & { customer: customers.CustomerRow }).customer;
    res.json(scratch.revealCard(ctx, req.params.id, { customerId: c.id }));
  }));
  app.post('/v1/portal/vehicles', requirePortal, wrap((req, res) => {
    const c = (req as Request & { customer: customers.CustomerRow }).customer;
    res.status(201).json(customers.addVehicle(ctx, c, String(req.body?.plate ?? '')));
  }));
  app.delete('/v1/portal/vehicles/:id', requirePortal, wrap((req, res) => {
    const c = (req as Request & { customer: customers.CustomerRow }).customer;
    customers.removeVehicle(ctx, c, req.params.id);
    res.json({ ok: true });
  }));
  app.post('/v1/portal/consents', requirePortal, wrap((req, res) => {
    const c = (req as Request & { customer: customers.CustomerRow }).customer;
    customers.setMarketingConsent(ctx, c, String(req.body?.membershipId ?? ''), !!req.body?.granted, String(req.body?.channel ?? 'whatsapp'));
    res.json({ ok: true });
  }));

  // ---- Solo desarrollo: bandeja de mensajes para probar códigos sin WhatsApp ----
  if (ctx.devMode) {
    app.get('/v1/dev/outbox', (_req, res) => res.json(ctx.notifier.outbox.slice(-20).reverse()));
  }

  if (opts.webDist && existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, {
      setHeaders(res, filePath) {
        // Los archivos de /assets llevan un hash en el nombre: pueden guardarse un año sin volver a pedirse.
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // Carteles y pictogramas cambian poco: una semana.
        else if (/\.(webp|png|svg|woff2?)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
        // index.html siempre se revisa para tomar la versión nueva al publicar.
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    app.get(/^\/(?!v1\/).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(join(opts.webDist!, 'index.html')); });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, detail: err.detail } });
    if (err instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION', message: err.issues.map((i) => i.message).join('; '), detail: err.issues } });
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno.' } });
  });

  return app;
}
