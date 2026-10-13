import type { FuelType } from '../rules.js';
import type { VehicleKind } from '../plate.js';

/** Objetivos comerciales disponibles en el generador y en cada promoción. */
export const OBJECTIVES = [
  'ticket_promedio', 'litros', 'frecuencia', 'clientes_nuevos', 'recuperar_inactivos',
  'premium', 'diesel', 'tienda', 'servicios', 'fidelizar', 'pagos_digitales',
] as const;
export type Objective = typeof OBJECTIVES[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  ticket_promedio: 'Aumentar ticket promedio',
  litros: 'Aumentar litros vendidos',
  frecuencia: 'Aumentar frecuencia de visita',
  clientes_nuevos: 'Captar clientes nuevos',
  recuperar_inactivos: 'Recuperar clientes inactivos',
  premium: 'Incrementar ventas de Premium',
  diesel: 'Incrementar ventas de Diésel',
  tienda: 'Promover productos de tienda',
  servicios: 'Promover servicios adicionales',
  fidelizar: 'Fidelizar clientes',
  pagos_digitales: 'Promover pagos digitales',
};

/** Tipos de promoción soportados (catálogo de la sección 12). */
export const PROMO_TYPES = [
  'descuento_litro', 'descuento_porcentaje', 'descuento_fijo', 'cashback', 'dinero_virtual', 'puntos', 'puntos_dobles',
  'producto_gratis', 'cupon', '2x1', 'sorteo', 'referidos', 'horario', 'volumen', 'frecuencia', 'temporada', 'flotillas',
  'combinada', 'asociados', 'escalonada',
] as const;
export type PromoType = typeof PROMO_TYPES[number];

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  descuento_litro: 'Descuento por litro', descuento_porcentaje: 'Descuento porcentual', descuento_fijo: 'Descuento fijo',
  cashback: 'Cashback', dinero_virtual: 'Dinero virtual', puntos: 'Puntos', puntos_dobles: 'Puntos dobles',
  producto_gratis: 'Producto gratis', cupon: 'Cupón', '2x1': '2x1', sorteo: 'Sorteo', referidos: 'Referidos',
  horario: 'Promoción por horario', volumen: 'Promoción por volumen', frecuencia: 'Promoción por frecuencia',
  temporada: 'Promoción de temporada', flotillas: 'Promoción para flotillas', combinada: 'Promoción combinada',
  asociados: 'Promoción con asociados', escalonada: 'Promoción escalonada',
};

export const CUSTOMER_TYPES = ['particular', 'taxi', 'moto', 'plataforma', 'flotilla'] as const;
export type CustomerType = typeof CUSTOMER_TYPES[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  particular: 'Particular', taxi: 'Taxi', moto: 'Motociclista', plataforma: 'Conductor de plataforma', flotilla: 'Flotilla empresarial',
};

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'digital', 'flotilla'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

/** Segmentos calculados a partir del comportamiento (sección 11). */
export const SEGMENTS = ['nuevo', 'frecuente', 'inactivo', 'vip', 'alto_consumo', 'bajo_consumo', 'moto', 'taxi', 'plataforma', 'flotilla'] as const;
export type Segment = typeof SEGMENTS[number];
export const SEGMENT_LABELS: Record<Segment, string> = {
  nuevo: 'Nuevos clientes', frecuente: 'Clientes frecuentes', inactivo: 'Clientes inactivos', vip: 'Clientes VIP',
  alto_consumo: 'Alto consumo', bajo_consumo: 'Bajo consumo', moto: 'Motociclistas', taxi: 'Taxis',
  plataforma: 'Conductores de plataforma', flotilla: 'Flotillas',
};

/** Beneficio que entrega una promoción cuando se cumple su condición. */
export interface Benefit {
  type: 'points' | 'points_multiplier' | 'virtual_money' | 'cashback_percent' | 'discount_per_liter' | 'discount_percent' | 'discount_fixed'
    | 'coupon' | 'product' | 'partner_coupon' | 'scratch' | 'two_for_one';
  points?: number;
  multiplier?: number;
  amountCents?: number;
  percent?: number;
  centsPerLiter?: number;
  /** Etiqueta visible: "Café americano gratis", "$20 en lavado AutoSpa". */
  label?: string;
  couponDays?: number;
  partnerBenefitId?: string;
  walletExpiresDays?: number;
  /** Dinero virtual: compra mínima en la visita donde se use. */
  minNextPurchaseCents?: number;
  /** Dinero virtual: dónde puede usarse. */
  scope?: 'any' | 'fuel' | 'store';
  /** Dinero virtual: se consume completo en una sola compra; el sobrante se pierde. */
  singleUse?: boolean;
}

export interface PersonalizedRule {
  /** Meta = ticket habitual × (1 + uplift). */
  upliftPercent: number;
  /** Redondeo de la meta hacia arriba, en centavos (5000 = $50). */
  roundToCents: number;
  minTargetCents: number;
  maxTargetCents: number;
  /** Beneficio según la meta alcanzada: se toma la fila con targetCents ≥ meta. */
  benefitTable: Array<{ targetCents: number; amountCents: number }>;
  /** Compra mínima de la siguiente visita como % de la meta. */
  minNextPurchasePercent: number;
  validDays: number;
}

export interface Tier { minAmountCents: number; benefit: Benefit }

