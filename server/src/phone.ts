import { createHash } from 'node:crypto';
import { badRequest } from './errors.js';

export interface MxPhone {
  /** Formato E.164, por ejemplo +525544334317 */
  e164: string;
  /** Diez dígitos nacionales, por ejemplo 5544334317 */
  national: string;
}

/**
 * Normaliza un número mexicano. Acepta con o sin +52, con o sin el "1" heredado de la
 * marcación a celulares, y con espacios, guiones o paréntesis. Exige 10 dígitos nacionales
 * cuyo primer dígito sea 2 a 9.
 */
export function normalizeMxPhone(input: string): MxPhone {
  const digits = (input ?? '').replace(/\D/g, '');
  let national: string | undefined;
  if (digits.length === 10) national = digits;
  else if (digits.length === 12 && digits.startsWith('52')) national = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('521')) national = digits.slice(3);
  if (!national || !/^[2-9]\d{9}$/.test(national)) {
    throw badRequest('PHONE_INVALID', 'El teléfono debe tener 10 dígitos (por ejemplo 55 4433 4317).');
  }
  return { e164: `+52${national}`, national };
}

/** Enmascara para mostrar en isla: 55 •• •• 43 17 */
export function maskPhone(e164: string): string {
  const n = e164.replace(/\D/g, '').slice(-10);
  return `${n.slice(0, 2)} •• •• ${n.slice(6, 8)} ${n.slice(8, 10)}`;
}

/** Hash con sal para búsqueda sin exponer el número en índices. */
export function hashPhone(e164: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${e164}`).digest('hex');
}
