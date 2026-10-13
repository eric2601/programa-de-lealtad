import type { ProgramConfig } from '../rules.js';
import { VEHICLE_KIND_LABELS } from '../plate.js';
import type { AppliedBenefit, Benefit, EvaluationResult, NextHint, PersonalOffer, PersonalizedRule, PromoRules, Promotion, SaleContext, Skipped, Tier } from './types.js';

export interface UsageCounts { total: number; byCustomer: number; today: number; thisMonth: number; periodTriggered: boolean }

export interface EngineInput {
  promotions: Promotion[];
  usage: (promotionId: string) => UsageCounts;
  ctx: SaleContext;
  program: ProgramConfig;
  /** Puntos base de la compra, para calcular multiplicadores. */
  basePoints: number;
  /** Máximo de promociones por transacción (configuración del grupo). */
  maxPerTransaction: number;
}

const pesos = (c: number) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------
// Cálculos de historial: visitas calificadas, regreso reciente, cadena de regresos, meta personal
// ---------------------------------------------------------------------------------------

/** Visitas dentro del periodo (mes natural, 7 días o N días) que cumplen la carga mínima, sin contar la actual. */
export function qualifyingVisits(ctx: SaleContext, period: 'month' | 'week' | 'days', days: number | undefined, minFuelCents: number): number {
  const at = ctx.at;
  const from = period === 'month' ? new Date(at.getFullYear(), at.getMonth(), 1) : new Date(at.getTime() - (period === 'week' ? 7 : (days ?? 30)) * DAY);
  return (ctx.recentVisits ?? []).filter((v) => new Date(v.at) >= from && v.fuelCents >= minFuelCents).length;
}

/** Última visita anterior que cumple la carga mínima. */
export function lastQualifyingVisit(ctx: SaleContext, minFuelCents: number) {
  return (ctx.recentVisits ?? []).find((v) => v.fuelCents >= minFuelCents) ?? null;
}

/**
 * Cadena de regresos: cuántas visitas consecutivas (hacia atrás desde la actual) ocurrieron
 * cada una dentro de `withinDays` de la anterior. La actual cuenta si está dentro de la ventana
 * respecto de la última. Devuelve 0 si la visita actual no es un regreso a tiempo.
 */
export function returnStreak(ctx: SaleContext, withinDays: number, minFuelCents = 0): number {
  const visits = (ctx.recentVisits ?? []).filter((v) => v.fuelCents >= minFuelCents);
  if (ctx.fuelCents < minFuelCents) return 0;
  let prev = ctx.at.getTime();
  let streak = 0;
  for (const v of visits) {
    const t = new Date(v.at).getTime();
    if (prev - t <= withinDays * DAY && prev - t >= 0) { streak++; prev = t; } else break;
  }
  return streak;
}

/** Meta personal: ticket habitual más un incremento, redondeada; beneficio según tabla. */
export function personalOffer(rule: PersonalizedRule, avgTicketCents: number, visits30: number, program: ProgramConfig): PersonalOffer {
  const base = avgTicketCents > 0 ? avgTicketCents : rule.minTargetCents;
  let target = Math.ceil((base * (1 + rule.upliftPercent / 100)) / rule.roundToCents) * rule.roundToCents;
  target = Math.min(rule.maxTargetCents, Math.max(rule.minTargetCents, target));
  const row = [...rule.benefitTable].sort((a, b) => a.targetCents - b.targetCents).find((r) => r.targetCents >= target) ?? rule.benefitTable[rule.benefitTable.length - 1];
  const amount = row?.amountCents ?? 0;
  const minNext = Math.ceil((target * rule.minNextPurchasePercent) / 100 / 1000) * 1000;
  // Probabilidad de regresar dentro de la vigencia con un proceso de Poisson según su frecuencia de 30 días.
  const rate = Math.max(0.5, visits30) / 30;
  const returnProbability = Math.round((1 - Math.exp(-rate * rule.validDays)) * 100) / 100;
  // Margen esperado: la segunda visita (al menos la compra mínima) deja margen por litro; se resta el beneficio ponderado por su probabilidad de uso.
  const liters = minNext / 2400;
  const expectedProfitCents = Math.round(returnProbability * (liters * program.marginCentsPerLiter) - returnProbability * amount);
  return { avgTicketCents, targetCents: target, amountCents: amount, minNextPurchaseCents: minNext, validDays: rule.validDays, returnProbability, expectedProfitCents };
}

