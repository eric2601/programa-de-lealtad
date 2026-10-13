import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { evaluate } from '../src/promo/engine.js';
import { generateProposals } from '../src/promo/generator.js';
import { adContent, restrictions, termsText } from '../src/promo/terms.js';
import type { Promotion, SaleContext } from '../src/promo/types.js';
import { DEFAULT_PROGRAM } from '../src/rules.js';
import { dashboard, evaluateCampaign } from '../src/services/analytics.js';
import { portalView, type CustomerRow } from '../src/services/customers.js';
import { run_ as runNotifications } from '../src/services/notifications.js';
import { createBenefit, createPartner } from '../src/services/partners.js';
import { createCampaign, createPromotion, listPromotions, redeemCoupon } from '../src/services/promotions.js';
import { previewSale, registerSale, voidSale } from '../src/services/sales.js';
import * as wallet from '../src/services/wallet.js';
import { luis, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });

const ana = '5544334317';
const anaCustomer = () => one<CustomerRow>(w.ctx.db, 'SELECT * FROM customers WHERE phone_e164 = ?', '+525544334317')!;
const anaMembership = () => one<{ id: string }>(w.ctx.db, `SELECT id FROM memberships WHERE tenant_id = 'demo' AND customer_id = ?`, anaCustomer().id)!.id;

function promo(over: Partial<Promotion>): Promotion {
  return {
    id: over.id ?? 'p', tenantId: 'demo', campaignId: null, name: over.name ?? 'Promo', type: 'puntos', objective: 'ticket_promedio', status: 'active', priority: 0, stackable: true,
    excludes: [], rules: {}, benefit: { type: 'points', points: 10 }, limits: {}, inventoryInitial: null, inventoryUsed: 0, exhaustedAt: null, partnerId: null,
    restrictionsText: '', termsText: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
  };
}
const baseCtx: SaleContext = {
  tenantId: 'demo', membershipId: 'm', customerType: 'particular', segments: ['frecuente'], stationId: 'st-centro', state: 'Guanajuato', city: 'León',
  fuelType: 'regular', litersMl: 30_000, fuelCents: 71_670, storeCents: 0, totalCents: 71_670, paymentMethod: 'efectivo', at: new Date(2026, 8, 8, 15, 0),
  visitsThisMonth: 2, visitsThisWeek: 1, monthlyCents: 150_000, lifetimeCents: 900_000,
};
const noUsage = () => ({ total: 0, byCustomer: 0, today: 0, thisMonth: 0, periodTriggered: false });