/** Condiciones de una promoción (sección 4). Todo es opcional; lo que no se indica no restringe. */
export interface PromoRules {
  startsAt?: string;
  endsAt?: string;
  daysOfWeek?: number[];
  hourFrom?: number;
  hourTo?: number;
  stationIds?: string[];
  states?: string[];
  cities?: string[];
  fuelTypes?: FuelType[];
  minFuelCents?: number;
  minTotalCents?: number;
  minLitersMl?: number;
  paymentMethods?: PaymentMethod[];
  customerTypes?: CustomerType[];
  /** Solo para estos tipos de vehículo (se deducen de la placa: auto, moto, camión, servicio público…). */
  vehicleKinds?: VehicleKind[];
  segments?: Segment[];
  /** Frecuencia: la N-ésima visita válida dentro del periodo dispara el beneficio (una vez por periodo). */
  visitsInPeriod?: { count: number; period: 'month' | 'week' | 'days'; days?: number; qualifyingMinFuelCents?: number };
  /** Compra mínima en tienda y servicios en la misma visita. */
  minStoreCents?: number;
  /** Requiere que el ticket incluya estos artículos (etiquetas capturadas en la isla: cafe, lavado, aceite, agua…). */
  requiresItems?: string[];
  /** Regreso: la visita anterior fue hace N días o menos (y, si se indica, con cierta carga). */
  returnWithinDays?: { days: number; minPrevFuelCents?: number };
  /** Cadena de regresos: cada regreso dentro de la ventana paga el siguiente nivel. */
  returnStreak?: { withinDays: number; rewardsCents: number[]; minFuelCents?: number };
  /** Promoción personalizada: la meta se calcula por cliente a partir de su ticket habitual. */
  personalized?: PersonalizedRule;
  /** Consumo acumulado en el mes natural, incluyendo la compra actual. */
  minMonthlyCents?: number;
  /** Consumo acumulado histórico, incluyendo la compra actual. */
  minLifetimeCents?: number;
  requiresStore?: boolean;
  /** Escalonada: se aplica el escalón más alto alcanzado. */
  tiers?: Tier[];
}

export interface PromoLimits {
  maxUses?: number | null;
  maxPerCustomer?: number | null;
  maxPerDay?: number | null;
  maxPerMonth?: number | null;
  maxDiscountCents?: number | null;
  maxPerTransaction?: number | null;
}

export interface Promotion {
  id: string;
  tenantId: string;
  campaignId: string | null;
  name: string;
  type: PromoType;
  objective: Objective;
  status: 'draft' | 'active' | 'paused' | 'exhausted' | 'ended';
  priority: number;
  stackable: boolean;
  excludes: string[];
  rules: PromoRules;
  benefit: Benefit;
  /** Beneficios adicionales entregados junto con `benefit` (beneficio dividido: "$100 en beneficios"). */
  benefits?: Benefit[];
  limits: PromoLimits;
  inventoryInitial: number | null;
  inventoryUsed: number;
  exhaustedAt: string | null;
  partnerId: string | null;
  restrictionsText: string;
  termsText: string;
  createdAt: string;
  updatedAt: string;
}

/** Contexto de una compra sobre el que se evalúan las reglas. */
export interface SaleContext {
  tenantId: string;
  membershipId: string;
  customerType: CustomerType;
  /**
   * Tipos de vehículo de esta compra: el de la placa con la que se identificó al cliente o, si fue
   * por teléfono, los de todos sus vehículos registrados. Vacío si no tiene ninguno.
   */
  vehicleKinds?: VehicleKind[];
  segments: Segment[];
  stationId: string;
  state: string | null;
  city: string | null;
  fuelType: FuelType | null;
  litersMl: number;
  fuelCents: number;
  storeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  at: Date;
  /** Visitas válidas en el mes natural incluyendo esta. */
  visitsThisMonth: number;
  visitsThisWeek: number;
  monthlyCents: number;
  lifetimeCents: number;
  /** Visitas anteriores (sin la actual), la más reciente primero, últimos 60 días. */
  recentVisits: Array<{ at: string; fuelCents: number; storeCents: number }>;
  /** Ticket habitual del cliente (promedio histórico, sin la compra actual). */
  avgTicketCents: number;
  /** Etiquetas de artículos del ticket actual. */
  storeItems: string[];
}

/** Meta personal calculada para un cliente. */
export interface PersonalOffer {
  avgTicketCents: number;
  targetCents: number;
  amountCents: number;
  minNextPurchaseCents: number;
  validDays: number;
  /** Probabilidad estimada de regreso dentro de la vigencia, según su frecuencia. */
  returnProbability: number;
  /** Margen esperado de la segunda visita menos el beneficio, en centavos. */
  expectedProfitCents: number;
}

export interface AppliedBenefit {
  promotionId: string;
  promotionName: string;
  type: PromoType;
  benefit: Benefit;
  /** Meta personal usada, si la promoción es personalizada. */
  personal?: PersonalOffer;
  /** Puntos extra (para points y points_multiplier). */
  points: number;
  /** Dinero virtual acreditado. */
  walletCents: number;
  /** Descuento inmediato sobre el importe. */
  discountCents: number;
  /** Cupón o producto entregado. */
  couponLabel: string | null;
  /** Costo real estimado para la estación, en centavos. */
  costCents: number;
  description: string;
}

export interface Skipped { promotionId: string; promotionName: string; reason: string }

export interface NextHint {
  promotionId: string;
  promotionName: string;
  /** "Te faltan $80 para obtener $50 de dinero virtual." */
  text: string;
  currentCents?: number;
  targetCents?: number;
  currentCount?: number;
  targetCount?: number;
  /** Fecha límite para el regreso, cuando aplica. */
  deadline?: string;
}

export interface EvaluationResult {
  applied: AppliedBenefit[];
  skipped: Skipped[];
  hints: NextHint[];
  totalDiscountCents: number;
  totalPoints: number;
  totalWalletCents: number;
}