// ---------------------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------------------

/** Devuelve la razón por la que la promoción no aplica, o null si aplica. */
export function checkRules(p: Promotion, ctx: SaleContext, usage: UsageCounts, program: ProgramConfig): string | null {
  const r = p.rules;
  if (p.status !== 'active') return `estado ${p.status}`;
  if (p.inventoryInitial !== null && p.inventoryUsed >= p.inventoryInitial) return 'existencias agotadas';
  const atIso = ctx.at.toISOString();
  if (r.startsAt && atIso < r.startsAt) return 'todavía no inicia';
  if (r.endsAt && atIso > r.endsAt) return 'vigencia terminada';
  if (r.daysOfWeek && r.daysOfWeek.length && !r.daysOfWeek.includes(ctx.at.getDay())) return 'no aplica este día';
  if (r.hourFrom !== undefined && r.hourTo !== undefined) {
    const h = ctx.at.getHours();
    const inRange = r.hourFrom <= r.hourTo ? h >= r.hourFrom && h < r.hourTo : h >= r.hourFrom || h < r.hourTo;
    if (!inRange) return 'fuera de horario';
  }
  if (r.stationIds && r.stationIds.length && !r.stationIds.includes(ctx.stationId)) return 'estación no participante';
  if (r.states && r.states.length && (!ctx.state || !r.states.includes(ctx.state))) return 'estado no participante';
  if (r.cities && r.cities.length && (!ctx.city || !r.cities.includes(ctx.city))) return 'ciudad no participante';
  if (r.fuelTypes && r.fuelTypes.length && (!ctx.fuelType || !r.fuelTypes.includes(ctx.fuelType))) return 'combustible no participante';
  if (r.paymentMethods && r.paymentMethods.length && !r.paymentMethods.includes(ctx.paymentMethod)) return 'método de pago no participante';
  if (r.customerTypes && r.customerTypes.length && !r.customerTypes.includes(ctx.customerType)) return 'tipo de cliente no participante';
  if (r.vehicleKinds?.length && !(ctx.vehicleKinds ?? []).some((k) => r.vehicleKinds!.includes(k))) return 'tipo de vehículo no participante';
  if (r.segments && r.segments.length && !r.segments.some((s) => ctx.segments.includes(s))) return 'segmento no participante';
  const l = p.limits;
  if (l.maxUses && usage.total >= l.maxUses) return 'límite de usos alcanzado';
  if (l.maxPerCustomer && usage.byCustomer >= l.maxPerCustomer) return 'límite por cliente alcanzado';
  if (l.maxPerDay && usage.today >= l.maxPerDay) return 'límite diario alcanzado';
  if (l.maxPerMonth && usage.thisMonth >= l.maxPerMonth) return 'límite mensual alcanzado';
  // A partir de aquí, razones "de monto o de historial": generan sugerencia "te faltan…".
  if (r.minFuelCents && ctx.fuelCents < r.minFuelCents) return `compra mínima de combustible ${pesos(r.minFuelCents)}`;
  if (r.minTotalCents && ctx.totalCents < r.minTotalCents) return `compra mínima ${pesos(r.minTotalCents)}`;
  if (r.minLitersMl && ctx.litersMl < r.minLitersMl) return `mínimo ${r.minLitersMl / 1000} litros`;
  if (r.minStoreCents && ctx.storeCents < r.minStoreCents) return `compra mínima en tienda ${pesos(r.minStoreCents)}`;
  if (r.requiresStore && ctx.storeCents <= 0) return 'requiere compra en tienda';
  if (r.requiresItems?.length && !r.requiresItems.every((i) => ctx.storeItems.includes(i))) return `requiere ${r.requiresItems.join(' y ')} en el ticket`;
  if (r.visitsInPeriod) {
    const min = r.visitsInPeriod.qualifyingMinFuelCents ?? 0;
    const visits = min ? qualifyingVisits(ctx, r.visitsInPeriod.period, r.visitsInPeriod.days, min) + (ctx.fuelCents >= min ? 1 : 0) : (r.visitsInPeriod.period === 'week' ? ctx.visitsThisWeek : ctx.visitsThisMonth);
    if (visits < r.visitsInPeriod.count) return `visita ${visits} de ${r.visitsInPeriod.count}`;
    if (usage.periodTriggered) return 'ya se entregó en este periodo';
  }
  if (r.returnWithinDays) {
    const last = lastQualifyingVisit(ctx, r.returnWithinDays.minPrevFuelCents ?? 0);
    if (!last) return 'sin visita previa que califique';
    const daysAgo = (ctx.at.getTime() - new Date(last.at).getTime()) / DAY;
    if (daysAgo > r.returnWithinDays.days) return `visita anterior hace más de ${r.returnWithinDays.days} días`;
  }
  if (r.returnStreak) {
    if (returnStreak(ctx, r.returnStreak.withinDays, r.returnStreak.minFuelCents ?? 0) < 1) return `visita inicial: regresa en ${r.returnStreak.withinDays} días`;
  }
  if (r.minMonthlyCents && ctx.monthlyCents < r.minMonthlyCents) return `consumo mensual mínimo ${pesos(r.minMonthlyCents)}`;
  if (r.minLifetimeCents && ctx.lifetimeCents < r.minLifetimeCents) return `consumo acumulado mínimo ${pesos(r.minLifetimeCents)}`;
  if (r.tiers && r.tiers.length && !r.tiers.some((t) => ctx.fuelCents >= t.minAmountCents)) return `compra mínima ${pesos(Math.min(...r.tiers.map((t) => t.minAmountCents)))}`;
  if (r.personalized) {
    const offer = personalOffer(r.personalized, ctx.avgTicketCents, (ctx.recentVisits ?? []).filter((v) => ctx.at.getTime() - new Date(v.at).getTime() <= 30 * DAY).length, program);
    if (ctx.fuelCents < offer.targetCents) return `meta personal ${pesos(offer.targetCents)}`;
  }
  return null;
}

