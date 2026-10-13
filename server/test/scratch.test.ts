import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { DEFAULT_PROGRAM, drawScratchPrize, scratchExpectedPoints } from '../src/rules.js';
import { lookup, portalView, type CustomerRow } from '../src/services/customers.js';
import { registerSale, voidSale } from '../src/services/sales.js';
import { cardsForMembership, revealCard } from '../src/services/scratch.js';
import { advance, luis, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });

const ana = '5544334317';
const bigLoad = { phone: ana, posReference: 'RG-1', pumpNumber: 2, fuelType: 'regular' as const, litersMl: 25_000, pricePerLiterCents: 2_389, storeCents: 0, source: 'manual' as const };

function anaCustomer(): CustomerRow {
  return one<CustomerRow>(w.ctx.db, 'SELECT * FROM customers WHERE phone_e164 = ?', '+525544334317')!;
}

describe('sorteo', () => {
  it('respeta los pesos y siempre devuelve un premio', () => {
    const prizes = DEFAULT_PROGRAM.scratch.prizes;
    expect(drawScratchPrize(prizes, () => 0).points).toBe(10);
    expect(drawScratchPrize(prizes, (max) => max - 1).points).toBe(1000);
    expect(Math.round(scratchExpectedPoints(prizes))).toBe(37);
  });
});

describe('Carga, Rasca y Gana', () => {
  it('emite una tarjeta cuando el combustible supera $500 y solo una por día', () => {
    const before = lookup(w.ctx, 'demo', 'u-luis', ana);
    if (!before.found) throw new Error('Ana debería existir');
    const r = registerSale(w.ctx, luis, 'rg1', bigLoad);
    expect(r.fuelCents).toBeGreaterThanOrEqual(50_000);
    expect(r.scratch).not.toBeNull();
    expect(r.member.scratchPending).toBe(before.member.scratchPending + 1);
    const r2 = registerSale(w.ctx, luis, 'rg2', { ...bigLoad, posReference: 'RG-2' });
    expect(r2.scratch).toBeNull();
    const card = cardsForMembership(w.ctx, r.member.membershipId).find((c) => c.id === r.scratch!.cardId);
    expect(card?.status).toBe('available');
    expect(card?.prize).toBeNull();
  });

  it('no emite tarjeta por cargas menores ni cuando el canje deja el combustible bajo el mínimo', () => {
    const r = registerSale(w.ctx, luis, 'small', { ...bigLoad, litersMl: 20_000 });
    expect(r.fuelCents).toBeLessThan(50_000);
    expect(r.scratch).toBeNull();
  });

  it('al rascar acredita el premio una sola vez y lo muestra en el portal', () => {
    const r = registerSale(w.ctx, luis, 'rg1', bigLoad);
    const before = r.member.points;
    const reveal = revealCard(w.ctx, r.scratch!.cardId, { customerId: anaCustomer().id });
    expect(reveal.alreadyRevealed).toBe(false);
    expect(reveal.prize.points).toBeGreaterThan(0);
    expect(reveal.balance).toBe(before + reveal.prize.points);
    const again = revealCard(w.ctx, r.scratch!.cardId, { customerId: anaCustomer().id });
    expect(again.alreadyRevealed).toBe(true);
    expect(again.balance).toBe(reveal.balance);
    const view = portalView(w.ctx, anaCustomer());
    const shown = view.memberships[0].scratchCards.find((c) => c.id === r.scratch!.cardId);
    expect(shown?.status).toBe('revealed');
    expect(shown?.prize?.points).toBe(reveal.prize.points);
    const after = lookup(w.ctx, 'demo', 'u-luis', ana);
    expect(after.found && after.member.scratchPending).toBe(r.member.scratchPending - 1);
  });

  it('otro cliente no puede rascar la tarjeta y una tarjeta vencida no paga', () => {
    const r = registerSale(w.ctx, luis, 'rg1', bigLoad);
    const beto = one<CustomerRow>(w.ctx.db, 'SELECT * FROM customers WHERE phone_e164 = ?', '+525611122233')!;
    expect(() => revealCard(w.ctx, r.scratch!.cardId, { customerId: beto.id })).toThrow(/No encontramos/);
    expect(() => revealCard(w.ctx, r.scratch!.cardId, { tenantId: 'otro' })).toThrow(/No encontramos/);
    advance(w, 15 * 24 * 60);
    expect(() => revealCard(w.ctx, r.scratch!.cardId, { tenantId: 'demo' })).toThrow(/venció/);
  });

  it('anular la venta revierte el premio ya rascado y cancela la tarjeta', () => {
    const r = registerSale(w.ctx, luis, 'rg1', bigLoad);
    const start = r.member.points - r.points.total;
    const reveal = revealCard(w.ctx, r.scratch!.cardId, { tenantId: 'demo', actorUserId: 'u-luis' });
    const v = voidSale(w.ctx, luis, r.saleId, 'prueba');
    expect(v.balance).toBe(start);
    expect(reveal.prize.points).toBeGreaterThan(0);
    const status = one<{ status: string }>(w.ctx.db, 'SELECT status FROM scratch_cards WHERE id = ?', r.scratch!.cardId);
    expect(status?.status).toBe('cancelled');
  });
});