describe('motor de reglas', () => {
  it('aplica el escalón más alto alcanzado y sugiere el siguiente', () => {
    const p = promo({ id: 'esc', type: 'escalonada', rules: { tiers: [
      { minAmountCents: 40_000, benefit: { type: 'points', points: 10 } }, { minAmountCents: 50_000, benefit: { type: 'points', points: 20 } },
      { minAmountCents: 60_000, benefit: { type: 'virtual_money', amountCents: 2_000 } }, { minAmountCents: 80_000, benefit: { type: 'virtual_money', amountCents: 5_000 } },
    ] } });
    const r = evaluate({ promotions: [p], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].walletCents).toBe(2_000);
    expect(r.hints[0].text).toMatch(/Te faltan \$83\.30 para obtener \$50 de dinero virtual/);
  });

  it('respeta horario, día, combustible, método de pago y tipo de cliente', () => {
    const p = promo({ id: 'martes', rules: { daysOfWeek: [2], hourFrom: 14, hourTo: 18, fuelTypes: ['regular'], minFuelCents: 70_000, paymentMethods: ['efectivo'], customerTypes: ['particular'] }, benefit: { type: 'virtual_money', amountCents: 3_000 } });
    const ok = evaluate({ promotions: [p], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(ok.applied[0].walletCents).toBe(3_000);
    const wrongHour = evaluate({ promotions: [p], ctx: { ...baseCtx, at: new Date(2026, 8, 8, 19, 0) }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(wrongHour.applied).toHaveLength(0);
    expect(wrongHour.skipped[0].reason).toBe('fuera de horario');
    const premium = evaluate({ promotions: [p], ctx: { ...baseCtx, fuelType: 'premium' }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(premium.skipped[0].reason).toBe('combustible no participante');
    const card = evaluate({ promotions: [p], ctx: { ...baseCtx, paymentMethod: 'tarjeta' }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(card.skipped[0].reason).toBe('método de pago no participante');
    const taxi = evaluate({ promotions: [p], ctx: { ...baseCtx, customerType: 'taxi' }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(taxi.skipped[0].reason).toBe('tipo de cliente no participante');
  });

  it('resuelve prioridad, acumulabilidad, exclusiones y máximo por transacción', () => {
    const a = promo({ id: 'a', name: 'A', priority: 10, stackable: true, benefit: { type: 'points', points: 5 } });
    const b = promo({ id: 'b', name: 'B', priority: 20, stackable: true, benefit: { type: 'points', points: 7 }, excludes: ['c'] });
    const c = promo({ id: 'c', name: 'C', priority: 15, stackable: true, benefit: { type: 'points', points: 9 } });
    const d = promo({ id: 'd', name: 'D', priority: 30, stackable: false, benefit: { type: 'points', points: 50 } });
    const r = evaluate({ promotions: [a, b, c], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(r.applied.map((x) => x.promotionId)).toEqual(['b', 'a']);
    expect(r.skipped.find((s) => s.promotionId === 'c')?.reason).toMatch(/excluida por "B"/);
    const r2 = evaluate({ promotions: [a, b, c, d], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(r2.applied.map((x) => x.promotionId)).toEqual(['d']);
    expect(r2.skipped.find((s) => s.promotionId === 'b')?.reason).toMatch(/no acumulable/);
    const r3 = evaluate({ promotions: [a, b, promo({ id: 'e', priority: 12 })], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 2 });
    expect(r3.applied).toHaveLength(2);
    expect(r3.skipped[0].reason).toMatch(/máximo 2/);
  });

  it('frecuencia: dispara en la N-ésima carga del periodo y una sola vez', () => {
    const p = promo({ id: 'f', rules: { visitsInPeriod: { count: 5, period: 'month' } }, benefit: { type: 'virtual_money', amountCents: 10_000 } });
    const four = evaluate({ promotions: [p], ctx: { ...baseCtx, visitsThisMonth: 4 }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(four.applied).toHaveLength(0);
    expect(four.hints[0].text).toMatch(/Llevas 4 de 5/);
    const five = evaluate({ promotions: [p], ctx: { ...baseCtx, visitsThisMonth: 5 }, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(five.applied[0].walletCents).toBe(10_000);
    const again = evaluate({ promotions: [p], ctx: { ...baseCtx, visitsThisMonth: 6 }, program: DEFAULT_PROGRAM, basePoints: 30, usage: () => ({ ...noUsage(), periodTriggered: true }), maxPerTransaction: 3 });
    expect(again.applied).toHaveLength(0);
  });

  it('límites de uso, existencias y descuento máximo', () => {
    const p = promo({ id: 'l', limits: { maxPerDay: 1, maxUses: 100, maxDiscountCents: 1_000 }, benefit: { type: 'discount_percent', percent: 10 }, inventoryInitial: 100, inventoryUsed: 100 });
    const r = evaluate({ promotions: [p], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(r.skipped[0].reason).toBe('existencias agotadas');
    const p2 = promo({ ...p, id: 'l2', inventoryUsed: 50 });
    const r2 = evaluate({ promotions: [p2], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: noUsage, maxPerTransaction: 3 });
    expect(r2.applied[0].discountCents).toBe(1_000);
    const r3 = evaluate({ promotions: [p2], ctx: baseCtx, program: DEFAULT_PROGRAM, basePoints: 30, usage: () => ({ ...noUsage(), today: 1 }), maxPerTransaction: 3 });
    expect(r3.skipped[0].reason).toBe('límite diario alcanzado');
  });
});

describe('términos, publicidad y generador', () => {
  it('genera restricciones y términos a partir de las reglas', () => {
    const p = promo({ name: 'Martes de Regular', rules: { fuelTypes: ['regular'], minFuelCents: 70_000, daysOfWeek: [2], hourFrom: 14, hourTo: 18, startsAt: '2026-09-01T12:00:00.000Z', endsAt: '2026-10-31T12:00:00.000Z' }, stackable: false, limits: { maxPerDay: 1 }, inventoryInitial: 500, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 30 } });
    const r = restrictions(p);
    expect(r.join(' ')).toMatch(/Aplica únicamente para gasolina Regular/);
    expect(r.join(' ')).toMatch(/Compra mínima de \$700 MXN/);
    expect(r.join(' ')).toMatch(/No acumulable/);
    expect(r.join(' ')).toMatch(/Máximo una promoción por cliente al día/);
    expect(r.join(' ')).toMatch(/hasta agotar existencias/);
    expect(termsText(p)).toMatch(/Vigencia del 1 de septiembre de 2026 al 31 de octubre de 2026/);
    const ads = adContent(p);
    expect(Object.keys(ads.formats)).toEqual(expect.arrayContaining(['app', 'web', 'banner', 'pantalla_surtidor', 'ticket', 'whatsapp', 'sms', 'email', 'facebook', 'instagram', 'tiktok', 'push', 'qr', 'cartel']));
    expect(ads.formats.whatsapp).toMatch(/BAJA/);
  });

  it('el generador propone promociones por objetivo con costo y KPI', () => {
    for (const objective of ['ticket_promedio', 'litros', 'frecuencia', 'clientes_nuevos', 'recuperar_inactivos', 'premium', 'diesel', 'tienda', 'servicios', 'fidelizar', 'pagos_digitales'] as const) {
      const props = generateProposals({ objective, fuelTypes: ['regular'], location: { states: ['Guanajuato'] } });
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) { expect(p.kpi).toBeTruthy(); expect(p.estimatedCostCents).toBeGreaterThanOrEqual(0); expect(p.condition).toBeTruthy(); }
    }
  });
});

describe('promociones en la venta', () => {
  it('entrega dinero virtual, cupón de asociado y puntos; el cliente lo ve en el portal y puede pagar con dinero virtual', () => {
    const partner = createPartner(w.ctx, 'demo', null, { name: 'Café La Isla', type: 'cafeteria' });
    const benefit = createBenefit(w.ctx, 'demo', null, partner.id, { name: 'Café americano gratis', valueCents: 3_500, codePrefix: 'CAFE', inventoryInitial: 500 });
    const camp = createCampaign(w.ctx, 'demo', null, { name: 'Mes del Cliente', objective: 'ticket_promedio', status: 'active', startsAt: '2026-09-01T06:00:00.000Z', endsAt: '2026-09-30T23:59:59.000Z' });
    createPromotion(w.ctx, 'demo', null, { campaignId: camp.id, name: 'Carga $500 → 50 puntos', type: 'puntos', objective: 'ticket_promedio', status: 'active', rules: { minFuelCents: 50_000 }, benefit: { type: 'points', points: 50 }, limits: { maxPerDay: 1 } });
    createPromotion(w.ctx, 'demo', null, { campaignId: camp.id, name: 'Carga $700 → $30 virtual', type: 'dinero_virtual', objective: 'ticket_promedio', status: 'active', rules: { minFuelCents: 70_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 30 }, limits: { maxPerDay: 1 } });
    createPromotion(w.ctx, 'demo', null, { campaignId: camp.id, name: 'Carga 30 L → café', type: 'asociados', objective: 'tienda', status: 'active', rules: { minLitersMl: 30_000 }, benefit: { type: 'partner_coupon', partnerBenefitId: benefit.id, label: 'Café americano gratis', amountCents: 3_500, couponDays: 7 }, inventoryInitial: 500, partnerId: partner.id });

    const preview = previewSale(w.ctx, luis, { phone: ana, posReference: 'PV', fuelType: 'regular', litersMl: 30_000, pricePerLiterCents: 2_389, storeCents: 0 });
    expect(preview.promotions.applied.map((a) => a.promotionName)).toEqual(expect.arrayContaining(['Carga $500 → 50 puntos', 'Carga $700 → $30 virtual', 'Carga 30 L → café']));
    expect(preview.walletEarnCents).toBe(3_000);

    const r = registerSale(w.ctx, luis, 'promo-sale', { phone: ana, posReference: 'MC-1', fuelType: 'regular', litersMl: 30_000, pricePerLiterCents: 2_389, storeCents: 0, source: 'manual' });
    expect(r.promotions.applied).toHaveLength(3);
    const coupon = r.promotions.applied.find((a) => a.couponCode);
    expect(coupon?.couponCode).toMatch(/^CAFE-/);
    expect(r.wallet.availableCents).toBe(3_000);
    expect(r.points.promo).toBe(50);
    const inv = listPromotions(w.ctx, 'demo').find((p) => p.name === 'Carga 30 L → café')!;
    expect(inv.inventory.used).toBe(1);
    expect(inv.inventory.remaining).toBe(499);

    const view = portalView(w.ctx, anaCustomer()).memberships[0];
    expect(view.wallet.availableCents).toBe(3_000);
    expect(view.coupons[0].code).toBe(coupon!.couponCode);
    expect(view.promotions.length).toBeGreaterThanOrEqual(3);

    // Paga $30 con dinero virtual en la siguiente carga y no acumula sobre esa parte.
    const r2 = registerSale(w.ctx, luis, 'wallet-sale', { phone: ana, posReference: 'MC-2', fuelType: 'regular', litersMl: 10_000, pricePerLiterCents: 2_389, storeCents: 0, walletSpendCents: 3_000, source: 'manual' });
    expect(r2.walletSpentCents).toBe(3_000);
    expect(r2.paidCents).toBe(23_890 - 3_000);
    expect(r2.points.fuel).toBe(8);
    expect(r2.wallet.availableCents).toBe(0);
    const redeemed = redeemCoupon(w.ctx, 'demo', 'u-luis', coupon!.couponCode!, r2.saleId);
    expect(redeemed.label).toBe('Café americano gratis');
    expect(() => redeemCoupon(w.ctx, 'demo', 'u-luis', coupon!.couponCode!, null)).toThrow(/estado redeemed/);
  });

  it('anular la venta revierte puntos de promoción, dinero virtual y existencias', () => {
    createPromotion(w.ctx, 'demo', null, { name: 'Carga $700 → $30 virtual', type: 'dinero_virtual', objective: 'ticket_promedio', status: 'active', rules: { minFuelCents: 70_000 }, benefit: { type: 'virtual_money', amountCents: 3_000 }, inventoryInitial: 10 });
    const before = one<{ points_balance: number }>(w.ctx.db, 'SELECT points_balance FROM memberships WHERE id = ?', anaMembership())!.points_balance;
    const r = registerSale(w.ctx, luis, 'void-promo', { phone: ana, posReference: 'VP-1', fuelType: 'regular', litersMl: 30_000, pricePerLiterCents: 2_389, storeCents: 0, source: 'manual' });
    expect(r.wallet.availableCents).toBe(3_000);
    const v = voidSale(w.ctx, luis, r.saleId, 'prueba');
    expect(v.balance).toBe(before);
    expect(wallet.availableCents(w.ctx, 'demo', anaMembership())).toBe(0);
    expect(listPromotions(w.ctx, 'demo')[0].inventory.used).toBe(0);
  });

  it('el dinero virtual expira y se gasta primero lo que vence antes', () => {
    const m = anaMembership();
    wallet.credit(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 2_000, sourceType: 'bonus', expiresDays: 5, note: 'vence pronto' });
    wallet.credit(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 5_000, sourceType: 'bonus', expiresDays: 40, note: 'vence tarde' });
    const s = wallet.spend(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 3_000, saleId: 'x', stationId: 'st-centro' });
    expect(s.amount_cents).toBe(3_000);
    const sum = wallet.summary(w.ctx, 'demo', m);
    expect(sum.availableCents).toBe(4_000);
    expect(sum.movements.find((x) => x.note === 'vence pronto')?.status).toBe('used');
    w.clock.now = new Date(w.clock.now.getTime() + 41 * 86_400_000);
    const later = wallet.summary(w.ctx, 'demo', m);
    expect(later.availableCents).toBe(0);
    expect(later.expiredCents).toBe(4_000);
    expect(later.usedCents).toBe(3_000);
  });

  it('el dashboard, la evaluación de campaña y las notificaciones responden con los datos de demostración', () => {
    const camp = createCampaign(w.ctx, 'demo', null, { name: 'Prueba', objective: 'litros', status: 'active', startsAt: new Date(w.clock.now.getTime() - 10 * 86_400_000).toISOString(), endsAt: new Date(w.clock.now.getTime() + 10 * 86_400_000).toISOString() });
    const d = dashboard(w.ctx, 'demo', new Date(w.clock.now.getTime() - 30 * 86_400_000).toISOString(), new Date(w.clock.now.getTime() + 86_400_000).toISOString());
    expect(d.kpis.transactions).toBeGreaterThan(0);
    expect(d.series.length).toBeGreaterThan(0);
    const e = evaluateCampaign(w.ctx, 'demo', camp.id);
    expect(e.verdict).toBe('sin_datos');
    const n = runNotifications(w.ctx, 'demo');
    expect(n.created).toBeGreaterThanOrEqual(0);
  });
});