export function pickTier(tiers: Tier[], fuelCents: number): Tier | null {
  const ok = tiers.filter((t) => fuelCents >= t.minAmountCents).sort((a, b) => b.minAmountCents - a.minAmountCents);
  return ok[0] ?? null;
}

/** Costo real estimado del beneficio para la estación. */
export function benefitCost(b: Benefit, program: ProgramConfig, computed: { points: number; walletCents: number; discountCents: number }): number {
  switch (b.type) {
    case 'points': case 'points_multiplier': return computed.points * program.pointValueCents;
    case 'virtual_money': case 'cashback_percent': return b.scope === 'store' ? Math.round(computed.walletCents * (1 - program.storeMarginPercent / 100)) : computed.walletCents;
    case 'discount_per_liter': case 'discount_percent': case 'discount_fixed': case 'two_for_one': return computed.discountCents;
    case 'coupon': case 'product': case 'partner_coupon': return Math.round((b.amountCents ?? 0) * 0.4);
    case 'scratch': return Math.round(37 * program.pointValueCents);
  }
}

export function computeBenefit(p: Promotion, b: Benefit, ctx: SaleContext, program: ProgramConfig, basePoints: number): AppliedBenefit {
  let points = 0, walletCents = 0, discountCents = 0, couponLabel: string | null = null, description = '';
  switch (b.type) {
    case 'points': points = b.points ?? 0; description = `+${points} puntos`; break;
    case 'points_multiplier': points = Math.floor(basePoints * ((b.multiplier ?? 2) - 1)); description = `puntos ×${b.multiplier ?? 2} (+${points})`; break;
    case 'virtual_money': walletCents = b.amountCents ?? 0; description = `${pesos(walletCents)} de dinero virtual${b.scope === 'store' ? ' para tienda' : b.scope === 'fuel' ? ' para combustible' : ''}${b.minNextPurchaseCents ? ` (compra mínima ${pesos(b.minNextPurchaseCents)})` : ''}`; break;
    case 'cashback_percent': walletCents = Math.floor((ctx.fuelCents * (b.percent ?? 0)) / 100); description = `${b.percent}% de cashback (${pesos(walletCents)})`; break;
    case 'discount_per_liter': discountCents = Math.floor((ctx.litersMl * (b.centsPerLiter ?? 0)) / 1000); description = `${b.centsPerLiter}¢ por litro (−${pesos(discountCents)})`; break;
    case 'discount_percent': discountCents = Math.floor((ctx.totalCents * (b.percent ?? 0)) / 100); description = `${b.percent}% de descuento (−${pesos(discountCents)})`; break;
    case 'discount_fixed': discountCents = b.amountCents ?? 0; description = `−${pesos(discountCents)}`; break;
    case 'two_for_one': discountCents = b.amountCents ?? 0; description = `2x1 ${b.label ?? ''} (−${pesos(discountCents)})`; break;
    case 'coupon': case 'product': case 'partner_coupon': couponLabel = b.label ?? 'Cupón'; description = couponLabel; break;
    case 'scratch': description = 'Tarjeta Rasca y Gana'; break;
  }
  if (p.limits.maxDiscountCents) {
    discountCents = Math.min(discountCents, p.limits.maxDiscountCents);
    walletCents = Math.min(walletCents, p.limits.maxDiscountCents);
  }
  discountCents = Math.min(discountCents, ctx.totalCents);
  const costCents = benefitCost(b, program, { points, walletCents, discountCents });
  return { promotionId: p.id, promotionName: p.name, type: p.type, benefit: b, points, walletCents, discountCents, couponLabel, costCents, description };
}

