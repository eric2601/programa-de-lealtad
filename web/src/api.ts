import { getLocale, translate } from './i18n';
import type { VehicleKind } from './plates';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Options { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; token?: string | null; headers?: Record<string, string> }

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`/v1${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Error ${res.status}`);
  }
  return data as T;
}

export const pesos = (cents: number) => `$${(cents / 100).toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const litros = (ml: number) => `${(ml / 1000).toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
export const fecha = (iso: string | null | undefined, withYear = false) => iso ? new Date(iso).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }) : '—';
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
/** "5544334317" → "55 4433 4317" para mostrarlo grande y legible. */
export const formatPhone = (digits: string) => {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  return d.length <= 2 ? d : d.length <= 6 ? `${d.slice(0, 2)} ${d.slice(2)}` : `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
};
export { formatPlateInput, isPlateComplete } from './plates';
/** Mensaje de error en lenguaje llano. Los del servidor vienen en español; se traducen si están en el diccionario. */
export const errorMessage = (err: unknown, fallback = 'No se pudo conectar. Revisa la conexión e intenta de nuevo.') => translate(err instanceof ApiError ? err.message : fallback);

/** Artículos de tienda que se pueden marcar en la bomba (la clave se envía en minúsculas al servidor). `label` está en español: pásalo por `t()`. */
export const STORE_ITEMS: { key: string; label: string; icon: 'coffee' | 'water' | 'wash' | 'oil' }[] = [
  { key: 'cafe', label: 'Café', icon: 'coffee' }, { key: 'agua', label: 'Agua', icon: 'water' }, { key: 'lavado', label: 'Lavado', icon: 'wash' }, { key: 'aceite', label: 'Aceite', icon: 'oil' },
];

// ---- Tipos compartidos con el servidor (subconjunto) ----
export interface Program {
  pointValueCents: number;
  fuelPointsPerLiter: { regular: number; premium: number; diesel: number };
  storePointsPer1000Cents: number;
  stampsForReward: number;
  redemption: { minPoints: number; stepPoints: number; reservationMinutes: number };
  description: string;
}
export interface Session {
  token: string;
  user: { id: string; name: string; role: 'owner' | 'admin' | 'manager' | 'attendant' };
  station: { id: string; code: string; name: string };
  tenant: { id: string; name: string };
  program: Program;
}
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'digital' | 'flotilla';
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', digital: 'Pago digital', flotilla: 'Cuenta de flotilla' };
export type CustomerType = 'particular' | 'taxi' | 'moto' | 'plataforma' | 'flotilla';
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = { particular: 'Particular', taxi: 'Taxi', moto: 'Motociclista', plataforma: 'Conductor de plataforma', flotilla: 'Flotilla' };

export interface Member {
  membershipId: string; firstName: string; maskedPhone: string; verified: boolean;
  points: number; heldPoints: number; availablePoints: number; valueCents: number;
  stamps: number; stampsForReward: number; canRedeem: boolean;
  redemption: { minPoints: number; stepPoints: number; pointValueCents: number };
  nextReward: { pointsMissing: number } | null; lastPurchaseAt: string | null;
  scratchPending: number;
  customerType: CustomerType | string; customerTypeLabel: string; walletAvailableCents: number; segments: string[];
}

// ---- Promociones ----
export interface PromoApplied {
  promotionId: string; promotionName: string; type: string;
  points: number; walletCents: number; discountCents: number; couponLabel: string | null; description: string;
  /** Solo al registrar (beneficio ya entregado). */
  couponCode?: string | null;
}
export interface PromoSkipped { promotionId: string; promotionName: string; reason: string }
export interface PromoHint {
  promotionId: string; promotionName: string; text: string;
  currentCents?: number; targetCents?: number; currentCount?: number; targetCount?: number;
  /** Fecha límite (ISO) para regresar y obtener el beneficio, cuando aplica. */
  deadline?: string;
}
export interface PromoEvaluation { applied: PromoApplied[]; skipped: PromoSkipped[]; hints: PromoHint[]; walletEarnCents: number }
export interface PreviewResult {
  fuelCents: number; storeCents: number; totalCents: number; redemptionCents: number;
  discountCents: number; walletAvailableCents: number; walletSpendCents: number; maxWalletSpendCents: number;
  paidCents: number; basePoints: number; promoPoints: number; walletEarnCents: number;
  promotions: { applied: PromoApplied[]; skipped: PromoSkipped[]; hints: PromoHint[]; totalDiscountCents: number; totalPoints: number; totalWalletCents: number };
  segments: string[]; customerType: string;
}
export interface CouponRedeemResult { couponId: string; label: string | null; valueCents: number; membershipId: string }
export interface ScratchPrize { points: number; label: string }
export interface ScratchCardDto { id: string; status: 'available' | 'revealed' | 'expired' | 'cancelled'; createdAt: string; expiresAt: string; saleReference: string | null; prize: ScratchPrize | null }
export interface RevealResponse { cardId: string; status: 'revealed'; prize: ScratchPrize; creditedPoints: number; balance: number; alreadyRevealed: boolean }
export type Lookup = { found: false; blocked: boolean } | { found: true; blocked: false; member: Member; coupons?: CouponDto[]; vehicles?: Vehicle[] };
export interface SaleResult {
  saleId: string; posReference: string; fuelCents: number; storeCents: number; rewardCents: number; paidCents: number;
  discountCents: number; walletSpentCents: number; paymentMethod: PaymentMethod;
  points: { fuel: number; store: number; multiplier: number; multiplierLabel: string | null; total: number; capped: boolean; promo: number };
  promotions: PromoEvaluation;
  wallet: { availableCents: number };
  eligibleLitersMl: number;
  stamp: { awarded: boolean; stamps: number; stampsForReward: number; rewardEarned: boolean };
  scratch: { cardId: string; expiresAt: string } | null;
  member: Member;
}
export interface OutboxMessage { to: string; kind: string; text: string; at: string }

// ---- Portal del cliente ----
export interface LedgerEntry { kind: string; points_delta: number; note: string | null; created_at: string; pos_reference: string | null; fuel_type: string | null; liters_ml: number | null; store_cents: number | null; station: string | null }
export interface ConsentDto { purpose: string; channel: string; granted: number; created_at: string }
export type WalletMovementStatus = 'active' | 'partial' | 'used' | 'expired' | 'cancelled' | 'done';
export interface WalletMovement {
  id: string; kind: 'earn' | 'spend' | 'expire' | 'cancel' | string; amountCents: number; remainingCents: number; status: WalletMovementStatus | string;
  sourceType: string; promotionId: string | null; promotionName: string | null; stationName: string | null; saleReference: string | null;
  expiresAt: string | null; note: string | null; createdAt: string;
  /** Condiciones de uso en texto ("compra mínima $400 · uso único") y sus componentes. */
  conditions?: string | null; minPurchaseCents?: number; scope?: 'any' | 'fuel' | 'store' | string; singleUse?: boolean;
}
export interface WalletSummary {
  availableCents: number; generatedCents: number; usedCents: number; expiredCents: number; cancelledCents: number;
  nextExpiry: { cents: number; at: string } | null;
  movements: WalletMovement[];
}
export interface CouponDto {
  id: string; code: string; kind: string; valueCents: number; status: 'issued' | 'redeemed' | 'expired' | 'cancelled' | string;
  validFrom: string | null; validUntil: string; label: string | null; promotionName: string | null; partnerName: string | null; redeemedAt: string | null;
}
export interface PromoProgress { text: string; current: number; target: number; unit: 'cents' | 'visits'; deadline?: string }
/** Meta personal calculada para el cliente (promociones personalizadas). */
export interface PersonalOffer { targetCents: number; amountCents: number; minNextPurchaseCents?: number; validDays: number; returnProbability?: number }
export interface LadderTier { minAmountCents: number; label: string }
export interface PromoInventory { initial: number | null; used: number; remaining: number | null; percentUsed: number | null; exhaustedAt: string | null; exhausted: boolean }
export interface PortalPromotion {
  id: string; name: string; type: string; typeLabel: string; objective: string; campaignId: string | null;
  condition: string; benefitLabel: string; startsAt: string | null; endsAt: string | null; endsSoon: boolean;
  stationNames: string[]; nearby: boolean; restrictions: string[]; inventory: PromoInventory; usedByMe: number;
  progress: PromoProgress | null; ladder: LadderTier[] | null; minFuelCents: number | null; minLitersMl: number | null;
  personal?: PersonalOffer | null;
}
export interface PortalNotification { id: string; kind: string; kindLabel: string; title: string; body: string; status: string; createdAt: string }
export interface PortalMembership extends Member {
  tenantName: string; entries: LedgerEntry[]; consents: ConsentDto[]; scratchCards: ScratchCardDto[];
  wallet: WalletSummary; coupons: CouponDto[]; promotions: PortalPromotion[]; segmentLabels: string[]; homeStation: string | null;
  stats: { visitsThisMonth: number; monthlyCents: number; visits30: number; avgTicketCents: number };
  notifications: PortalNotification[];
}
export interface Vehicle { id: string; plate: string; kind: VehicleKind; kindLabel: string }
export interface PortalMe { phone: string; verified: boolean; vehicles: Vehicle[]; memberships: PortalMembership[] }

// ---- Dashboard de operación del día ----
export interface TodayTotals { sales: number; litersMl: number; salesCents: number; storeCents: number; points: number; customers: number; discountCents: number; walletSpentCents: number }
export interface TodayDashboard {
  at: string; dayStart: string; localHour: number; stationId: string | null;
  today: TodayTotals & { pointsValueCents: number; promoUses: number; promoCostCents: number; promoMembers: number; walletIssuedCents: number; walletUsedCents: number; newMembers: number; scratchIssued: number; scratchPending: number };
  lastWeek: { soFar: TodayTotals; full: TodayTotals; salesChangePct: number | null; litersChangePct: number | null; salesCentsChangePct: number | null; customersChangePct: number | null };
  hours: { hour: number; sales: number; litersMl: number; salesCents: number; lastWeekSales: number }[];
  fuelMix: Record<string, number>; payMix: Record<string, number>;
  attendants: { name: string; station: string; sales: number; litersMl: number; distinctMembers: number }[];
  promoUses: { id: string; name: string; uses: number; cost: number }[];
  alerts: { kind: 'wallet_expiring' | 'promo_ending' | 'promo_exhausted' | 'concentration' | 'scratch_pending'; text: string; count?: number }[];
  recent: { id: string; at: string; firstName: string; attendant: string; station: string; pump: number | null; fuelType: string | null; litersMl: number; amountCents: number; storeCents: number; points: number; paymentMethod: string; walletSpentCents: number; promos: string[] }[];
}
export interface StationDto { id: string; code: string; name: string }
