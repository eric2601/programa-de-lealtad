import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { confirmOtp, lookup, startOtp } from '../src/services/customers.js';
import { confirm, prepare } from '../src/services/redemptions.js';
import { registerSale } from '../src/services/sales.js';
import { advance, lastCode, luis, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });

const ana = '5544334317';
const anaE164 = '+525544334317';

function balance(): number {
  const l = lookup(w.ctx, 'demo', 'u-luis', ana);
  if (!l.found) throw new Error('Ana no existe');
  return l.member.points;
}

describe('canje con código de un solo uso', () => {
  it('prepara, confirma y aplica en la venta sin acumular sobre lo canjeado', () => {
    const start = balance();
    expect(start).toBeGreaterThanOrEqual(200);
    const p = prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: 200 });
    expect(p.valueCents).toBe(2_000);
    const c = confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, lastCode(w.notifier, anaE164));
    expect(c.status).toBe('confirmed');
    const r = registerSale(w.ctx, luis, 'sale-with-redeem', {
      phone: ana, posReference: 'T-R1', fuelType: 'regular', litersMl: 35_200, pricePerLiterCents: 2_389, storeCents: 5_200, redemptionId: p.redemptionId, source: 'manual',
    });
    expect(r.rewardCents).toBe(2_000);
    expect(r.paidCents).toBe(84_093 + 5_200 - 2_000);
    expect(r.points.total).toBe(49);
    expect(r.member.points).toBe(start - 200 + 49);
    const status = one<{ status: string }>(w.ctx.db, 'SELECT status FROM redemptions WHERE id = ?', p.redemptionId);
    expect(status?.status).toBe('applied');
  });

  it('no permite doble gasto: dos reservas no pueden exceder el saldo', () => {
    const start = balance();
    const affordable = Math.floor(start / 100) * 100;
    prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: affordable });
    expect(() => prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: 100 })).toThrow(/insuficiente/);
  });

  it('bloquea después de tres códigos incorrectos', () => {
    const p = prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: 100 });
    const real = lastCode(w.notifier, anaE164);
    const wrong = real === '0000' ? '1111' : '0000';
    expect(() => confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, wrong)).toThrow(/incorrecto/);
    expect(() => confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, wrong)).toThrow(/incorrecto/);
    expect(() => confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, wrong)).toThrow(/canceló/);
    expect(() => confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, real)).toThrow(/cancelled/);
  });

  it('la reserva expira a los 10 minutos y libera el saldo', () => {
    const start = balance();
    const affordable = Math.floor(start / 100) * 100;
    const p = prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: affordable });
    advance(w, 11);
    expect(() => confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, lastCode(w.notifier, anaE164))).toThrow(/venció/);
    const again = prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: affordable });
    expect(again.redemptionId).not.toBe(p.redemptionId);
    const release = one<{ n: number }>(w.ctx.db, `SELECT COUNT(*) AS n FROM ledger_entries WHERE kind = 'release'`);
    expect(release?.n).toBe(1);
  });

  it('un canje confirmado no puede aplicarse a otro cliente ni exceder el total', () => {
    const p = prepare(w.ctx, 'demo', 'u-luis', { phone: ana, points: 200 });
    confirm(w.ctx, 'demo', 'u-luis', p.redemptionId, lastCode(w.notifier, anaE164));
    expect(() => registerSale(w.ctx, luis, 'x1', { phone: '5611122233', posReference: 'X1', storeCents: 5_000, redemptionId: p.redemptionId, source: 'manual' })).toThrow(/no corresponde/);
    expect(() => registerSale(w.ctx, luis, 'x2', { phone: ana, posReference: 'X2', storeCents: 1_000, redemptionId: p.redemptionId, source: 'manual' })).toThrow(/mayor que el total/);
  });

  it('exige teléfono verificado para canjear y la verificación funciona con código', () => {
    // Beto tiene 22 puntos; darle saldo primero.
    registerSale(w.ctx, luis, 'beto-big', { phone: '5611122233', posReference: 'BB', fuelType: 'regular', litersMl: 100_000, pricePerLiterCents: 2_389, storeCents: 0, source: 'manual' });
    expect(() => prepare(w.ctx, 'demo', 'u-luis', { phone: '5611122233', points: 100 })).toThrow(/confirmar su teléfono/);
    const ch = startOtp(w.ctx, '5611122233', 'verify');
    const r = confirmOtp(w.ctx, ch.challengeId, lastCode(w.notifier, '+525611122233'));
    expect(r.purpose).toBe('verify');
    expect(prepare(w.ctx, 'demo', 'u-luis', { phone: '5611122233', points: 100 }).points).toBe(100);
  });
});

describe('aislamiento y límites de consulta', () => {
  it('un número inexistente y uno de otro grupo responden igual', () => {
    expect(lookup(w.ctx, 'demo', 'u-luis', '5599999999')).toEqual({ found: false, blocked: false });
    expect(lookup(w.ctx, 'otro-grupo', 'u-x', ana)).toEqual({ found: false, blocked: false });
  });
  it('limita a 60 consultas por hora por persona', () => {
    for (let i = 0; i < 60; i++) lookup(w.ctx, 'demo', 'u-marta', ana);
    expect(() => lookup(w.ctx, 'demo', 'u-marta', ana)).toThrow(/Demasiadas consultas/);
    advance(w, 61);
    expect(lookup(w.ctx, 'demo', 'u-marta', ana).found).toBe(true);
  });
});