/** Beneficios que entrega una promoción que aplica, resolviendo escalones, cadenas y metas personales. */
export function resolveBenefits(p: Promotion, ctx: SaleContext, program: ProgramConfig): { benefits: Benefit[]; personal?: PersonalOffer } {
  const r = p.rules;
  if (r.tiers?.length) return { benefits: [pickTier(r.tiers, ctx.fuelCents)!.benefit, ...(p.benefits ?? [])] };
  if (r.returnStreak) {
    const k = returnStreak(ctx, r.returnStreak.withinDays, r.returnStreak.minFuelCents ?? 0);
    const rewards = r.returnStreak.rewardsCents;
    const amount = rewards[Math.min(k, rewards.length) - 1] ?? 0;
    return { benefits: [{ ...p.benefit, type: 'virtual_money', amountCents: amount, walletExpiresDays: p.benefit.walletExpiresDays ?? r.returnStreak.withinDays }] };
  }
  if (r.personalized) {
    const offer = personalOffer(r.personalized, ctx.avgTicketCents, (ctx.recentVisits ?? []).filter((v) => ctx.at.getTime() - new Date(v.at).getTime() <= 30 * DAY).length, program);
    return { benefits: [{ ...p.benefit, type: 'virtual_money', amountCents: offer.amountCents, minNextPurchaseCents: offer.minNextPurchaseCents, walletExpiresDays: offer.validDays, singleUse: true }], personal: offer };
  }
  return { benefits: [p.benefit, ...(p.benefits ?? [])] };
}

