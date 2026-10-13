import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { evaluate, personalOffer, returnStreak } from '../src/promo/engine.js';
import type { Promotion, SaleContext } from '../src/promo/types.js';
import { DEFAULT_PROGRAM } from '../src/rules.js';
import { portalView, type CustomerRow } from '../src/services/customers.js';
import { createPromotion } from '../src/services/promotions.js';
import { previewSale, registerSale } from '../src/services/sales.js';
import * as wallet from '../src/services/wallet.js';
import { advance, luis, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });

const ana = '5544334317';
const anaCustomer = () => one<CustomerRow>(w.ctx.db, 'SELECT * FROM customers WHERE phone_e164 = ?', '+525544334317')!;
const anaMembership = () => one<{ id: string }>(w.ctx.db, `SELECT id FROM memberships WHERE tenant_id = 'demo' AND customer_id = ?`, anaCustomer().id)!.id;

function promo(over: Partial<Promotion>): Promotion {
  return {
    id: over.id ?? 'p', tenantId: 'demo', campaignId: null, name: over.name ?? 'Promo', type: 'dinero_virtual', objective: 'frecuencia', status: 'active', priority: 0, stackable: true,
    excludes: [], rules: {}, benefit: { type: 'virtual_money', amountCents: 3_000 }, limits: {}, inventoryInitial: null, inventoryUsed: 0, exhaustedAt: null, partnerId: null,
    restrictionsText: '', termsText: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
  };
}
const day = (n: number, at: Date) => new Date(at.getTime() - n * 86_400_000).toISOString();
const at = new Date(2026, 8, 8, 10, 0);
const base: SaleContext = {
  tenantId: 'demo', membershipId: 'm', customerType: 'particular', segments: [], stationId: 'st-centro', state: null, city: null,
  fuelType: 'regular', litersMl: 22_000, fuelCents: 52_558, storeCents: 0, totalCents: 52_558, paymentMethod: 'efectivo', at,
  visitsThisMonth: 2, visitsThisWeek: 1, monthlyCents: 100_000, lifetimeCents: 500_000, recentVisits: [], avgTicketCents: 45_000, storeItems: [],
};
const noUsage = () => ({ total: 0, byCustomer: 0, today: 0, thisMonth: 0, periodTriggered: false });
const run = (p: Promotion, ctx: SaleContext) => evaluate({ promotions: [p], ctx, program: DEFAULT_PROGRAM, basePoints: 20, usage: noUsage, maxPerTransaction: 3 });

