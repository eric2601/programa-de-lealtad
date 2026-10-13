import { describe, expect, it } from 'vitest';
import { registerSale } from '../src/services/sales.js';
import { today } from '../src/services/overview.js';
import { advance, luis, world } from './helpers.js';

describe('dashboard de operación del día', () => {
  it('cuenta las cargas de hoy por estación, arma la serie por hora y compara con la semana pasada', () => {
    const w = world(new Date(Date.UTC(2026, 8, 8, 16, 0, 0))); // martes 10:00 hora de México
    registerSale(w.ctx, luis, 'k1', { phone: '5544334317', posReference: 'D-1', fuelType: 'regular', litersMl: 30_000, pricePerLiterCents: 2389, storeCents: 5000, source: 'manual' });
    advance(w, 90);
    registerSale(w.ctx, luis, 'k2', { phone: '5611122233', posReference: 'D-2', fuelType: 'premium', litersMl: 20_000, pricePerLiterCents: 2599, storeCents: 0, source: 'manual' });

    const d = today(w.ctx, luis.tenantId, luis.stationId);
    expect(d.today.sales).toBe(2);
    expect(d.today.litersMl).toBe(50_000);
    expect(d.today.customers).toBe(2);
    expect(d.hours).toHaveLength(24);
    expect(d.hours[10].sales).toBe(1);
    expect(d.hours[11].sales).toBe(1);
    expect(d.fuelMix.regular).toBe(30_000);
    expect(d.recent[0].firstName).toBe('Beto');
    expect(d.recent[0].pump).toBeNull();
    expect(d.attendants[0].name).toContain('Luis');
    expect(d.lastWeek.salesChangePct).toBeNull(); // no hubo cargas el martes pasado en el mundo de prueba

    const other = today(w.ctx, luis.tenantId, 'st-norte');
    expect(other.today.sales).toBe(0);
    const group = today(w.ctx, luis.tenantId, null);
    expect(group.today.sales).toBe(2);
  });
});
