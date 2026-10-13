import { describe, expect, it } from 'vitest';
import { computeEarn, DEFAULT_PROGRAM } from '../src/rules.js';

const tuesday10 = new Date(2026, 8, 8, 10, 0, 0);
const tuesday15 = new Date(2026, 8, 8, 15, 0, 0);

describe('computeEarn', () => {
  it('35.2 L regular + $52 tienda = 35 + 15 puntos', () => {
    const r = computeEarn({ fuelType: 'regular', litersMl: 35_200, fuelCents: 84_093, storeCents: 5_200, rewardCents: 0, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
    expect(r.fuelPoints).toBe(35);
    expect(r.storePoints).toBe(15);
    expect(r.totalPoints).toBe(50);
    expect(r.stamp).toBe(true);
  });
  it('no acumula sobre lo pagado con puntos: $20 de canje reduce los litros elegibles', () => {
    const r = computeEarn({ fuelType: 'regular', litersMl: 35_200, fuelCents: 84_093, storeCents: 5_200, rewardCents: 2_000, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
    expect(r.eligibleLitersMl).toBe(34_362);
    expect(r.fuelPoints).toBe(34);
    expect(r.storePoints).toBe(15);
    expect(r.totalPoints).toBe(49);
  });
  it('el canje que excede el combustible se descuenta de tienda', () => {
    const r = computeEarn({ fuelType: 'regular', litersMl: 10_000, fuelCents: 23_890, storeCents: 10_000, rewardCents: 30_000, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
    expect(r.eligibleLitersMl).toBe(0);
    expect(r.eligibleStoreCents).toBe(3_890);
    expect(r.storePoints).toBe(11);
  });
  it('premium da el doble por litro', () => {
    const r = computeEarn({ fuelType: 'premium', litersMl: 20_000, fuelCents: 51_980, storeCents: 0, rewardCents: 0, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
    expect(r.fuelPoints).toBe(40);
  });
  it('bajo el mínimo de litros no acumula combustible ni da sello', () => {
    const r = computeEarn({ fuelType: 'regular', litersMl: 4_000, fuelCents: 9_556, storeCents: 0, rewardCents: 0, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
    expect(r.fuelPoints).toBe(0);
    expect(r.stamp).toBe(false);
  });
  it('multiplicador de horario valle aplica por hora del servidor', () => {
    const r = computeEarn({ fuelType: 'regular', litersMl: 30_000, fuelCents: 71_670, storeCents: 0, rewardCents: 0, dispensedAt: tuesday15 }, DEFAULT_PROGRAM);
    expect(r.multiplier).toBe(2);
    expect(r.totalPoints).toBe(60);
  });
  it('nunca produce fracciones', () => {
    for (let i = 0; i < 500; i++) {
      const ml = Math.floor(Math.random() * 80_000) + 1;
      const price = 2_000 + Math.floor(Math.random() * 800);
      const store = Math.floor(Math.random() * 20_000);
      const r = computeEarn({ fuelType: 'regular', litersMl: ml, fuelCents: Math.round(ml * price / 1000), storeCents: store, rewardCents: 0, dispensedAt: tuesday10 }, DEFAULT_PROGRAM);
      expect(Number.isInteger(r.totalPoints)).toBe(true);
      expect(r.totalPoints).toBeGreaterThanOrEqual(0);
    }
  });
});
