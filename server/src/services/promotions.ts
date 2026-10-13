import { z } from 'zod';
import { VEHICLE_KINDS } from '../plate.js';
import type { Ctx } from '../context.js';
import { audit, iso, loadProgram, newId } from '../context.js';
import { all, one, run } from '../db.js';
import { notFound, unprocessable } from '../errors.js';
import { evaluate, personalOffer, returnStreak, rulesSummary, type UsageCounts } from '../promo/engine.js';
import { adContent, conditionSentence, restrictions, termsText } from '../promo/terms.js';
import { describeBenefit } from '../promo/engine.js';
import { CUSTOMER_TYPES, OBJECTIVES, OBJECTIVE_LABELS, PAYMENT_METHODS, PROMO_TYPES, PROMO_TYPE_LABELS, SEGMENTS, type AppliedBenefit, type EvaluationResult, type Promotion, type SaleContext } from '../promo/types.js';
import { DEFAULT_PROGRAM } from '../rules.js';
import { couponCode, inventoryView, issuePartnerCoupon } from './partners.js';
import { issueCardForSale } from './scratch.js';
import * as wallet from './wallet.js';

// ---------------------------------------------------------------------------------------
// Esquemas de entrada
// ---------------------------------------------------------------------------------------

const benefitSchema = z.object({
  type: z.enum(['points', 'points_multiplier', 'virtual_money', 'cashback_percent', 'discount_per_liter', 'discount_percent', 'discount_fixed', 'coupon', 'product', 'partner_coupon', 'scratch', 'two_for_one']),
  points: z.number().int().nonnegative().optional(), multiplier: z.number().positive().optional(), amountCents: z.number().int().nonnegative().optional(),
  percent: z.number().nonnegative().optional(), centsPerLiter: z.number().int().nonnegative().optional(), label: z.string().optional(),
  couponDays: z.number().int().positive().optional(), partnerBenefitId: z.string().optional(), walletExpiresDays: z.number().int().positive().optional(),
  minNextPurchaseCents: z.number().int().nonnegative().optional(), scope: z.enum(['any', 'fuel', 'store']).optional(), singleUse: z.boolean().optional(),
});
const personalizedSchema = z.object({
  upliftPercent: z.number().min(0).max(100).default(10), roundToCents: z.number().int().positive().default(5_000),
  minTargetCents: z.number().int().positive().default(40_000), maxTargetCents: z.number().int().positive().default(150_000),
  benefitTable: z.array(z.object({ targetCents: z.number().int().positive(), amountCents: z.number().int().nonnegative() })).min(1),
  minNextPurchasePercent: z.number().min(0).max(100).default(90), validDays: z.number().int().positive().default(7),
});
const rulesSchema = z.object({
  startsAt: z.string().optional(), endsAt: z.string().optional(), daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  hourFrom: z.number().int().min(0).max(23).optional(), hourTo: z.number().int().min(0).max(24).optional(),
  stationIds: z.array(z.string()).optional(), states: z.array(z.string()).optional(), cities: z.array(z.string()).optional(),
  fuelTypes: z.array(z.enum(['regular', 'premium', 'diesel'])).optional(), minFuelCents: z.number().int().nonnegative().optional(),
  minTotalCents: z.number().int().nonnegative().optional(), minLitersMl: z.number().int().nonnegative().optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional(), customerTypes: z.array(z.enum(CUSTOMER_TYPES)).optional(), vehicleKinds: z.array(z.enum(VEHICLE_KINDS)).optional(), segments: z.array(z.enum(SEGMENTS)).optional(),
  visitsInPeriod: z.object({ count: z.number().int().positive(), period: z.enum(['month', 'week', 'days']), days: z.number().int().positive().optional(), qualifyingMinFuelCents: z.number().int().nonnegative().optional() }).optional(),
  minMonthlyCents: z.number().int().nonnegative().optional(), minLifetimeCents: z.number().int().nonnegative().optional(), requiresStore: z.boolean().optional(),
  minStoreCents: z.number().int().nonnegative().optional(), requiresItems: z.array(z.string().trim().toLowerCase().min(1)).optional(),
  returnWithinDays: z.object({ days: z.number().int().positive(), minPrevFuelCents: z.number().int().nonnegative().optional() }).optional(),
  returnStreak: z.object({ withinDays: z.number().int().positive(), rewardsCents: z.array(z.number().int().nonnegative()).min(1), minFuelCents: z.number().int().nonnegative().optional() }).optional(),
  personalized: personalizedSchema.optional(),
  tiers: z.array(z.object({ minAmountCents: z.number().int().nonnegative(), benefit: benefitSchema })).optional(),
});
const limitsSchema = z.object({
  maxUses: z.number().int().positive().nullable().optional(), maxPerCustomer: z.number().int().positive().nullable().optional(),
  maxPerDay: z.number().int().positive().nullable().optional(), maxPerMonth: z.number().int().positive().nullable().optional(),
  maxDiscountCents: z.number().int().positive().nullable().optional(), maxPerTransaction: z.number().int().positive().nullable().optional(),
});
export const promotionInputSchema = z.object({
  campaignId: z.string().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  type: z.enum(PROMO_TYPES),
  objective: z.enum(OBJECTIVES),
  status: z.enum(['draft', 'active', 'paused', 'exhausted', 'ended']).default('draft'),
  priority: z.number().int().default(0),
  stackable: z.boolean().default(true),
  excludes: z.array(z.string()).default([]),
  rules: rulesSchema.default({}),
  benefit: benefitSchema,
  benefits: z.array(benefitSchema).default([]),
  limits: limitsSchema.default({}),
  inventoryInitial: z.number().int().positive().nullable().default(null),
  partnerId: z.string().nullable().default(null),
  restrictionsText: z.string().optional(),
  termsText: z.string().optional(),
});
export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().default(''), objective: z.enum(OBJECTIVES),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'ended']).default('draft'),
  startsAt: z.string(), endsAt: z.string(), budgetCents: z.number().int().nonnegative().nullable().default(null),
});

