import { beforeEach, describe, expect, it } from 'vitest';
import { one } from '../src/db.js';
import { fixOcr, normalizePlate, plateKind } from '../src/plate.js';
import { addVehicle, enroll, listVehicles, lookup, portalView, removeVehicle, type CustomerRow } from '../src/services/customers.js';
import { previewSale, registerSale } from '../src/services/sales.js';
import { createPromotion } from '../src/services/promotions.js';
import { luis, world, type TestWorld } from './helpers.js';

let w: TestWorld;
beforeEach(() => { w = world(); });
const cust = (e164: string) => one<CustomerRow>(w.ctx.db, 'SELECT * FROM customers WHERE phone_e164 = ?', e164)!;

describe('placa', () => {
  it('acepta Edomex ABC-123-D y CDMX A01-ABC', () => {
    expect(normalizePlate('abc123d')).toBe('ABC-123-D');
    expect(normalizePlate(' ABC 123 D ')).toBe('ABC-123-D');
    expect(normalizePlate('a01abc')).toBe('A01-ABC');
    expect(normalizePlate('A01-ABC')).toBe('A01-ABC');
  });
  it('acepta placas de moto de 6 caracteres sin guiones', () => {
    expect(normalizePlate('1234a5')).toBe('1234A5');
    expect(normalizePlate('1234-A-5')).toBe('1234A5');
    expect(fixOcr('1234-4-5')).toBe('1234A5');
  });
  it('deduce el tipo de vehículo por el formato', () => {
    expect(plateKind('1234A5')).toBe('moto');
    expect(plateKind('ABC-123-D')).toBe('auto');
    expect(plateKind('A01-ABC')).toBe('auto');
    expect(plateKind('LMN-23-45')).toBe('auto');
    expect(plateKind('AB-1234-C')).toBe('camion');
    expect(plateKind('12-ABC-34')).toBe('autobus');
    expect(plateKind('1AB-234-C')).toBe('remolque');
    expect(plateKind('A-123-ABC')).toBe('auto_publico');
    expect(plateKind('1-ABC-23D')).toBe('camion_publico');
    expect(plateKind('A-12345-B')).toBe('autobus_publico');
    expect(plateKind('AB-123-CD')).toBe('emergencia');
    expect(plateKind('12A-345')).toBe('ecologico');
  });
  it('pone los guiones de cada formato', () => {
    expect(normalizePlate('ab1234c')).toBe('AB-1234-C');
    expect(normalizePlate('12abc34')).toBe('12-ABC-34');
    expect(normalizePlate('a123abc')).toBe('A-123-ABC');
    expect(normalizePlate('a12345b')).toBe('A-12345-B');
    expect(normalizePlate('12a345')).toBe('12A-345');
  });
  it('normaliza al formato AAA-00-00', () => {
    expect(normalizePlate('lmn2345')).toBe('LMN-23-45');
    expect(normalizePlate(' LMN 23 45 ')).toBe('LMN-23-45');
    expect(normalizePlate('LMN-23-45')).toBe('LMN-23-45');
  });
  it('rechaza formatos que no son 3 letras y 4 números', () => {
    for (const bad of ['', 'LM-23-45', 'LMN-23-4', '123-45-67', 'LMNO-23-45', '123-456-7']) {
      expect(() => normalizePlate(bad), bad).toThrow();
    }
  });
  it('corrige confusiones típicas del OCR', () => {
    expect(fixOcr('LMN-Z3-45')).toBe('LMN2345');
    expect(fixOcr('1MN-23-45')).toBe('IMN2345');
    expect(fixOcr('0MN-03-45')).toBe('OMN0345');
    expect(fixOcr('AB-1234-C')).toBe('AB1234C');
    expect(fixOcr('A0I-A8C')).toBe('A01ABC');
    expect(fixOcr('ABC-I23-D')).toBe('ABC123D');
  });
});