function hintFor(p: Promotion, ctx: SaleContext, usage: UsageCounts, program: ProgramConfig): NextHint | null {
  const r = p.rules;
  if (p.status !== 'active') return null;
  const base = { promotionId: p.id, promotionName: p.name };
  if (r.personalized) {
    const offer = personalOffer(r.personalized, ctx.avgTicketCents, (ctx.recentVisits ?? []).filter((v) => ctx.at.getTime() - new Date(v.at).getTime() <= 30 * DAY).length, program);
    if (ctx.fuelCents < offer.targetCents) return { ...base, text: `Tu meta personal: carga ${pesos(offer.targetCents)} y recibe ${pesos(offer.amountCents)} para tu próxima visita. Te faltan ${pesos(offer.targetCents - ctx.fuelCents)}.`, currentCents: ctx.fuelCents, targetCents: offer.targetCents };
    return null;
  }
  if (r.tiers && r.tiers.length) {
    const next = [...r.tiers].sort((a, b) => a.minAmountCents - b.minAmountCents).find((t) => ctx.fuelCents < t.minAmountCents);
    if (next) return { ...base, text: `Te faltan ${pesos(next.minAmountCents - ctx.fuelCents)} para obtener ${describeBenefit(next.benefit)}.`, currentCents: ctx.fuelCents, targetCents: next.minAmountCents };
    return null;
  }
  if (r.minFuelCents && ctx.fuelCents < r.minFuelCents) {
    return { ...base, text: `Te faltan ${pesos(r.minFuelCents - ctx.fuelCents)} para obtener ${describeBenefit(p.benefit, p.benefits)}.`, currentCents: ctx.fuelCents, targetCents: r.minFuelCents };
  }
  if (r.minStoreCents && ctx.storeCents < r.minStoreCents) {
    return { ...base, text: `Agrega ${pesos(r.minStoreCents - ctx.storeCents)} en tienda para obtener ${describeBenefit(p.benefit)}.`, currentCents: ctx.storeCents, targetCents: r.minStoreCents };
  }
  if (r.requiresItems?.length && !r.requiresItems.every((i) => ctx.storeItems.includes(i))) {
    return { ...base, text: `Agrega ${r.requiresItems.join(' y ')} a tu compra y obtén ${describeBenefit(p.benefit)}.` };
  }
  if (r.visitsInPeriod && !usage.periodTriggered) {
    const min = r.visitsInPeriod.qualifyingMinFuelCents ?? 0;
    const visits = min ? qualifyingVisits(ctx, r.visitsInPeriod.period, r.visitsInPeriod.days, min) + (ctx.fuelCents >= min ? 1 : 0) : (r.visitsInPeriod.period === 'week' ? ctx.visitsThisWeek : ctx.visitsThisMonth);
    if (visits < r.visitsInPeriod.count) {
      const extra = min && ctx.fuelCents < min ? ` (esta carga cuenta a partir de ${pesos(min)})` : '';
      return { ...base, text: `Llevas ${visits} de ${r.visitsInPeriod.count} cargas${min ? ` de ${pesos(min)} o más` : ''}; al completarlas obtienes ${describeBenefit(p.benefit)}${extra}.`, currentCount: visits, targetCount: r.visitsInPeriod.count };
    }
  }
  if (r.returnStreak) {
    const k = returnStreak(ctx, r.returnStreak.withinDays, r.returnStreak.minFuelCents ?? 0);
    const rewards = r.returnStreak.rewardsCents;
    const nextAmount = rewards[Math.min(k, rewards.length - 1)];
    const deadline = new Date(ctx.at.getTime() + r.returnStreak.withinDays * DAY).toISOString();
    if (k === 0) return { ...base, text: `Regresa antes del ${deadline.slice(0, 10)}${r.returnStreak.minFuelCents ? ` con una carga de ${pesos(r.returnStreak.minFuelCents)} o más` : ''} y recibe ${pesos(nextAmount)} de dinero virtual.`, deadline, currentCount: 0, targetCount: rewards.length };
    return null;
  }
  if (r.returnWithinDays) {
    const last = lastQualifyingVisit(ctx, r.returnWithinDays.minPrevFuelCents ?? 0);
    if (!last) return null;
    const deadline = new Date(new Date(last.at).getTime() + r.returnWithinDays.days * DAY).toISOString();
    if (deadline > ctx.at.toISOString() && ctx.fuelCents < (r.minFuelCents ?? 0)) return { ...base, text: `Regresa antes del ${deadline.slice(0, 10)} y recibe ${describeBenefit(p.benefit)}.`, deadline };
    return null;
  }
  if (r.minMonthlyCents && ctx.monthlyCents < r.minMonthlyCents) {
    return { ...base, text: `Llevas ${pesos(ctx.monthlyCents)} de ${pesos(r.minMonthlyCents)} este mes para obtener ${describeBenefit(p.benefit)}.`, currentCents: ctx.monthlyCents, targetCents: r.minMonthlyCents };
  }
  return null;
}