describe('mecánicas de regreso', () => {
  it('3b: regresa en 5 días tras una carga de $400', () => {
    const p = promo({ id: 'r', rules: { minFuelCents: 40_000, returnWithinDays: { days: 5, minPrevFuelCents: 40_000 } } });
    expect(run(p, { ...base, recentVisits: [{ at: day(3, at), fuelCents: 42_000, storeCents: 0 }] }).applied).toHaveLength(1);
    expect(run(p, { ...base, recentVisits: [{ at: day(6, at), fuelCents: 42_000, storeCents: 0 }] }).skipped[0].reason).toMatch(/más de 5 días/);
    expect(run(p, { ...base, recentVisits: [{ at: day(2, at), fuelCents: 20_000, storeCents: 0 }] }).skipped[0].reason).toMatch(/sin visita previa/);
  });

  it('5: la cadena de regresos paga $30, $40 y $60 y se reinicia', () => {
    const p = promo({ id: 's', rules: { returnStreak: { withinDays: 7, rewardsCents: [3_000, 4_000, 6_000], minFuelCents: 50_000 } } });
    const first = run(p, base);
    expect(first.applied).toHaveLength(0);
    expect(first.hints[0].text).toMatch(/Regresa antes del/);
    const visits1 = [{ at: day(4, at), fuelCents: 52_000, storeCents: 0 }];
    expect(returnStreak({ ...base, recentVisits: visits1 }, 7, 50_000)).toBe(1);
    expect(run(p, { ...base, recentVisits: visits1 }).applied[0].walletCents).toBe(3_000);
    const visits2 = [{ at: day(4, at), fuelCents: 52_000, storeCents: 0 }, { at: day(9, at), fuelCents: 55_000, storeCents: 0 }];
    expect(run(p, { ...base, recentVisits: visits2 }).applied[0].walletCents).toBe(4_000);
    const visits4 = [{ at: day(3, at), fuelCents: 52_000, storeCents: 0 }, { at: day(8, at), fuelCents: 52_000, storeCents: 0 }, { at: day(13, at), fuelCents: 52_000, storeCents: 0 }, { at: day(18, at), fuelCents: 52_000, storeCents: 0 }];
    expect(run(p, { ...base, recentVisits: visits4 }).applied[0].walletCents).toBe(6_000);
    const broken = [{ at: day(10, at), fuelCents: 52_000, storeCents: 0 }];
    expect(run(p, { ...base, recentVisits: broken }).applied).toHaveLength(0);
  });

  it('8: solo cuentan las cargas de $500 o más', () => {
    const p = promo({ id: 't', rules: { visitsInPeriod: { count: 3, period: 'month', qualifyingMinFuelCents: 50_000 } }, benefit: { type: 'virtual_money', amountCents: 10_000 } });
    const month = (d: number) => new Date(2026, 8, d, 9).toISOString();
    const two = run(p, { ...base, recentVisits: [{ at: month(2), fuelCents: 51_000, storeCents: 0 }, { at: month(4), fuelCents: 30_000, storeCents: 0 }] });
    expect(two.applied).toHaveLength(0);
    expect(two.hints[0].text).toMatch(/Llevas 2 de 3 cargas de \$500 o más/);
    const three = run(p, { ...base, recentVisits: [{ at: month(2), fuelCents: 51_000, storeCents: 0 }, { at: month(5), fuelCents: 60_000, storeCents: 0 }] });
    expect(three.applied[0].walletCents).toBe(10_000);
  });

  it('6 y 7: tienda mínima y artículo requerido', () => {
    const p6 = promo({ id: 's6', rules: { minFuelCents: 50_000, minStoreCents: 10_000 }, benefit: { type: 'virtual_money', amountCents: 5_000 } });
    const r6 = run(p6, { ...base, storeCents: 4_000, totalCents: 56_558 });
    expect(r6.hints[0].text).toMatch(/Agrega \$60 en tienda/);
    expect(run(p6, { ...base, storeCents: 10_000, totalCents: 62_558 }).applied).toHaveLength(1);
    const p7 = promo({ id: 's7', rules: { minFuelCents: 50_000, requiresItems: ['cafe'] } });
    expect(run(p7, { ...base, storeCents: 3_500, totalCents: 56_058 }).hints[0].text).toMatch(/Agrega cafe/);
    expect(run(p7, { ...base, storeCents: 3_500, totalCents: 56_058, storeItems: ['cafe'] }).applied).toHaveLength(1);
  });

  it('10: la meta personal sube 10 % el ticket habitual y escala el beneficio', () => {
    const rule = { upliftPercent: 10, roundToCents: 5_000, minTargetCents: 40_000, maxTargetCents: 150_000, benefitTable: [{ targetCents: 50_000, amountCents: 3_000 }, { targetCents: 60_000, amountCents: 4_000 }, { targetCents: 70_000, amountCents: 6_000 }, { targetCents: 80_000, amountCents: 8_000 }, { targetCents: 150_000, amountCents: 10_000 }], minNextPurchasePercent: 90, validDays: 7 };
    expect(personalOffer(rule, 45_000, 4, DEFAULT_PROGRAM)).toMatchObject({ targetCents: 50_000, amountCents: 3_000, minNextPurchaseCents: 45_000 });
    expect(personalOffer(rule, 60_000, 4, DEFAULT_PROGRAM)).toMatchObject({ targetCents: 70_000, amountCents: 6_000 });
    expect(personalOffer(rule, 80_000, 4, DEFAULT_PROGRAM)).toMatchObject({ targetCents: 90_000, amountCents: 10_000 });
    const offer = personalOffer(rule, 45_000, 8, DEFAULT_PROGRAM);
    expect(offer.returnProbability).toBeGreaterThan(0.8);
    const p = promo({ id: 'pz', rules: { personalized: rule } });
    const below = run(p, { ...base, fuelCents: 47_000, avgTicketCents: 45_000 });
    expect(below.applied).toHaveLength(0);
    expect(below.hints[0].text).toMatch(/Tu meta personal: carga \$500 y recibe \$30/);
    const above = run(p, { ...base, fuelCents: 52_000, avgTicketCents: 45_000 });
    expect(above.applied[0].walletCents).toBe(3_000);
    expect(above.applied[0].benefit.minNextPurchaseCents).toBe(45_000);
    expect(above.applied[0].personal?.targetCents).toBe(50_000);
  });

  it('4: un beneficio dividido entrega dinero para combustible, dinero para tienda y cupones', () => {
    const p = promo({ id: 'd', rules: { minFuelCents: 50_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, scope: 'fuel' }, benefits: [{ type: 'virtual_money', amountCents: 3_000, scope: 'store' }, { type: 'coupon', label: 'Café ($20)', amountCents: 2_000 }, { type: 'coupon', label: 'Lavado ($20)', amountCents: 2_000 }] });
    const r = run(p, base);
    expect(r.applied).toHaveLength(4);
    expect(r.totalWalletCents).toBe(6_000);
    expect(r.applied.filter((a) => a.couponLabel)).toHaveLength(2);
  });
});

