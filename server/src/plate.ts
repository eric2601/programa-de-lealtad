import { badRequest } from './errors.js';

/**
 * Formatos de placa en México (L = letra, D = dígito). Cada formato dice qué tipo de vehículo es,
 * así que el tipo nunca se pregunta: se deduce de la placa.
 *
 * Fuente: tabla de patrones que entregó el cliente; moto (1234A5) y la Edomex previa (LMN-23-45)
 * se agregaron a petición suya. Si cambias esta lista, cambia también web/src/plates.ts y
 * android/core/.../Plate.kt.
 */
export const VEHICLE_KINDS = [
  'auto', 'moto', 'camion', 'autobus', 'remolque', 'auto_publico', 'camion_publico', 'autobus_publico', 'emergencia', 'ecologico',
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  auto: 'Auto',
  moto: 'Moto',
  camion: 'Camión',
  autobus: 'Autobús',
  remolque: 'Remolque',
  auto_publico: 'Auto de servicio público',
  camion_publico: 'Camión de servicio público',
  autobus_publico: 'Autobús de servicio público',
  emergencia: 'Ambulancia o bomberos',
  ecologico: 'Vehículo ecológico',
};

interface PlateFormat { mask: string; groups: number[]; kind: VehicleKind; example: string }
export const PLATE_FORMATS: PlateFormat[] = [
  { mask: 'LDDLLL', groups: [3, 3], kind: 'auto', example: 'A01-ABC' },                  // Automóvil particular CDMX
  { mask: 'LLLDDDL', groups: [3, 3, 1], kind: 'auto', example: 'ABC-123-D' },            // Automóvil particular, otras entidades
  { mask: 'LLLDDDD', groups: [3, 2, 2], kind: 'auto', example: 'LMN-23-45' },            // Edomex previa
  { mask: 'DDDDLD', groups: [6], kind: 'moto', example: '1234A5' },                      // Moto (sin guiones)
  { mask: 'LLDDDDL', groups: [2, 4, 1], kind: 'camion', example: 'AB-1234-C' },          // Camión particular
  { mask: 'DDLLLDD', groups: [2, 3, 2], kind: 'autobus', example: '12-ABC-34' },         // Autobús particular
  { mask: 'DLLDDDL', groups: [3, 3, 1], kind: 'remolque', example: '1AB-234-C' },        // Remolque particular
  { mask: 'LDDDLLL', groups: [1, 3, 3], kind: 'auto_publico', example: 'A-123-ABC' },    // Automóvil de servicio público estatal
  { mask: 'DLLLDDL', groups: [1, 3, 3], kind: 'camion_publico', example: '1-ABC-23D' },  // Camión de servicio público estatal
  { mask: 'LDDDDDL', groups: [1, 5, 1], kind: 'autobus_publico', example: 'A-12345-B' }, // Autobús de servicio público estatal
  { mask: 'LLDDDLL', groups: [2, 3, 2], kind: 'emergencia', example: 'AB-123-CD' },      // Ambulancias y bomberos
  { mask: 'DDLDDD', groups: [3, 3], kind: 'ecologico', example: '12A-345' },             // Vehículo ecológico
];

/** Quita todo lo que no sea letra o número y pasa a mayúsculas. */
const compact = (input: string) => (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const matches = (c: string, mask: string) => c.length === mask.length && [...c].every((ch, i) => (mask[i] === 'L' ? /[A-Z]/ : /[0-9]/).test(ch));

const formatOf = (c: string) => PLATE_FORMATS.find((f) => matches(c, f.mask));

/** Letras que el OCR suele confundir con números y al revés. */
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', A: '4' };
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '4': 'A' };

export function formatPlate(c: string): string {
  const f = formatOf(c);
  if (!f) return c;
  let at = 0;
  return f.groups.map((n) => { const part = c.slice(at, at + n); at += n; return part; }).join('-');
}

/** Corrige confusiones típicas de lectura según la posición; elige el formato que menos cambios necesita. */
export function fixOcr(input: string): string {
  const c = compact(input);
  let best = c;
  let bestChanges = Infinity;
  for (const { mask, kind } of PLATE_FORMATS) {
    if (mask.length !== c.length) continue;
    const fixed = [...c].map((ch, i) => (mask[i] === 'L' ? TO_LETTER[ch] ?? ch : TO_DIGIT[ch] ?? ch)).join('');
    if (!matches(fixed, mask)) continue;
    // En una gasolinera casi todo es auto o moto: ante una lectura dudosa, ganan esos formatos.
    // Media penalización basta para que una placa de camión leída sin errores siga ganando.
    const changes = [...c].filter((ch, i) => ch !== fixed[i]).length + (kind === 'auto' || kind === 'moto' ? 0 : 0.5);
    if (changes < bestChanges) { best = fixed; bestChanges = changes; }
  }
  return best;
}

/** Normaliza y valida. Devuelve la placa con los guiones de su formato. */
export function normalizePlate(input: string): string {
  const c = compact(input);
  if (!formatOf(c)) {
    throw badRequest('PLATE_INVALID', 'Esa placa no tiene un formato válido. Ejemplos: ABC-123-D, A01-ABC o 1234A5.');
  }
  return formatPlate(c);
}

/** El tipo de vehículo sale del formato de la placa. */
export const plateKind = (plate: string): VehicleKind => formatOf(compact(plate))?.kind ?? 'auto';

export const maskPlate = (plate: string) => `${plate.slice(0, 2)}•-••-${plate.slice(-1)}`;
