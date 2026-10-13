/**
 * Tipos y cliente HTTP del panel administrativo. Refleja las respuestas de /v1/admin/* del servidor
 * (server/src/http/app.ts y los servicios analytics, promotions, research, partners, segments,
 * wallet y notifications). Se mantiene separado de web/src/api.ts para no mezclar con la bomba.
 */
import { ApiError } from '../api';
import { getLocale, translate } from '../i18n';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function adminApi<T>(path: string, token: string, opts: { method?: Method; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/v1/admin${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? translate('Error {status}', { status: res.status }));
  }
  return data as T;
}

export const errorText = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : translate('Sin conexión con el servidor.'));

// ---- Catálogos ------------------------------------------------------------------------
export interface Labeled { key: string; label: string }
export interface Catalog {
  objectives: Labeled[]; promoTypes: Labeled[]; customerTypes: Labeled[]; vehicleKinds: Labeled[]; segments: Labeled[];
  paymentMethods: string[]; partnerTypes: Labeled[]; researchTypes: Labeled[];
}
export interface Station { id: string; code: string; name: string; state: string | null; city: string | null; municipality: string | null; region: string | null }

export type FuelType = 'regular' | 'premium' | 'diesel';
/** Etiquetas en español (claves del diccionario); se traducen al dibujar: `t(FUEL_LABELS[x])`. Igual para los demás mapas *_LABELS. */
export const FUEL_LABELS: Record<FuelType, string> = { regular: 'Regular', premium: 'Premium', diesel: 'Diésel' };
export const PAYMENT_LABELS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', digital: 'Pago digital', flotilla: 'Cuenta de flotilla' };
export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ---- Promociones ----------------------------------------------------------------------
export type BenefitType = 'points' | 'points_multiplier' | 'virtual_money' | 'cashback_percent' | 'discount_per_liter' | 'discount_percent' | 'discount_fixed' | 'coupon' | 'product' | 'partner_coupon' | 'scratch' | 'two_for_one';
export const BENEFIT_LABELS: Record<BenefitType, string> = {
  points: 'Puntos fijos', points_multiplier: 'Multiplicador de puntos', virtual_money: 'Dinero virtual', cashback_percent: 'Cashback (%)',
  discount_per_liter: 'Descuento por litro', discount_percent: 'Descuento porcentual', discount_fixed: 'Descuento fijo', coupon: 'Cupón',
  product: 'Producto gratis', partner_coupon: 'Cupón de asociado', scratch: 'Tarjeta Rasca y Gana', two_for_one: '2x1',
};
export interface Benefit {
  type: BenefitType; points?: number; multiplier?: number; amountCents?: number; percent?: number; centsPerLiter?: number;
  label?: string; couponDays?: number; partnerBenefitId?: string; walletExpiresDays?: number;
}
export interface Tier { minAmountCents: number; benefit: Benefit }
export interface PromoRules {
  startsAt?: string; endsAt?: string; daysOfWeek?: number[]; hourFrom?: number; hourTo?: number;
  stationIds?: string[]; states?: string[]; cities?: string[]; fuelTypes?: FuelType[];
  minFuelCents?: number; minTotalCents?: number; minLitersMl?: number; paymentMethods?: string[]; customerTypes?: string[]; vehicleKinds?: string[]; segments?: string[];
  visitsInPeriod?: { count: number; period: 'month' | 'week' | 'days'; days?: number };
  minMonthlyCents?: number; minLifetimeCents?: number; requiresStore?: boolean; tiers?: Tier[];
}
export interface PromoLimits { maxUses?: number | null; maxPerCustomer?: number | null; maxPerDay?: number | null; maxPerMonth?: number | null; maxDiscountCents?: number | null; maxPerTransaction?: number | null }
export type PromoStatus = 'draft' | 'active' | 'paused' | 'exhausted' | 'ended';
export interface Inventory { initial: number | null; used: number; remaining: number | null; percentUsed: number | null; exhaustedAt: string | null; exhausted: boolean }
export interface Usage { uses: number; costCents: number; members: number }