// ---------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------

interface PromotionRow {
  id: string; tenant_id: string; campaign_id: string | null; name: string; type: string; objective: string; status: Promotion['status']; priority: number;
  stackable: number; excludes_json: string; rules_json: string; benefit_json: string; benefits_json: string | null; limits_json: string; inventory_initial: number | null; inventory_used: number;
  exhausted_at: string | null; partner_id: string | null; restrictions_text: string; terms_text: string; created_at: string; updated_at: string;
}

export function rowToPromotion(r: PromotionRow): Promotion {
  return {
    id: r.id, tenantId: r.tenant_id, campaignId: r.campaign_id, name: r.name, type: r.type as Promotion['type'], objective: r.objective as Promotion['objective'],
    status: r.status, priority: r.priority, stackable: !!r.stackable, excludes: JSON.parse(r.excludes_json), rules: JSON.parse(r.rules_json), benefit: JSON.parse(r.benefit_json),
    benefits: JSON.parse(r.benefits_json || '[]'), limits: JSON.parse(r.limits_json), inventoryInitial: r.inventory_initial, inventoryUsed: r.inventory_used, exhaustedAt: r.exhausted_at, partnerId: r.partner_id,
    restrictionsText: r.restrictions_text, termsText: r.terms_text, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function stationNameLookup(ctx: Ctx, tenantId: string) {
  const map = new Map(all<{ id: string; name: string }>(ctx.db, 'SELECT id, name FROM stations WHERE tenant_id = ?', tenantId).map((s) => [s.id, s.name]));
  return (id: string) => map.get(id);
}

/** Vista pública de una promoción con textos derivados, existencias y uso. */
export function publicView(ctx: Ctx, p: Promotion) {
  const lookup = stationNameLookup(ctx, p.tenantId);
  const usage = one<{ n: number; cost: number | null; members: number }>(ctx.db, 'SELECT COUNT(*) AS n, SUM(cost_cents) AS cost, COUNT(DISTINCT membership_id) AS members FROM promotion_usages WHERE promotion_id = ?', p.id);
  const inv = inventoryView(p.inventoryInitial, p.inventoryUsed, p.exhaustedAt);
  const now = iso(ctx.now());
  const endsSoon = !!p.rules.endsAt && p.rules.endsAt > now && new Date(p.rules.endsAt).getTime() - ctx.now().getTime() < 7 * 86_400_000;
  return {
    ...p,
    typeLabel: PROMO_TYPE_LABELS[p.type], objectiveLabel: OBJECTIVE_LABELS[p.objective],
    condition: conditionSentence(p.rules, p.rules.tiers?.length ? [...p.rules.tiers].sort((a, b) => b.minAmountCents - a.minAmountCents)[0].benefit : p.benefit, p.benefits),
    rulesSummary: rulesSummary(p.rules),
    restrictions: p.restrictionsText ? p.restrictionsText.split('\n').filter(Boolean) : restrictions(p, lookup),
    terms: p.termsText || termsText(p, lookup),
    inventory: inv,
    endsSoon,
    usage: { uses: usage?.n ?? 0, costCents: usage?.cost ?? 0, members: usage?.members ?? 0 },
    stationNames: (p.rules.stationIds ?? []).map((id) => lookup(id) ?? id),
  };
}

export function listPromotions(ctx: Ctx, tenantId: string, filter: { campaignId?: string; status?: string } = {}) {
  const where = ['tenant_id = ?']; const params: unknown[] = [tenantId];
  if (filter.campaignId) { where.push('campaign_id = ?'); params.push(filter.campaignId); }
  if (filter.status) { where.push('status = ?'); params.push(filter.status); }
  return all<PromotionRow>(ctx.db, `SELECT * FROM promotions WHERE ${where.join(' AND ')} ORDER BY priority DESC, created_at`, ...params).map((r) => publicView(ctx, rowToPromotion(r)));
}

export function getPromotion(ctx: Ctx, tenantId: string, id: string): Promotion {
  const r = one<PromotionRow>(ctx.db, 'SELECT * FROM promotions WHERE tenant_id = ? AND id = ?', tenantId, id);
  if (!r) throw notFound('PROMOTION_NOT_FOUND', 'No encontramos esa promoción.');
  return rowToPromotion(r);
}

export function promotionDetail(ctx: Ctx, tenantId: string, id: string) {
  const p = getPromotion(ctx, tenantId, id);
  const lookup = stationNameLookup(ctx, tenantId);
  const recent = all(ctx.db,
    `SELECT u.created_at, u.cost_cents, u.benefit_json, m.first_name, st.name AS station, s.pos_reference, s.fuel_cents, s.store_cents
     FROM promotion_usages u JOIN memberships m ON m.id = u.membership_id JOIN stations st ON st.id = u.station_id JOIN sales s ON s.id = u.sale_id
     WHERE u.promotion_id = ? ORDER BY u.created_at DESC LIMIT 25`, id);
  const byDay = all(ctx.db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS uses, SUM(cost_cents) AS cost FROM promotion_usages WHERE promotion_id = ? GROUP BY day ORDER BY day`, id);
  return { ...publicView(ctx, p), ads: adContent(p, lookup), recentUsages: recent, usageByDay: byDay };
}

// ---------------------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------------------

export function createPromotion(ctx: Ctx, tenantId: string, actorUserId: string | null, input: unknown): Promotion {
  const d = promotionInputSchema.parse(input);
  const now = iso(ctx.now());
  const id = newId();
  const draft = { rules: d.rules, limits: d.limits, stackable: d.stackable, inventoryInitial: d.inventoryInitial, benefit: d.benefit, benefits: d.benefits, name: d.name };
  const lookup = stationNameLookup(ctx, tenantId);
  const restrictionsText = d.restrictionsText ?? restrictions(draft, lookup).join('\n');
  const terms = d.termsText ?? termsText(draft, lookup);
  run(ctx.db,
    `INSERT INTO promotions (id, tenant_id, campaign_id, name, type, objective, status, priority, stackable, excludes_json, rules_json, benefit_json, benefits_json, limits_json, inventory_initial, inventory_used, exhausted_at, partner_id, restrictions_text, terms_text, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, tenantId, d.campaignId, d.name, d.type, d.objective, d.status, d.priority, d.stackable ? 1 : 0, JSON.stringify(d.excludes), JSON.stringify(d.rules), JSON.stringify(d.benefit),
    JSON.stringify(d.benefits), JSON.stringify(d.limits), d.inventoryInitial, 0, null, d.partnerId, restrictionsText, terms, now, now);
  audit(ctx, tenantId, actorUserId, 'promotion.create', 'promotion', id, { name: d.name, type: d.type });
  return getPromotion(ctx, tenantId, id);
}

export function updatePromotion(ctx: Ctx, tenantId: string, actorUserId: string | null, id: string, patch: Record<string, unknown>): Promotion {
  const current = getPromotion(ctx, tenantId, id);
  const merged = promotionInputSchema.parse({
    campaignId: current.campaignId, name: current.name, type: current.type, objective: current.objective, status: current.status, priority: current.priority,
    stackable: current.stackable, excludes: current.excludes, rules: current.rules, benefit: current.benefit, benefits: current.benefits ?? [], limits: current.limits, inventoryInitial: current.inventoryInitial,
    partnerId: current.partnerId, ...patch,
  });
  const lookup = stationNameLookup(ctx, tenantId);
  const regen = patch.rules !== undefined || patch.limits !== undefined || patch.stackable !== undefined || patch.benefit !== undefined || patch.benefits !== undefined || patch.inventoryInitial !== undefined;
  const restrictionsText = typeof patch.restrictionsText === 'string' ? patch.restrictionsText : regen ? restrictions(merged, lookup).join('\n') : current.restrictionsText;
  const terms = typeof patch.termsText === 'string' ? patch.termsText : regen ? termsText(merged, lookup) : current.termsText;
  let status = merged.status;
  if (merged.inventoryInitial !== null && current.inventoryUsed >= merged.inventoryInitial) status = 'exhausted';
  else if (current.status === 'exhausted' && (merged.inventoryInitial === null || current.inventoryUsed < merged.inventoryInitial) && patch.status === undefined) status = 'active';
  run(ctx.db,
    `UPDATE promotions SET campaign_id=?, name=?, type=?, objective=?, status=?, priority=?, stackable=?, excludes_json=?, rules_json=?, benefit_json=?, benefits_json=?, limits_json=?, inventory_initial=?, partner_id=?, restrictions_text=?, terms_text=?, updated_at=? WHERE id=?`,
    merged.campaignId, merged.name, merged.type, merged.objective, status, merged.priority, merged.stackable ? 1 : 0, JSON.stringify(merged.excludes), JSON.stringify(merged.rules), JSON.stringify(merged.benefit),
    JSON.stringify(merged.benefits), JSON.stringify(merged.limits), merged.inventoryInitial, merged.partnerId, restrictionsText, terms, iso(ctx.now()), id);
  audit(ctx, tenantId, actorUserId, 'promotion.update', 'promotion', id, patch);
  return getPromotion(ctx, tenantId, id);
}

export function listCampaigns(ctx: Ctx, tenantId: string) {
  const rows = all<Record<string, unknown>>(ctx.db, 'SELECT * FROM campaigns WHERE tenant_id = ? ORDER BY starts_at DESC', tenantId);
  return rows.map((c) => {
    const promos = all<PromotionRow>(ctx.db, 'SELECT * FROM promotions WHERE campaign_id = ? ORDER BY priority DESC', c.id as string).map(rowToPromotion);
    const usage = one<{ n: number; cost: number | null; members: number }>(ctx.db, 'SELECT COUNT(*) AS n, SUM(cost_cents) AS cost, COUNT(DISTINCT membership_id) AS members FROM promotion_usages u JOIN promotions p ON p.id = u.promotion_id WHERE p.campaign_id = ?', c.id as string);
    return {
      id: c.id, name: c.name, description: c.description, objective: c.objective, objectiveLabel: OBJECTIVE_LABELS[c.objective as keyof typeof OBJECTIVE_LABELS] ?? c.objective,
      status: c.status, startsAt: c.starts_at, endsAt: c.ends_at, budgetCents: c.budget_cents, createdAt: c.created_at,
      promotions: promos.map((p) => ({ id: p.id, name: p.name, type: p.type, typeLabel: PROMO_TYPE_LABELS[p.type], status: p.status, stackable: p.stackable, priority: p.priority, inventory: inventoryView(p.inventoryInitial, p.inventoryUsed, p.exhaustedAt), condition: conditionSentence(p.rules, p.rules.tiers?.length ? p.rules.tiers[p.rules.tiers.length - 1].benefit : p.benefit) })),
      usage: { uses: usage?.n ?? 0, costCents: usage?.cost ?? 0, members: usage?.members ?? 0 },
    };
  });
}

export function createCampaign(ctx: Ctx, tenantId: string, actorUserId: string | null, input: unknown) {
  const d = campaignInputSchema.parse(input);
  if (d.endsAt < d.startsAt) throw unprocessable('CAMPAIGN_DATES', 'La fecha final debe ser posterior a la inicial.');
  const id = newId();
  run(ctx.db, 'INSERT INTO campaigns (id, tenant_id, name, description, objective, status, starts_at, ends_at, budget_cents, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, tenantId, d.name, d.description, d.objective, d.status, d.startsAt, d.endsAt, d.budgetCents, iso(ctx.now()));
  audit(ctx, tenantId, actorUserId, 'campaign.create', 'campaign', id, { name: d.name });
  return listCampaigns(ctx, tenantId).find((c) => c.id === id)!;
}

export function updateCampaign(ctx: Ctx, tenantId: string, actorUserId: string | null, id: string, patch: Record<string, unknown>) {
  const c = one<Record<string, unknown>>(ctx.db, 'SELECT * FROM campaigns WHERE tenant_id = ? AND id = ?', tenantId, id);
  if (!c) throw notFound('CAMPAIGN_NOT_FOUND', 'No encontramos esa campaña.');
  const merged = campaignInputSchema.parse({ name: c.name, description: c.description, objective: c.objective, status: c.status, startsAt: c.starts_at, endsAt: c.ends_at, budgetCents: c.budget_cents, ...patch });
  run(ctx.db, 'UPDATE campaigns SET name=?, description=?, objective=?, status=?, starts_at=?, ends_at=?, budget_cents=? WHERE id=?', merged.name, merged.description, merged.objective, merged.status, merged.startsAt, merged.endsAt, merged.budgetCents, id);
  // Pausar o terminar una campaña arrastra a sus promociones; activarla solo reactiva las pausadas.
  if (patch.status === 'paused' || patch.status === 'ended') run(ctx.db, `UPDATE promotions SET status = ? WHERE campaign_id = ? AND status IN ('active','paused')`, patch.status, id);
  if (patch.status === 'active') run(ctx.db, `UPDATE promotions SET status = 'active' WHERE campaign_id = ? AND status = 'paused'`, id);
  audit(ctx, tenantId, actorUserId, 'campaign.update', 'campaign', id, patch);
  return listCampaigns(ctx, tenantId).find((x) => x.id === id)!;
}

// ---------------------------------------------------------------------------------------
// Evaluación y aplicación en la venta
// ---------------------------------------------------------------------------------------

export function activePromotions(ctx: Ctx, tenantId: string): Promotion[] {
  return all<PromotionRow>(ctx.db, `SELECT * FROM promotions WHERE tenant_id = ? AND status = 'active'`, tenantId).map(rowToPromotion);
}

function dayBounds(at: Date): { from: string; to: string } {
  const start = new Date(at); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: iso(start), to: iso(end) };
}

export function usageCounts(ctx: Ctx, p: Promotion, membershipId: string, at: Date): UsageCounts {
  const { from, to } = dayBounds(at);
  const monthStart = iso(new Date(at.getFullYear(), at.getMonth(), 1));
  const weekStart = iso(new Date(at.getTime() - 7 * 86_400_000));
  const row = one<{ total: number; byc: number; today: number; month: number; week: number }>(ctx.db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN membership_id = ? THEN 1 ELSE 0 END) AS byc,
            SUM(CASE WHEN membership_id = ? AND created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN membership_id = ? AND created_at >= ? THEN 1 ELSE 0 END) AS month,
            SUM(CASE WHEN membership_id = ? AND created_at >= ? THEN 1 ELSE 0 END) AS week
     FROM promotion_usages WHERE promotion_id = ?`, membershipId, membershipId, from, to, membershipId, monthStart, membershipId, weekStart, p.id);
  const periodTriggered = p.rules.visitsInPeriod ? (p.rules.visitsInPeriod.period === 'week' ? (row?.week ?? 0) > 0 : (row?.month ?? 0) > 0) : false;
  return { total: row?.total ?? 0, byCustomer: row?.byc ?? 0, today: row?.today ?? 0, thisMonth: row?.month ?? 0, periodTriggered };
}

export function evaluateForSale(ctx: Ctx, tenantId: string, saleCtx: SaleContext, basePoints: number): EvaluationResult {
  const program = loadProgram(ctx, tenantId);
  const promotions = activePromotions(ctx, tenantId);
  return evaluate({ promotions, ctx: saleCtx, program, basePoints, usage: (id) => usageCounts(ctx, promotions.find((p) => p.id === id)!, saleCtx.membershipId, saleCtx.at), maxPerTransaction: program.maxPromosPerTransaction ?? DEFAULT_PROGRAM.maxPromosPerTransaction });
}

export interface DeliveredBenefit extends AppliedBenefit { couponCode: string | null; walletMovementId: string | null; scratchCardId: string | null }

/**
 * Entrega los beneficios de una evaluación dentro de la transacción de la venta: registra el uso,
 * descuenta existencias, acredita puntos y dinero virtual, emite cupones y tarjetas.
 */
export function deliverBenefits(ctx: Ctx, args: { tenantId: string; membershipId: string; saleId: string; stationId: string; actorUserId: string | null; evaluation: EvaluationResult; fuelCents: number; at: Date }): DeliveredBenefit[] {
  const { tenantId, membershipId, saleId, stationId, actorUserId, evaluation, at } = args;
  const program = loadProgram(ctx, tenantId);
  const now = iso(ctx.now());
  const delivered: DeliveredBenefit[] = [];
  const recorded = new Map<string, { usageId: string; cost: number }>();
  for (const a of evaluation.applied) {
    const p = getPromotion(ctx, tenantId, a.promotionId);
    let couponCodeOut: string | null = null; let walletMovementId: string | null = null; let scratchCardId: string | null = null;
    if (a.points > 0) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        newId(), tenantId, membershipId, 'earn', a.points, saleId, actorUserId, `Promoción: ${p.name}`, now);
      run(ctx.db, 'UPDATE memberships SET points_balance = points_balance + ? WHERE id = ?', a.points, membershipId);
    }
    if (a.walletCents > 0) {
      const mv = wallet.credit(ctx, {
        tenantId, membershipId, amountCents: a.walletCents, sourceType: a.benefit.type === 'cashback_percent' ? 'cashback' : 'promotion', promotionId: p.id, stationId, saleId,
        expiresDays: a.benefit.walletExpiresDays ?? 30, note: p.name,
        minPurchaseCents: a.benefit.minNextPurchaseCents ?? 0, scope: a.benefit.scope ?? 'any', singleUse: !!a.benefit.singleUse,
      });
      walletMovementId = mv.id;
    }
    if (a.benefit.type === 'partner_coupon' && a.benefit.partnerBenefitId) {
      const c = issuePartnerCoupon(ctx, tenantId, a.benefit.partnerBenefitId, membershipId, saleId, p.id, a.benefit.couponDays ?? 14);
      couponCodeOut = c.code;
    } else if (a.benefit.type === 'coupon' || a.benefit.type === 'product' || a.benefit.type === 'two_for_one') {
      const code = couponCode('PR');
      const days = a.benefit.couponDays ?? 30;
      run(ctx.db, 'INSERT INTO coupons (id, tenant_id, membership_id, code, kind, value_cents, status, valid_from, valid_until, max_uses, uses, label, promotion_id, partner_benefit_id, sale_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        newId(), tenantId, membershipId, code, a.benefit.type, a.benefit.amountCents ?? 0, 'issued', now, iso(new Date(at.getTime() + days * 86_400_000)), 1, 0, a.benefit.label ?? p.name, p.id, null, saleId);
      couponCodeOut = code;
    }
    if (a.benefit.type === 'scratch') {
      const card = issueCardForSale(ctx, { ...program, scratch: { ...program.scratch, enabled: true, minFuelCents: 0 } }, tenantId, membershipId, saleId, args.fuelCents, at);
      scratchCardId = card?.id ?? null;
    }
    // Un uso por promoción y venta, aunque entregue varios beneficios; el costo se acumula.
    const prev = recorded.get(p.id);
    if (prev) {
      run(ctx.db, 'UPDATE promotion_usages SET cost_cents = ? WHERE id = ?', prev.cost + a.costCents, prev.usageId);
      prev.cost += a.costCents;
    } else {
      const usageId = newId();
      run(ctx.db, 'INSERT INTO promotion_usages (id, tenant_id, promotion_id, membership_id, sale_id, station_id, benefit_json, cost_cents, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        usageId, tenantId, p.id, membershipId, saleId, stationId, JSON.stringify({ ...a.benefit, points: a.points, walletCents: a.walletCents, discountCents: a.discountCents, couponCode: couponCodeOut, personal: a.personal ?? null }), a.costCents, now);
      recorded.set(p.id, { usageId, cost: a.costCents });
      // El contador de usos se lleva siempre; el agotamiento solo aplica cuando hay existencias definidas.
      const used = p.inventoryUsed + 1;
      run(ctx.db, 'UPDATE promotions SET inventory_used = ?, status = CASE WHEN inventory_initial IS NOT NULL AND ? >= inventory_initial THEN ? ELSE status END, exhausted_at = CASE WHEN inventory_initial IS NOT NULL AND ? >= inventory_initial THEN COALESCE(exhausted_at, ?) ELSE exhausted_at END, updated_at = ? WHERE id = ?',
        used, used, 'exhausted', used, now, now, p.id);
    }
    delivered.push({ ...a, couponCode: couponCodeOut, walletMovementId, scratchCardId });
  }
  return delivered;
}

/** Al anular una venta: retira usos, devuelve existencias y cancela cupones emitidos por ella. */
export function reverseForSale(ctx: Ctx, tenantId: string, saleId: string): void {
  const usages = all<{ id: string; promotion_id: string }>(ctx.db, 'SELECT id, promotion_id FROM promotion_usages WHERE tenant_id = ? AND sale_id = ?', tenantId, saleId);
  for (const u of usages) {
    run(ctx.db, 'DELETE FROM promotion_usages WHERE id = ?', u.id);
    run(ctx.db, `UPDATE promotions SET inventory_used = MAX(0, inventory_used - 1), status = CASE WHEN status = 'exhausted' AND inventory_initial IS NOT NULL AND inventory_used - 1 < inventory_initial THEN 'active' ELSE status END, exhausted_at = CASE WHEN status = 'exhausted' AND inventory_initial IS NOT NULL AND inventory_used - 1 < inventory_initial THEN NULL ELSE exhausted_at END WHERE id = ? AND inventory_initial IS NOT NULL`, u.promotion_id);
    run(ctx.db, `UPDATE promotions SET inventory_used = MAX(0, inventory_used - 1) WHERE id = ? AND inventory_initial IS NULL AND inventory_used > 0`, u.promotion_id);
  }
  run(ctx.db, `UPDATE coupons SET status = 'cancelled' WHERE tenant_id = ? AND sale_id = ? AND status = 'issued'`, tenantId, saleId);
  run(ctx.db, `UPDATE partner_benefits SET inventory_used = MAX(0, inventory_used - (SELECT COUNT(*) FROM coupons c WHERE c.partner_benefit_id = partner_benefits.id AND c.sale_id = ? AND c.status = 'cancelled')) WHERE tenant_id = ?`, saleId, tenantId);
}

/**
 * Promociones visibles para un cliente en su portal, con progreso hacia el siguiente beneficio.
 * No requiere una compra: se evalúa la elegibilidad estática (estación, tipo, segmento, vigencia)
 * y se calcula el avance de frecuencia, consumo mensual y escalones.
 */
export function availableForMember(ctx: Ctx, tenantId: string, membershipId: string, segments: string[], stats: { visitsThisMonth: number; visitsThisWeek: number; monthlyCents: number; homeStationId: string | null; customerType: string; vehicleKinds?: string[]; avgTicketCents?: number; recentVisits?: Array<{ at: string; fuelCents: number; storeCents: number }>; visits30?: number }) {
  const at = ctx.now(); const atIso = iso(at);
  const program = loadProgram(ctx, tenantId);
  const recent = stats.recentVisits ?? [];
  const lookup = stationNameLookup(ctx, tenantId);
  const home = stats.homeStationId ? one<{ state: string | null; city: string | null }>(ctx.db, 'SELECT state, city FROM stations WHERE id = ?', stats.homeStationId) : undefined;
  const out: Array<Record<string, unknown>> = [];
  for (const p of activePromotions(ctx, tenantId)) {
    const r = p.rules;
    if (r.startsAt && atIso < r.startsAt) continue;
    if (r.endsAt && atIso > r.endsAt) continue;
    if (r.customerTypes?.length && !r.customerTypes.includes(stats.customerType as never)) continue;
    // Si la promoción es para cierto tipo de vehículo, el cliente debe tener registrada una placa de ese tipo.
    if (r.vehicleKinds?.length && !(stats.vehicleKinds ?? []).some((k) => r.vehicleKinds!.includes(k as never))) continue;
    if (r.segments?.length && !r.segments.some((s) => segments.includes(s))) continue;
    if (r.states?.length && home?.state && !r.states.includes(home.state)) continue;
    if (r.cities?.length && home?.city && !r.cities.includes(home.city)) continue;
    const nearby = !r.stationIds?.length || (stats.homeStationId ? r.stationIds.includes(stats.homeStationId) : true);
    const usage = usageCounts(ctx, p, membershipId, at);
    let progress: { text: string; current: number; target: number; unit: 'cents' | 'visits'; deadline?: string } | null = null;
    let ladder: Array<{ minAmountCents: number; label: string }> | null = null;
    let personal: ReturnType<typeof personalOffer> | null = null;
    const topBenefit = r.tiers?.length ? [...r.tiers].sort((a, b) => b.minAmountCents - a.minAmountCents)[0].benefit : p.benefit;
    if (r.tiers?.length) ladder = [...r.tiers].sort((a, b) => a.minAmountCents - b.minAmountCents).map((t) => ({ minAmountCents: t.minAmountCents, label: describeBenefitPublic(t.benefit) }));
    if (r.personalized) {
      personal = personalOffer(r.personalized, stats.avgTicketCents ?? 0, stats.visits30 ?? 0, program);
      progress = { text: `Tu meta personal: carga $${(personal.targetCents / 100).toLocaleString('es-MX')} y recibe $${(personal.amountCents / 100).toLocaleString('es-MX')} para tu próxima visita (válido ${personal.validDays} días).`, current: 0, target: personal.targetCents, unit: 'cents' };
    } else if (r.returnStreak) {
      const pseudo = { at, fuelCents: r.returnStreak.minFuelCents ?? 0, recentVisits: recent } as Parameters<typeof returnStreak>[0];
      const k = returnStreak(pseudo, r.returnStreak.withinDays, r.returnStreak.minFuelCents ?? 0);
      const last = recent.find((v) => v.fuelCents >= (r.returnStreak!.minFuelCents ?? 0));
      const deadline = last ? new Date(new Date(last.at).getTime() + r.returnStreak.withinDays * 86_400_000).toISOString() : undefined;
      const nextAmount = r.returnStreak.rewardsCents[Math.min(k, r.returnStreak.rewardsCents.length - 1)];
      progress = { text: deadline && deadline > atIso ? `Regresa antes del ${deadline.slice(0, 10)} y recibe $${(nextAmount / 100).toLocaleString('es-MX')} de dinero virtual (regreso ${k + 1}).` : `Carga hoy y regresa en ${r.returnStreak.withinDays} días para empezar la cadena: $${(r.returnStreak.rewardsCents[0] / 100).toLocaleString('es-MX')} en tu primer regreso.`, current: Math.min(k, r.returnStreak.rewardsCents.length), target: r.returnStreak.rewardsCents.length, unit: 'visits', deadline };
    } else if (r.returnWithinDays) {
      const last = recent.find((v) => v.fuelCents >= (r.returnWithinDays!.minPrevFuelCents ?? 0));
      const deadline = last ? new Date(new Date(last.at).getTime() + r.returnWithinDays.days * 86_400_000).toISOString() : undefined;
      if (deadline && deadline > atIso) progress = { text: `Regresa antes del ${deadline.slice(0, 10)}${r.minFuelCents ? ` con una carga de $${(r.minFuelCents / 100).toLocaleString('es-MX')} o más` : ''} y recibe ${describeBenefitPublic(p.benefit)}.`, current: 1, target: 2, unit: 'visits', deadline };
    } else if (r.visitsInPeriod && !usage.periodTriggered) {
      const min = r.visitsInPeriod.qualifyingMinFuelCents ?? 0;
      const from = r.visitsInPeriod.period === 'month' ? new Date(at.getFullYear(), at.getMonth(), 1) : new Date(at.getTime() - 7 * 86_400_000);
      const cur = min ? recent.filter((v) => new Date(v.at) >= from && v.fuelCents >= min).length : r.visitsInPeriod.period === 'week' ? stats.visitsThisWeek : stats.visitsThisMonth;
      progress = { text: `Llevas ${cur} de ${r.visitsInPeriod.count} cargas${min ? ` de $${(min / 100).toLocaleString('es-MX')} o más` : ''}; te faltan ${Math.max(0, r.visitsInPeriod.count - cur)} para ${describeBenefitPublic(p.benefit)}.`, current: cur, target: r.visitsInPeriod.count, unit: 'visits' };
    } else if (r.minMonthlyCents) {
      progress = { text: `Llevas $${(stats.monthlyCents / 100).toLocaleString('es-MX')} de $${(r.minMonthlyCents / 100).toLocaleString('es-MX')} este mes; te faltan $${(Math.max(0, r.minMonthlyCents - stats.monthlyCents) / 100).toLocaleString('es-MX')} para ${describeBenefitPublic(p.benefit)}.`, current: Math.min(stats.monthlyCents, r.minMonthlyCents), target: r.minMonthlyCents, unit: 'cents' };
    }
    out.push({
      id: p.id, name: p.name, type: p.type, typeLabel: PROMO_TYPE_LABELS[p.type], objective: p.objective, campaignId: p.campaignId,
      condition: conditionSentence(r, topBenefit, p.benefits), benefitLabel: p.benefits?.length ? describeBenefit(topBenefit, p.benefits) : describeBenefitPublic(topBenefit), personal,
      startsAt: r.startsAt ?? null, endsAt: r.endsAt ?? null, endsSoon: !!r.endsAt && new Date(r.endsAt).getTime() - at.getTime() < 7 * 86_400_000,
      stationNames: (r.stationIds ?? []).map((id) => lookup(id) ?? id), nearby,
      restrictions: p.restrictionsText ? p.restrictionsText.split('\n').filter(Boolean) : restrictions(p, lookup),
      inventory: inventoryView(p.inventoryInitial, p.inventoryUsed, p.exhaustedAt),
      usedByMe: usage.byCustomer, progress, ladder,
      minFuelCents: r.minFuelCents ?? null, minLitersMl: r.minLitersMl ?? null,
    });
  }
  return out.sort((a, b) => Number(b.nearby) - Number(a.nearby) || Number(!!b.progress) - Number(!!a.progress));
}

function describeBenefitPublic(b: Promotion['benefit']): string {
  const pesos = (c: number) => `$${(c / 100).toLocaleString('es-MX')}`;
  switch (b.type) {
    case 'points': return `${b.points} puntos`;
    case 'points_multiplier': return `puntos ×${b.multiplier ?? 2}`;
    case 'virtual_money': return `${pesos(b.amountCents ?? 0)} de dinero virtual`;
    case 'cashback_percent': return `${b.percent}% de cashback`;
    case 'discount_per_liter': return `${b.centsPerLiter}¢ de descuento por litro`;
    case 'discount_percent': return `${b.percent}% de descuento`;
    case 'discount_fixed': return `${pesos(b.amountCents ?? 0)} de descuento`;
    case 'two_for_one': return `2x1 en ${b.label ?? 'producto'}`;
    case 'scratch': return 'una tarjeta Rasca y Gana';
    default: return b.label ?? 'un cupón';
  }
}

/** Cupones vigentes o recientes de un cliente. */
export function couponsFor(ctx: Ctx, tenantId: string, membershipId: string) {
  const now = iso(ctx.now());
  run(ctx.db, `UPDATE coupons SET status = 'expired' WHERE tenant_id = ? AND membership_id = ? AND status = 'issued' AND valid_until < ?`, tenantId, membershipId, now);
  return all<Record<string, unknown>>(ctx.db,
    `SELECT c.id, c.code, c.kind, c.value_cents, c.status, c.valid_from, c.valid_until, c.label, c.promotion_id, c.partner_benefit_id, c.redeemed_at, p.name AS promotion_name, pa.name AS partner_name
     FROM coupons c LEFT JOIN promotions p ON p.id = c.promotion_id LEFT JOIN partner_benefits pb ON pb.id = c.partner_benefit_id LEFT JOIN partners pa ON pa.id = pb.partner_id
     WHERE c.tenant_id = ? AND c.membership_id = ? AND (c.status = 'issued' OR c.valid_until >= ?) ORDER BY c.status = 'issued' DESC, c.valid_until`, tenantId, membershipId, iso(new Date(ctx.now().getTime() - 30 * 86_400_000)))
    .map((c) => ({ id: c.id, code: c.code, kind: c.kind, valueCents: c.value_cents, status: c.status, validFrom: c.valid_from, validUntil: c.valid_until, label: c.label, promotionName: c.promotion_name, partnerName: c.partner_name, redeemedAt: c.redeemed_at }));
}

/** Marca un cupón como canjeado (en caja, tienda o asociado). */
export function redeemCoupon(ctx: Ctx, tenantId: string, actorUserId: string | null, code: string, saleId: string | null) {
  const c = one<{ id: string; status: string; valid_until: string; membership_id: string; label: string | null; value_cents: number }>(ctx.db, 'SELECT * FROM coupons WHERE tenant_id = ? AND code = ?', tenantId, code.trim().toUpperCase());
  if (!c) throw notFound('COUPON_NOT_FOUND', 'No encontramos ese cupón.');
  if (c.status !== 'issued') throw unprocessable('COUPON_STATE', `El cupón está en estado ${c.status}.`);
  if (c.valid_until < iso(ctx.now())) { run(ctx.db, `UPDATE coupons SET status = 'expired' WHERE id = ?`, c.id); throw unprocessable('COUPON_EXPIRED', 'El cupón venció.'); }
  run(ctx.db, `UPDATE coupons SET status = 'redeemed', uses = uses + 1, redeemed_at = ?, redeemed_sale_id = ? WHERE id = ?`, iso(ctx.now()), saleId, c.id);
  audit(ctx, tenantId, actorUserId, 'coupon.redeem', 'coupon', c.id);
  return { couponId: c.id, label: c.label, valueCents: c.value_cents, membershipId: c.membership_id };
}