describe('dinero virtual con condiciones', () => {
  it('1: compra mínima siguiente, uso único y ámbito de tienda', () => {
    const m = anaMembership();
    wallet.credit(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 3_000, sourceType: 'promotion', expiresDays: 7, minPurchaseCents: 40_000, singleUse: true, note: 'para regresar' });
    wallet.credit(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 2_000, sourceType: 'promotion', expiresDays: 14, scope: 'store', note: 'tienda' });
    expect(wallet.availableCents(w.ctx, 'demo', m)).toBe(5_000);
    // Compra de $300 sin tienda: ningún abono aplica.
    expect(wallet.spendableCents(w.ctx, 'demo', m, { totalCents: 30_000, fuelCents: 30_000, storeCents: 0 })).toBe(0);
    // Compra de $450 con $50 de tienda: aplica el de $30 y hasta $20 en tienda.
    expect(wallet.spendableCents(w.ctx, 'demo', m, { totalCents: 45_000, fuelCents: 40_000, storeCents: 5_000 })).toBe(5_000);
    // Gastar solo $20 del abono de uso único pierde los $10 restantes.
    wallet.spend(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 2_000, saleId: 's1', stationId: 'st-centro', amounts: { totalCents: 45_000, fuelCents: 45_000, storeCents: 0 } });
    const s = wallet.summary(w.ctx, 'demo', m);
    expect(s.availableCents).toBe(2_000);
    expect(s.cancelledCents).toBe(1_000);
    expect(s.movements.find((x) => x.note === 'para regresar')?.conditions).toBe('compra mínima $400 · uso único');
  });

  it('la vista previa limita el dinero virtual utilizable según las condiciones y la venta lo respeta', () => {
    const m = anaMembership();
    wallet.credit(w.ctx, { tenantId: 'demo', membershipId: m, amountCents: 3_000, sourceType: 'promotion', expiresDays: 7, minPurchaseCents: 40_000, singleUse: true });
    const small = previewSale(w.ctx, luis, { phone: ana, posReference: 'PV', fuelType: 'regular', litersMl: 10_000, pricePerLiterCents: 2_389, storeCents: 0, walletSpendCents: 3_000 });
    expect(small.maxWalletSpendCents).toBe(0);
    expect(small.walletAvailableCents).toBe(3_000);
    expect(() => registerSale(w.ctx, luis, 'k-small', { phone: ana, posReference: 'S1', fuelType: 'regular', litersMl: 10_000, pricePerLiterCents: 2_389, storeCents: 0, walletSpendCents: 3_000, source: 'manual' })).toThrow(/utilizable/);
    const big = previewSale(w.ctx, luis, { phone: ana, posReference: 'PV', fuelType: 'regular', litersMl: 20_000, pricePerLiterCents: 2_389, storeCents: 0, walletSpendCents: 3_000 });
    expect(big.maxWalletSpendCents).toBe(3_000);
    const r = registerSale(w.ctx, luis, 'k-big', { phone: ana, posReference: 'S2', fuelType: 'regular', litersMl: 20_000, pricePerLiterCents: 2_389, storeCents: 0, walletSpendCents: 3_000, source: 'manual' });
    expect(r.walletSpentCents).toBe(3_000);
  });

  it('las 10 promociones creadas por la API se muestran al cliente con su progreso', () => {
    createPromotion(w.ctx, 'demo', null, { name: '5. Cadena', type: 'frecuencia', objective: 'frecuencia', status: 'active', rules: { returnStreak: { withinDays: 7, rewardsCents: [3_000, 4_000, 6_000], minFuelCents: 50_000 } }, benefit: { type: 'virtual_money', amountCents: 3_000 } });
    createPromotion(w.ctx, 'demo', null, { name: '10. Meta personal', type: 'volumen', objective: 'ticket_promedio', status: 'active', rules: { personalized: { benefitTable: [{ targetCents: 50_000, amountCents: 3_000 }, { targetCents: 150_000, amountCents: 10_000 }] } }, benefit: { type: 'virtual_money', amountCents: 3_000 } });
    createPromotion(w.ctx, 'demo', null, { name: '7. Café', type: 'combinada', objective: 'tienda', status: 'active', rules: { minFuelCents: 50_000, requiresItems: ['cafe'] }, benefit: { type: 'virtual_money', amountCents: 5_000, minNextPurchaseCents: 40_000 } });
    const view = portalView(w.ctx, anaCustomer()).memberships[0];
    const personal = view.promotions.find((p) => p.name === '10. Meta personal');
    expect(personal?.progress?.text).toMatch(/Tu meta personal: carga/);
    expect((personal?.personal as { targetCents: number }).targetCents).toBeGreaterThanOrEqual(40_000);
    const chain = view.promotions.find((p) => p.name === '5. Cadena');
    expect(chain?.progress?.text).toMatch(/Regresa antes del|regresa en 7 días/);
    const cafe = view.promotions.find((p) => p.name === '7. Café');
    expect(cafe?.restrictions.join(' ')).toMatch(/Requiere incluir cafe/);
    expect(cafe?.restrictions.join(' ')).toMatch(/compra posterior de \$400 MXN/);
    advance(w, 1);
  });
});
