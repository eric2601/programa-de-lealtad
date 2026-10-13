export type FuelType = 'regular' | 'premium' | 'diesel';

export interface Multiplier {
  label: string;
  factor: number;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  fromHour: number;
  /** Exclusivo. 16 significa "hasta las 15:59". */
  toHour: number;
}

export interface ScratchPrize { points: number; label: string; weight: number }
export interface ScratchConfig {
  enabled: boolean;
  /** Importe mínimo de combustible en centavos para ganar una tarjeta. */
  minFuelCents: number;
  maxPerDay: number;
  expiresDays: number;
  prizes: ScratchPrize[];
}

export interface ProgramConfig {
  scratch: ScratchConfig;
  /** Máximo de promociones aplicables en una misma transacción. */
  maxPromosPerTransaction: number;
  /** Margen bruto de la estación por litro, en centavos, para estimar ROI. */
  marginCentsPerLiter: number;
  /** Margen de tienda y servicios, en porcentaje, para estimar ROI. */
  storeMarginPercent: number;
  /** Valor de 1 punto en centavos. 10 = $0.10 */
  pointValueCents: number;
  fuelPointsPerLiter: Record<FuelType, number>;
  /** Puntos por cada $10 (1000 centavos) de tienda y servicios. */
  storePointsPer1000Cents: number;
  /** Litros mínimos para acumular en combustible. */
  minLitersMl: number;
  /** Litros mínimos para recibir un sello. */
  stampMinLitersMl: number;
  stampsForReward: number;
  maxSalesPerDay: number;
  maxLitersPerDayMl: number;
  redemption: { minPoints: number; stepPoints: number; reservationMinutes: number };
  /** Puntos máximos que puede tener una membresía sin verificar el teléfono. */
  unverifiedPointsCap: number;
  minNegativeBalance: number;
  multipliers: Multiplier[];
}

export const DEFAULT_PROGRAM: ProgramConfig = {
  maxPromosPerTransaction: 3,
  marginCentsPerLiter: 200,
  storeMarginPercent: 30,
  scratch: {
    enabled: true,
    minFuelCents: 50_000,
    maxPerDay: 1,
    expiresDays: 14,
    // Valor esperado ≈ 37 puntos ($3.70) por tarjeta, cerca de 0.7 % de una carga de $500.
    prizes: [
      { points: 10, label: '10 puntos', weight: 50 },
      { points: 20, label: '20 puntos', weight: 25 },
      { points: 50, label: '50 puntos', weight: 15 },
      { points: 100, label: '100 puntos', weight: 7 },
      { points: 300, label: '300 puntos', weight: 2.5 },
      { points: 1000, label: '¡1,000 puntos!', weight: 0.5 },
    ],
  },
  pointValueCents: 10,
  fuelPointsPerLiter: { regular: 1, premium: 2, diesel: 1 },
  storePointsPer1000Cents: 3,
  minLitersMl: 5_000,
  stampMinLitersMl: 20_000,
  stampsForReward: 6,
  maxSalesPerDay: 2,
  maxLitersPerDayMl: 120_000,
  redemption: { minPoints: 100, stepPoints: 100, reservationMinutes: 10 },
  unverifiedPointsCap: 200,
  minNegativeBalance: -50,
  multipliers: [
    { label: 'Puntos dobles en horario valle', factor: 2, days: [1, 2, 3, 4], fromHour: 14, toHour: 16 },
  ],
};

export interface EarnInput {
  fuelType?: FuelType | null;
  litersMl: number;
  fuelCents: number;
  storeCents: number;
  /** Importe cubierto con puntos; se aplica primero a combustible y el resto a tienda. */
  rewardCents: number;
  dispensedAt: Date;
}

export interface EarnResult {
  eligibleLitersMl: number;
  eligibleStoreCents: number;
  fuelPoints: number;
  storePoints: number;
  multiplier: number;
  multiplierLabel: string | null;
  totalPoints: number;
  stamp: boolean;
}