export interface PromotionInput {
  campaignId: string | null; name: string; type: string; objective: string; status: PromoStatus; priority: number; stackable: boolean;
  excludes: string[]; rules: PromoRules; benefit: Benefit; limits: PromoLimits; inventoryInitial: number | null; partnerId: string | null;
  restrictionsText?: string; termsText?: string;
}
export interface PromotionView extends PromotionInput {
  id: string; tenantId: string; inventoryUsed: number; exhaustedAt: string | null; restrictionsText: string; termsText: string; createdAt: string; updatedAt: string;
  typeLabel: string; objectiveLabel: string; condition: string; rulesSummary: string[]; restrictions: string[]; terms: string;
  inventory: Inventory; endsSoon: boolean; usage: Usage; stationNames: string[];
}
export interface AdContent { title: string; subtitle: string; description: string; cta: string; terms: string; validity: string; shortText: string; formats: Record<string, string> }
export interface PromotionDetail extends PromotionView {
  ads: AdContent;
  recentUsages: { created_at: string; cost_cents: number; benefit_json: string; first_name: string; station: string; pos_reference: string; fuel_cents: number; store_cents: number }[];
  usageByDay: { day: string; uses: number; cost: number | null }[];
}
export interface PromotionImpact {
  promotion: { id: string; name: string };
  avgTicketBeforeCents: number; avgTicketDuringCents: number; avgTicketChangePct: number | null;
  avgLitersBeforeMl: number; avgLitersDuringMl: number; txPerDayBefore: number; txPerDayDuring: number;
  participants: number; benefitsDelivered: number; costCents: number; salesIncreaseCents: number; incrementalMarginCents: number; roi: number | null;
}

// ---- Campañas -------------------------------------------------------------------------
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'ended';
export interface CampaignPromo { id: string; name: string; type: string; typeLabel: string; status: PromoStatus; stackable: boolean; priority: number; inventory: Inventory; condition: string }
export interface Campaign {
  id: string; name: string; description: string; objective: string; objectiveLabel: string; status: CampaignStatus; startsAt: string; endsAt: string;
  budgetCents: number | null; createdAt: string; promotions: CampaignPromo[]; usage: Usage;
}
export interface CampaignInput { name: string; description: string; objective: string; status: CampaignStatus; startsAt: string; endsAt: string; budgetCents: number | null }
export interface PeriodMetrics {
  from: string; to: string; days: number; transactions: number; salesCents: number; fuelCents: number; storeCents: number; litersMl: number;
  avgTicketCents: number; avgLitersMl: number; txPerDay: number; newCustomers: number; recurringCustomers: number; participants: number;
  benefitsCostCents: number; benefitsDelivered: number; walletIssuedCents: number;
}
export type Verdict = 'funciono' | 'parcial' | 'sin_impacto' | 'perdidas' | 'sin_datos';
export interface CampaignEvaluation {
  campaign: { id: string; name: string; status: string; objective: string; objectiveLabel: string; startsAt: string; endsAt: string; budgetCents: number | null };
  periods: { before: PeriodMetrics; during: PeriodMetrics; after: PeriodMetrics | null };
  variation: { avgTicketPct: number | null; avgLitersPct: number | null; transactionsPerDayPct: number | null; newCustomers: number; recurringCustomers: number };
  economics: { benefitsCostCents: number; benefitsDelivered: number; revenueCents: number; revenueBeforeCents: number; incrementalMarginCents: number; roi: number | null; budgetCents: number | null; budgetUsedPct: number | null };
  verdict: Verdict; verdictLabel: string; recommendation: string; explanation: string;
  promotions: { id: string; name: string; type: string; typeLabel: string; status: string; uses: number; cost: number; members: number }[];
  note: string;
}

// ---- Dashboard ------------------------------------------------------------------------
export interface DashboardDay {
  day: string; transactions: number; salesCents: number; litersMl: number; avgTicketCents: number; customers: number;
  newCustomers: number; recurringCustomers: number; walletIssuedCents: number; walletUsedCents: number; promoUses: number;
}
export interface Dashboard {
  range: { from: string; to: string };
  kpis: {
    salesCents: number; salesChangePct: number | null; avgTicketCents: number; avgTicketChangePct: number | null; prevAvgTicketCents: number;
    litersMl: number; litersChangePct: number | null; transactions: number; transactionsChangePct: number | null;
    activePromotions: number; expiringPromotions: number; exhaustedPromotions: number; nearlyExhausted: number;
    walletGeneratedCents: number; walletUsedCents: number; walletExpiredCents: number; walletOutstandingCents: number;
    newCustomers: number; recurringCustomers: number; participants: number; promoUses: number; promoCostCents: number; incrementalMarginCents: number; roi: number | null;
  };
  series: DashboardDay[];
  byStation: { id: string; code: string; name: string; city: string | null; state: string | null; transactions: number; sales_cents: number; liters_ml: number }[];
  promoUsage: { id: string; name: string; type: string; typeLabel: string; uses: number; cost: number; members: number }[];
  campaigns: { id: string; name: string; status: string; objective: string; objectiveLabel: string; starts_at: string; ends_at: string; uses: number; cost: number; sales: number }[];
  expiring: { id: string; name: string; endsAt?: string }[];
  nearlyExhausted: { id: string; name: string; initial: number | null; used: number }[];
}