export function describeBenefit(b: Benefit, extra?: Benefit[]): string {
  const one = (x: Benefit): string => {
    switch (x.type) {
      case 'points': return `${x.points} puntos`;
      case 'points_multiplier': return `puntos ×${x.multiplier ?? 2}`;
      case 'virtual_money': return `${pesos(x.amountCents ?? 0)} de dinero virtual${x.scope === 'store' ? ' para tienda' : ''}`;
      case 'cashback_percent': return `${x.percent}% de cashback`;
      case 'discount_per_liter': return `${x.centsPerLiter} centavos de descuento por litro`;
      case 'discount_percent': return `${x.percent}% de descuento`;
      case 'discount_fixed': return `${pesos(x.amountCents ?? 0)} de descuento`;
      case 'two_for_one': return `2x1 en ${x.label ?? 'producto seleccionado'}`;
      case 'coupon': case 'product': case 'partner_coupon': return x.label ?? 'un cupón';
      case 'scratch': return 'una tarjeta Rasca y Gana';
    }
  };
  if (extra?.length) {
    const total = [b, ...extra].reduce((a, x) => a + (x.amountCents ?? 0), 0);
    return `${pesos(total)} en beneficios (${[b, ...extra].map(one).join(', ')})`;
  }
  return one(b);
}

/** Después de las verificaciones de vigencia y límites, ¿la razón es solo de monto o historial? */
const HINTABLE = /^(compra mínima|mínimo|requiere|visita|sin visita|consumo|meta personal)/;

/**
 * Evalúa todas las promociones contra la compra y resuelve conflictos: prioridad, exclusiones,
 * acumulabilidad y máximo por transacción. Las que no aplican se reportan con su razón.
 */
export function evaluate(input: EngineInput): EvaluationResult {
  const { promotions, ctx, program, basePoints, maxPerTransaction } = input;
  const candidates: { p: Promotion; applied: AppliedBenefit[] }[] = [];
  const skipped: Skipped[] = [];
  const hints: NextHint[] = [];

  for (const p of promotions) {
    const usage = input.usage(p.id);
    const reason = checkRules(p, ctx, usage, program);
    if (reason) {
      skipped.push({ promotionId: p.id, promotionName: p.name, reason });
      if (HINTABLE.test(reason)) { const h = hintFor(p, ctx, usage, program); if (h) hints.push(h); }
      continue;
    }
    const { benefits, personal } = resolveBenefits(p, ctx, program);
    const applied = benefits.map((b) => ({ ...computeBenefit(p, b, ctx, program, basePoints), ...(personal ? { personal } : {}) }));
    candidates.push({ p, applied });
    if (p.rules.tiers?.length || p.rules.returnStreak) { const h = hintFor(p, ctx, usage, program); if (h) hints.push(h); }
  }

  candidates.sort((a, b) => b.p.priority - a.p.priority || a.p.createdAt.localeCompare(b.p.createdAt));
  const applied: AppliedBenefit[] = [];
  const chosen: Promotion[] = [];
  for (const c of candidates) {
    if (chosen.length >= maxPerTransaction) { skipped.push({ promotionId: c.p.id, promotionName: c.p.name, reason: `máximo ${maxPerTransaction} promociones por transacción` }); continue; }
    if (chosen.length && (!c.p.stackable || chosen.some((s) => !s.stackable))) {
      skipped.push({ promotionId: c.p.id, promotionName: c.p.name, reason: `no acumulable con "${chosen[0].name}"` }); continue;
    }
    const conflict = chosen.find((s) => s.excludes.includes(c.p.id) || c.p.excludes.includes(s.id));
    if (conflict) { skipped.push({ promotionId: c.p.id, promotionName: c.p.name, reason: `excluida por "${conflict.name}"` }); continue; }
    chosen.push(c.p);
    applied.push(...c.applied);
  }

  let totalDiscountCents = applied.reduce((a, b) => a + b.discountCents, 0);
  if (totalDiscountCents > ctx.totalCents) totalDiscountCents = ctx.totalCents;
  return {
    applied, skipped, hints,
    totalDiscountCents,
    totalPoints: applied.reduce((a, b) => a + b.points, 0),
    totalWalletCents: applied.reduce((a, b) => a + b.walletCents, 0),
  };
}

