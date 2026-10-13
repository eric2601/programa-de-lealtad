import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { lookup } from '../src/services/customers.js';
import { registerSale, returnStore, voidSale } from '../src/services/sales.js';
import { advance, luis, manager, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });

const baseSale = { phone: '5544334317', posReference: 'T-999001', pumpNumber: 4, fuelType: 'regular' as const, litersMl: 35_200, pricePerLiterCents: 2_389, storeCents: 5_200, source: 'manual' as const };

describe('registerSale', () => {
  it('acumula por litro y por tienda y deja asiento en el libro', () => {
    const before = lookup(w.ctx, 'demo', 'u-luis', '5544334317');
    const r = registerSale(w.ctx, luis, 'k1', baseSale);
    expect(r.points.fuel).toBe(35);
    expect(r.points.store).toBe(15);
    expect(r.points.total).toBe(50);
    expect(r.stamp.awarded).toBe(true);
    if (!before.found) throw new Error('Ana debería existir');
    expect(r.member.points).toBe(before.member.points + 50);
    const entry = one<{ kind: string; points_delta: number }>(w.ctx.db, 'SELECT kind, points_delta FROM ledger_entries WHERE sale_id = ?', r.saleId);
    expect(entry).toEqual({ kind: 'earn', points_delta: 50 });
  });

  it('es idempotente: la misma clave devuelve la misma respuesta sin duplicar', () => {
    const a = registerSale(w.ctx, luis, 'same', baseSale);
    const b = registerSale(w.ctx, luis, 'same', baseSale);
    const c = registerSale(w.ctx, luis, 'same', { ...baseSale, litersMl: 1 });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const n = one<{ n: number }>(w.ctx.db, 'SELECT COUNT(*) AS n FROM sales WHERE pos_reference = ?', 'T-999001');
    expect(n?.n).toBe(1);
  });

  it('rechaza folio repetido en la misma estación', () => {
    registerSale(w.ctx, luis, 'k1', baseSale);
    expect(() => registerSale(w.ctx, luis, 'k2', { ...baseSale, litersMl: 20_000 })).toThrow(/folio/);
  });

  it('aplica topes diarios de cargas y litros', () => {
    registerSale(w.ctx, luis, 'a', { ...baseSale, posReference: 'A', litersMl: 60_000 });
    expect(() => registerSale(w.ctx, luis, 'b', { ...baseSale, posReference: 'B', litersMl: 61_000 })).toThrow(/tope de 120 litros/);
    registerSale(w.ctx, luis, 'c', { ...baseSale, posReference: 'C', litersMl: 20_000 });
    expect(() => registerSale(w.ctx, luis, 'd', { ...baseSale, posReference: 'D', litersMl: 5_000 })).toThrow(/2 cargas hoy/);
  });

  it('bloquea el teléfono de un empleado del grupo', () => {
    expect(() => registerSale(w.ctx, luis, 'e', { ...baseSale, phone: '5512345678' })).toThrow(/empleados/);
    const l = lookup(w.ctx, 'demo', 'u-luis', '5512345678');
    expect(l).toEqual({ found: false, blocked: true });
  });

  it('limita a 200 puntos a un teléfono sin verificar', () => {
    const r = registerSale(w.ctx, luis, 'beto', { ...baseSale, phone: '5611122233', posReference: 'B-1', fuelType: 'premium', litersMl: 100_000, storeCents: 0 });
    expect(r.points.capped).toBe(true);
    expect(r.member.points).toBe(200);
  });

  it('la anulación revierte con asientos compensatorios y regresa el sello', () => {
    const before = lookup(w.ctx, 'demo', 'u-luis', '5544334317');
    if (!before.found) throw new Error('Ana debería existir');
    const r = registerSale(w.ctx, luis, 'v', baseSale);
    const v = voidSale(w.ctx, luis, r.saleId, 'error de captura');
    expect(v.pointsDelta).toBe(-50);
    expect(v.balance).toBe(r.member.points - 50);
    const rows = one<{ n: number }>(w.ctx.db, `SELECT COUNT(*) AS n FROM ledger_entries WHERE sale_id = ? AND kind = 'reverse'`, r.saleId);
    expect(rows?.n).toBe(1);
    const stamps = one<{ stamps: number }>(w.ctx.db, 'SELECT stamps FROM memberships WHERE id = ?', r.member.membershipId);
    expect(stamps?.stamps).toBe(before.member.stamps);
  });

  it('después de 30 minutos el despachador no puede anular pero el gerente sí', () => {
    const r = registerSale(w.ctx, luis, 'v2', baseSale);
    advance(w, 31);
    expect(() => voidSale(w.ctx, luis, r.saleId, 'tarde')).toThrow(/gerente/);
    expect(voidSale(w.ctx, manager, r.saleId, 'tarde').status).toBe('void');
  });

  it('la devolución parcial de tienda descuenta puntos proporcionales', () => {
    const r = registerSale(w.ctx, luis, 'ret', { ...baseSale, storeCents: 10_000 });
    expect(r.points.store).toBe(30);
    const d = returnStore(w.ctx, luis, r.saleId, 4_000, 'producto dañado');
    expect(d.pointsDelta).toBe(-12);
    expect(() => returnStore(w.ctx, luis, r.saleId, 7_000, 'otra vez')).toThrow(/quedan/);
  });

  it('rechaza despachos con hora futura', () => {
    const future = new Date(w.clock.now.getTime() + 10 * 60_000).toISOString();
    expect(() => registerSale(w.ctx, luis, 'f', { ...baseSale, dispensedAt: future })).toThrow(/futura/);
  });
});