describe('vehículos', () => {
  it('asocia la placa al cliente y la placa lo identifica en la bomba', () => {
    const ana = cust('+525544334317');
    addVehicle(w.ctx, ana, 'lmn2345');
    expect(portalView(w.ctx, ana).vehicles.map((v) => v.plate)).toEqual(['ABC-123-D', 'LMN-23-45']);
    const r = lookup(w.ctx, luis.tenantId, luis.userId, 'LMN-23-45');
    expect(r.found).toBe(true);
    if (r.found) expect(r.member.firstName).toBeTruthy();
    expect(lookup(w.ctx, luis.tenantId, luis.userId, 'ZZZ-00-00').found).toBe(false);
  });
  it('una placa no puede estar con dos números ni repetirse', () => {
    const ana = cust('+525544334317');
    const beto = cust('+525611122233');
    expect(addVehicle(w.ctx, ana, '7788K9').kind).toBe('moto');
    expect(() => addVehicle(w.ctx, ana, '7788K9')).toThrow(/ya está en tu cuenta/);
    expect(() => addVehicle(w.ctx, beto, '7788K9')).toThrow(/otro número/);
  });
  it('limita a 5 vehículos y permite quitar', () => {
    const ana = cust('+525544334317');
    for (const p of ['AAA-11-11', 'BBB-22-22', 'CCC-33-33', 'DDD-44-44']) addVehicle(w.ctx, ana, p);
    expect(() => addVehicle(w.ctx, ana, 'FFF-66-66')).toThrow(/hasta 5/);
    const first = listVehicles(w.ctx, ana.id)[0];
    removeVehicle(w.ctx, ana, first.id);
    expect(listVehicles(w.ctx, ana.id)).toHaveLength(4);
    expect(() => removeVehicle(w.ctx, cust('+525611122233'), listVehicles(w.ctx, ana.id)[0].id)).toThrow();
  });
});

describe('venta por placa', () => {
  it('registra la carga identificando al cliente por la placa', () => {
    const r = registerSale(w.ctx, luis, 'plate-sale-1', { phone: 'ABC-123-D', posReference: 'T-PLATE-1', pumpNumber: 2, fuelType: 'regular', litersMl: 20_000, pricePerLiterCents: 2389, storeCents: 0, source: 'manual' });
    expect(JSON.stringify(r)).toContain('T-PLATE-1');
    expect(() => registerSale(w.ctx, luis, 'plate-sale-2', { phone: 'QQQ-00-00', posReference: 'T-PLATE-2', pumpNumber: 2, fuelType: 'regular', litersMl: 20_000, pricePerLiterCents: 2389, storeCents: 0, source: 'manual' })).toThrow(/no participa/);
  });
});

describe('alta con placa', () => {
  it('registra al cliente y deja la placa asociada a su número', () => {
    const m = enroll(w.ctx, luis.tenantId, luis.userId, luis.stationId, { phone: '5599887766', firstName: 'Carlos', plate: '9876c5' });
    expect(m.firstName).toBe('Carlos');
    const r = lookup(w.ctx, luis.tenantId, luis.userId, '9876C5');
    expect(r.found).toBe(true);
    if (r.found) expect(r.vehicles[0].kind).toBe('moto');
  });
  it('si la placa es de otro número no crea el cliente', () => {
    expect(() => enroll(w.ctx, luis.tenantId, luis.userId, luis.stationId, { phone: '5599887766', firstName: 'Carlos', plate: 'ABC-123-D' })).toThrow(/otro número/);
    expect(lookup(w.ctx, luis.tenantId, luis.userId, '5599887766').found).toBe(false);
  });
});

describe('promociones por tipo de vehículo', () => {
  const motoPromo = () => createPromotion(w.ctx, 'demo', null, { name: 'Motos +20', type: 'puntos', objective: 'frecuencia', status: 'active', rules: { vehicleKinds: ['moto'] }, benefit: { type: 'points', points: 20 } });
  const sale = (ident: string) => previewSale(w.ctx, luis, { phone: ident, posReference: 'VK', fuelType: 'regular', litersMl: 5_000, pricePerLiterCents: 2_389, storeCents: 0 });
  const applied = (ident: string) => sale(ident).promotions.applied.map((a) => a.promotionName);

  it('aplica a la moto identificada por su placa y no a un auto', () => {
    motoPromo();
    // Beto tiene la moto 4521B7 (demo); Ana tiene el auto ABC-123-D.
    expect(applied('4521B7')).toContain('Motos +20');
    expect(applied('ABC-123-D')).not.toContain('Motos +20');
    expect(sale('ABC-123-D').promotions.skipped.find((s) => s.promotionName === 'Motos +20')?.reason).toBe('tipo de vehículo no participante');
  });
  it('por teléfono, califica si el cliente tiene registrado un vehículo de ese tipo', () => {
    motoPromo();
    expect(applied('5611122233')).toContain('Motos +20');
    expect(applied('5544334317')).not.toContain('Motos +20');
  });
  it('el portal solo muestra la promoción a quien tiene ese tipo de vehículo', () => {
    motoPromo();
    const names = (e164: string) => portalView(w.ctx, cust(e164)).memberships[0].promotions.map((p) => String(p.name));
    expect(names('+525611122233')).toContain('Motos +20');
    expect(names('+525544334317')).not.toContain('Motos +20');
  });
});
