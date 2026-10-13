/**
 * Formatos de placa en México (L = letra, D = dígito) y el tipo de vehículo que indica cada uno.
 * Es la misma lista que server/src/plate.ts: si cambias una, cambia la otra.
 */
export type VehicleKind =
  | 'auto' | 'moto' | 'camion' | 'autobus' | 'remolque' | 'auto_publico' | 'camion_publico' | 'autobus_publico' | 'emergencia' | 'ecologico';

/** Se pasan por t() al dibujar. */
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

const FORMATS: { mask: string; groups: number[]; kind: VehicleKind }[] = [
  { mask: 'LDDLLL', groups: [3, 3], kind: 'auto' },              // A01-ABC   CDMX
  { mask: 'LLLDDDL', groups: [3, 3, 1], kind: 'auto' },          // ABC-123-D otras entidades
  { mask: 'LLLDDDD', groups: [3, 2, 2], kind: 'auto' },          // LMN-23-45 Edomex previa
  { mask: 'DDDDLD', groups: [6], kind: 'moto' },                 // 1234A5
  { mask: 'LLDDDDL', groups: [2, 4, 1], kind: 'camion' },        // AB-1234-C
  { mask: 'DDLLLDD', groups: [2, 3, 2], kind: 'autobus' },       // 12-ABC-34
  { mask: 'DLLDDDL', groups: [3, 3, 1], kind: 'remolque' },      // 1AB-234-C
  { mask: 'LDDDLLL', groups: [1, 3, 3], kind: 'auto_publico' },  // A-123-ABC
  { mask: 'DLLLDDL', groups: [1, 3, 3], kind: 'camion_publico' },// 1-ABC-23D
  { mask: 'LDDDDDL', groups: [1, 5, 1], kind: 'autobus_publico' },// A-12345-B
  { mask: 'LLDDDLL', groups: [2, 3, 2], kind: 'emergencia' },    // AB-123-CD
  { mask: 'DDLDDD', groups: [3, 3], kind: 'ecologico' },         // 12A-345
];

const compact = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const matches = (c: string, mask: string) => c.length === mask.length && [...c].every((ch, i) => (mask[i] === 'L' ? /[A-Z]/ : /[0-9]/).test(ch));
const formatOf = (raw: string) => { const c = compact(raw); return FORMATS.find((f) => matches(c, f.mask)); };

/**
 * Mientras se teclea: mayúsculas y sin símbolos. Cuando la placa ya coincide con un formato,
 * se le ponen sus guiones (cada formato los lleva en lugares distintos, así que antes no se adivinan).
 */
export function formatPlateInput(raw: string): string {
  const c = compact(raw);
  const f = FORMATS.find((x) => matches(c, x.mask));
  if (!f) return c;
  let at = 0;
  return f.groups.map((n) => { const part = c.slice(at, at + n); at += n; return part; }).join('-');
}

export const isPlateComplete = (plate: string) => !!formatOf(plate);

/** Tipo de vehículo según el formato, o null si la placa aún no está completa. */
export const plateKind = (plate: string): VehicleKind | null => formatOf(plate)?.kind ?? null;