// ---- Generador ------------------------------------------------------------------------
export interface GeneratorInput {
  objective: string; fuelTypes?: FuelType[]; location?: { stationIds?: string[]; states?: string[]; cities?: string[] };
  customerTypes?: string[]; segments?: string[];
  consumption?: { minAmountCents?: number; minLitersMl?: number; visits?: number; monthlyCents?: number; lifetimeCents?: number };
}
export interface Proposal {
  key: string; name: string; type: string; objective: string; rules: PromoRules; benefit: Benefit; limits: PromoLimits; stackable: boolean; priority: number;
  inventoryInitial: number | null; rationale: string; kpi: string; estimatedCostCents: number; condition: string; risk: string;
}

// ---- Investigación --------------------------------------------------------------------
export interface ResearchItem {
  id: string; competitor: string; name: string; type: string; typeLabel: string; benefit: string; startDate: string | null; endDate: string | null;
  region: string | null; state: string | null; city: string | null; station: string | null; audience: string | null; validityText: string | null;
  resultRating: number | null; resultNotes: string | null; estimatedCostCents: number | null; sourceUrl: string | null; verified: boolean; createdAt: string;
}
export interface ResearchInput {
  competitor: string; name: string; type: string; benefit: string; startDate: string | null; endDate: string | null; region: string | null; state: string | null;
  city: string | null; station: string | null; audience: string | null; validityText: string | null; resultRating: number | null; resultNotes: string | null;
  estimatedCostCents: number | null; sourceUrl: string | null; verified: boolean;
}
export interface ResearchSummary {
  byType: { type: string; label: string; count: number; avgRating: number | null; avgCostCents: number | null; verified: number }[];
  byCompetitor: { competitor: string; count: number; avgRating: number | null }[];
  byState: { state: string; n: number }[];
  insight: string;
}
export interface ResearchResponse { items: ResearchItem[]; summary: ResearchSummary }

// ---- Asociados ------------------------------------------------------------------------
export interface PartnerBenefit {
  id: string; partnerId: string; name: string; description: string; valueCents: number; codePrefix: string; validFrom: string | null; validUntil: string | null;
  stationIds: string[]; inventory: Inventory; usesCount: number;
}
export interface Partner { id: string; name: string; type: string; typeLabel: string; contact: string; active: boolean; createdAt: string; benefits: PartnerBenefit[] }
export interface PartnerInput { name: string; type: string; contact: string; active: boolean }
export interface PartnerBenefitInput { name: string; description: string; valueCents: number; codePrefix: string; inventoryInitial: number | null; validFrom: string | null; validUntil: string | null; stationIds: string[] }

// ---- Segmentos ------------------------------------------------------------------------
export interface SegmentCount { key: string; label: string; members: number; avgTicketCents: number; avgVisits30: number }
export interface SegmentMember { membershipId: string; firstName: string; customerType: string; station: string | null; points: number; visits30: number; avgTicketCents: number; segments: string[] }