export function rulesSummary(r: PromoRules): string[] {
  const parts: string[] = [];
  if (r.fuelTypes?.length) parts.push(`combustible: ${r.fuelTypes.map((f) => ({ regular: 'Regular', premium: 'Premium', diesel: 'Diésel' })[f]).join(', ')}`);
  if (r.minFuelCents) parts.push(`carga mínima ${pesos(r.minFuelCents)}`);
  if (r.minTotalCents) parts.push(`compra mínima ${pesos(r.minTotalCents)}`);
  if (r.minLitersMl) parts.push(`mínimo ${r.minLitersMl / 1000} L`);
  if (r.minStoreCents) parts.push(`tienda mínima ${pesos(r.minStoreCents)}`);
  if (r.requiresItems?.length) parts.push(`requiere: ${r.requiresItems.join(', ')}`);
  if (r.daysOfWeek?.length) parts.push(`días: ${r.daysOfWeek.map((d) => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d]).join(', ')}`);
  if (r.hourFrom !== undefined && r.hourTo !== undefined) parts.push(`de ${String(r.hourFrom).padStart(2, '0')}:00 a ${String(r.hourTo).padStart(2, '0')}:00`);
  if (r.paymentMethods?.length) parts.push(`pago: ${r.paymentMethods.join(', ')}`);
  if (r.customerTypes?.length) parts.push(`clientes: ${r.customerTypes.join(', ')}`);
  if (r.vehicleKinds?.length) parts.push(`vehículos: ${r.vehicleKinds.map((k) => VEHICLE_KIND_LABELS[k] ?? k).join(', ')}`);
  if (r.segments?.length) parts.push(`segmentos: ${r.segments.join(', ')}`);
  if (r.visitsInPeriod) parts.push(`${r.visitsInPeriod.count} cargas${r.visitsInPeriod.qualifyingMinFuelCents ? ` de ${pesos(r.visitsInPeriod.qualifyingMinFuelCents)} o más` : ''} en ${r.visitsInPeriod.period === 'week' ? 'la semana' : 'el mes'}`);
  if (r.returnWithinDays) parts.push(`regreso en ${r.returnWithinDays.days} días${r.returnWithinDays.minPrevFuelCents ? ` tras carga de ${pesos(r.returnWithinDays.minPrevFuelCents)}` : ''}`);
  if (r.returnStreak) parts.push(`cadena de regresos cada ${r.returnStreak.withinDays} días: ${r.returnStreak.rewardsCents.map(pesos).join(' → ')}`);
  if (r.personalized) parts.push(`meta personal: ticket habitual +${r.personalized.upliftPercent} %, vigencia ${r.personalized.validDays} días`);
  if (r.minMonthlyCents) parts.push(`consumo mensual ${pesos(r.minMonthlyCents)}`);
  if (r.tiers?.length) parts.push(`escalones: ${r.tiers.map((t) => `${pesos(t.minAmountCents)} → ${describeBenefit(t.benefit)}`).join(' · ')}`);
  return parts;
}
