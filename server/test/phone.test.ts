import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeMxPhone } from '../src/phone.js';

describe('normalizeMxPhone', () => {
  it('acepta 10 dígitos con espacios', () => {
    expect(normalizeMxPhone('55 4433 4317')).toEqual({ e164: '+525544334317', national: '5544334317' });
  });
  it('acepta +52 y el 1 heredado', () => {
    expect(normalizeMxPhone('+52 55 4433 4317').e164).toBe('+525544334317');
    expect(normalizeMxPhone('+52 1 55 4433 4317').e164).toBe('+525544334317');
    expect(normalizeMxPhone('5215544334317').e164).toBe('+525544334317');
  });
  it('rechaza longitudes y primeros dígitos inválidos', () => {
    expect(() => normalizeMxPhone('554433431')).toThrow();
    expect(() => normalizeMxPhone('1544334317')).toThrow();
    expect(() => normalizeMxPhone('')).toThrow();
    expect(() => normalizeMxPhone('+1 555 123 4567')).toThrow();
  });
  it('enmascara mostrando lada y últimos cuatro', () => {
    expect(maskPhone('+525544334317')).toBe('55 •• •• 43 17');
  });
});