// ---- Dinero virtual -------------------------------------------------------------------
export interface WalletMovement {
  id: string; kind: string; amountCents: number; remainingCents: number; status: string; sourceType: string; promotionId: string | null; promotionName: string | null;
  stationName: string | null; saleReference: string | null; expiresAt: string | null; note: string | null; createdAt: string;
}
export interface WalletSummary { availableCents: number; generatedCents: number; usedCents: number; expiredCents: number; cancelledCents: number; nextExpiry: { cents: number; at: string } | null; movements: WalletMovement[] }
export interface WalletMember {
  membershipId: string; firstName: string; maskedPhone: string; verified: boolean; points: number; availablePoints: number; valueCents: number;
  lastPurchaseAt: string | null; customerType: string; customerTypeLabel: string; walletAvailableCents: number; segments: string[];
}
export interface WalletCoupon { id: string; code: string; kind: string; valueCents: number; status: string; validFrom: string; validUntil: string; label: string | null; promotionName: string | null; partnerName: string | null; redeemedAt: string | null }
export interface WalletResponse { member: WalletMember; wallet: WalletSummary; coupons: WalletCoupon[] }

// ---- Notificaciones -------------------------------------------------------------------
export interface NotificationItem { id: string; kind: string; kindLabel: string; title: string; body: string; channel: string; status: string; firstName: string | null; createdAt: string }
export interface NotificationsResponse { items: NotificationItem[]; counts: { kind: string; label: string; count: number }[] }

// ---- Formato --------------------------------------------------------------------------
export const fmtDate = (iso: string | null | undefined, withTime = false): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(getLocale(), withTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtPct = (v: number | null | undefined, signed = true): string => (v === null || v === undefined ? '—' : `${signed && v > 0 ? '+' : ''}${v.toLocaleString(getLocale(), { maximumFractionDigits: 1 })} %`);
export const fmtNum = (v: number): string => v.toLocaleString(getLocale());
export const fmtRoi = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString(getLocale(), { maximumFractionDigits: 0 })} %`);
/** Convierte un texto en pesos ("350.50") a centavos enteros; vacío → null. */
export const toCents = (s: string): number | null => { const n = Number(String(s).replace(/[^0-9.-]/g, '')); return s.trim() === '' || Number.isNaN(n) ? null : Math.round(n * 100); };
export const fromCents = (c: number | null | undefined): string => (c === null || c === undefined ? '' : (c / 100).toString());
/** Fecha ISO → valor para <input type="datetime-local"> en hora local. */
export const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (s: string): string | undefined => (s ? new Date(s).toISOString() : undefined);

export const PROMO_STATUS_LABELS: Record<PromoStatus, string> = { draft: 'Borrador', active: 'Activa', paused: 'Pausada', exhausted: 'Agotada', ended: 'Terminada' };
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = { draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', ended: 'Terminada' };
export const statusTone = (s: string): 'ok' | 'warn' | 'crit' | 'neutral' | 'info' =>
  s === 'active' ? 'ok' : s === 'paused' || s === 'scheduled' ? 'warn' : s === 'exhausted' || s === 'ended' ? 'crit' : s === 'draft' ? 'neutral' : 'info';
export const WALLET_STATUS_LABELS: Record<string, string> = { active: 'Activo', partial: 'Parcialmente utilizado', used: 'Utilizado', expired: 'Expirado', cancelled: 'Cancelado', done: 'Aplicado' };
export const WALLET_KIND_LABELS: Record<string, string> = { earn: 'Abono', spend: 'Uso', expire: 'Expiración', cancel: 'Cancelación', reverse: 'Devolución' };
/** Describe un beneficio en el idioma activo (se evalúa al dibujar, no al cargar el módulo). */
export const describeBenefit = (b: Benefit): string => {
  const p = (c: number) => `$${(c / 100).toLocaleString(getLocale())}`;
  switch (b.type) {
    case 'points': return translate('{n} puntos', { n: b.points ?? 0 });
    case 'points_multiplier': return translate('puntos ×{n}', { n: b.multiplier ?? 2 });
    case 'virtual_money': return translate('{amount} de dinero virtual', { amount: p(b.amountCents ?? 0) });
    case 'cashback_percent': return translate('{pct} % de cashback', { pct: b.percent ?? 0 });
    case 'discount_per_liter': return translate('{cents} ¢ de descuento por litro', { cents: b.centsPerLiter ?? 0 });
    case 'discount_percent': return translate('{pct} % de descuento', { pct: b.percent ?? 0 });
    case 'discount_fixed': return translate('{amount} de descuento', { amount: p(b.amountCents ?? 0) });
    case 'two_for_one': return translate('2x1 en {product}', { product: b.label ?? translate('producto') });
    case 'scratch': return translate('una tarjeta Rasca y Gana');
    default: return b.label ?? translate('un cupón');
  }
};