export function activeMultiplier(cfg: ProgramConfig, at: Date): Multiplier | null {
  const day = at.getDay();
  const hour = at.getHours();
  for (const m of cfg.multipliers) {
    if (m.days.includes(day) && hour >= m.fromHour && hour < m.toHour) return m;
  }
  return null;
}

/**
 * Calcula puntos de un despacho. Todo en enteros; un solo redondeo hacia abajo por concepto.
 * No se acumula sobre lo pagado con puntos: los litros elegibles se reducen en proporción
 * al importe cubierto con la recompensa.
 */
export function computeEarn(input: EarnInput, cfg: ProgramConfig): EarnResult {
  const reward = Math.max(0, Math.floor(input.rewardCents));
  const rewardOnFuel = Math.min(reward, input.fuelCents);
  const rewardOnStore = Math.min(reward - rewardOnFuel, input.storeCents);

  let eligibleLitersMl = 0;
  if (input.fuelType && input.litersMl >= cfg.minLitersMl && input.fuelCents > 0) {
    const eligibleFuelCents = input.fuelCents - rewardOnFuel;
    eligibleLitersMl = Math.floor((input.litersMl * eligibleFuelCents) / input.fuelCents);
  }
  const eligibleStoreCents = Math.max(0, input.storeCents - rewardOnStore);

  const ppl = input.fuelType ? cfg.fuelPointsPerLiter[input.fuelType] : 0;
  const fuelPoints = Math.floor((eligibleLitersMl * ppl) / 1000);
  const storePoints = Math.floor((eligibleStoreCents * cfg.storePointsPer1000Cents) / 1000);

  const m = activeMultiplier(cfg, input.dispensedAt);
  const multiplier = m?.factor ?? 1;
  const totalPoints = Math.floor((fuelPoints + storePoints) * multiplier);
  const stamp = !!input.fuelType && input.litersMl >= cfg.stampMinLitersMl;

  return {
    eligibleLitersMl,
    eligibleStoreCents,
    fuelPoints,
    storePoints,
    multiplier,
    multiplierLabel: m?.label ?? null,
    totalPoints,
    stamp,
  };
}

/** Sorteo ponderado. `random` devuelve un entero en [0, max); se inyecta para poder probarlo. */
export function drawScratchPrize(prizes: ScratchPrize[], random: (max: number) => number): ScratchPrize {
  const scaled = prizes.map((p) => Math.max(0, Math.round(p.weight * 100)));
  const total = scaled.reduce((a, b) => a + b, 0);
  if (total <= 0) return prizes[0];
  let r = random(total);
  for (let i = 0; i < prizes.length; i++) {
    r -= scaled[i];
    if (r < 0) return prizes[i];
  }
  return prizes[prizes.length - 1];
}

/** Valor esperado en puntos de una tarjeta, para el simulador y el reporte de costo. */
export function scratchExpectedPoints(prizes: ScratchPrize[]): number {
  const total = prizes.reduce((a, p) => a + p.weight, 0);
  return total > 0 ? prizes.reduce((a, p) => a + (p.points * p.weight) / total, 0) : 0;
}

export function pointsToCents(points: number, cfg: ProgramConfig): number {
  return points * cfg.pointValueCents;
}

/** Texto en lenguaje sencillo para mostrar al cliente. */
export function describeProgram(cfg: ProgramConfig): string {
  const v = cfg.pointValueCents / 100;
  const hundred = (cfg.redemption.minPoints * cfg.pointValueCents) / 100;
  return `Cada litro de regular o diésel te da ${cfg.fuelPointsPerLiter.regular} punto; Premium da ${cfg.fuelPointsPerLiter.premium}. ` +
    `En tienda ganas ${cfg.storePointsPer1000Cents} puntos por cada $10. ` +
    `Cada punto vale $${v.toFixed(2)}: ${cfg.redemption.minPoints} puntos son $${hundred.toFixed(0)} en gasolina o tienda.`;
}
