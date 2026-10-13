import type { Ctx } from '../context.js';
import { iso, loadProgram } from '../context.js';
import { all, one } from '../db.js';
import { notFound } from '../errors.js';
import { OBJECTIVE_LABELS, PROMO_TYPE_LABELS } from '../promo/types.js';

interface PeriodMetrics {
  from: string; to: string; days: number;
  transactions: number; salesCents: number; fuelCents: number; storeCents: number; litersMl: number;
  avgTicketCents: number; avgLitersMl: number; txPerDay: number;
  newCustomers: number; recurringCustomers: number; participants: number;
  benefitsCostCents: number; benefitsDelivered: number; walletIssuedCents: number;
}

function metrics(ctx: Ctx, tenantId: string, from: string, to: string, campaignId?: string): PeriodMetrics {
  const s = one<{ n: number; fuel: number | null; store: number | null; disc: number | null; ml: number | null }>(ctx.db,
    `SELECT COUNT(*) AS n, SUM(fuel_cents) AS fuel, SUM(store_cents) AS store, SUM(discount_cents) AS disc, SUM(liters_ml) AS ml FROM sales WHERE tenant_id = ? AND status = 'confirmed' AND dispensed_at >= ? AND dispensed_at < ?`, tenantId, from, to);
  const newC = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND created_at >= ? AND created_at < ?', tenantId, from, to);
  const rec = one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM (SELECT membership_id FROM sales WHERE tenant_id = ? AND status = 'confirmed' AND dispensed_at >= ? AND dispensed_at < ? GROUP BY membership_id HAVING COUNT(*) >= 2)`, tenantId, from, to);
  const usageWhere = campaignId ? 'AND p.campaign_id = ?' : '';
  const usageParams = campaignId ? [tenantId, from, to, campaignId] : [tenantId, from, to];
  const u = one<{ n: number; cost: number | null; members: number }>(ctx.db,
    `SELECT COUNT(*) AS n, SUM(u.cost_cents) AS cost, COUNT(DISTINCT u.membership_id) AS members FROM promotion_usages u JOIN promotions p ON p.id = u.promotion_id WHERE u.tenant_id = ? AND u.created_at >= ? AND u.created_at < ? ${usageWhere}`, ...usageParams);
  const w = one<{ s: number | null }>(ctx.db, `SELECT SUM(amount_cents) AS s FROM wallet_movements WHERE tenant_id = ? AND kind = 'earn' AND created_at >= ? AND created_at < ?`, tenantId, from, to);
  const n = s?.n ?? 0;
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
  const salesCents = (s?.fuel ?? 0) + (s?.store ?? 0) - (s?.disc ?? 0);
  return {
    from, to, days, transactions: n, salesCents, fuelCents: s?.fuel ?? 0, storeCents: s?.store ?? 0, litersMl: s?.ml ?? 0,
    avgTicketCents: n ? Math.round(salesCents / n) : 0, avgLitersMl: n ? Math.round((s?.ml ?? 0) / n) : 0, txPerDay: Math.round((n / days) * 10) / 10,
    newCustomers: newC?.n ?? 0, recurringCustomers: rec?.n ?? 0, participants: u?.members ?? 0,
    benefitsCostCents: u?.cost ?? 0, benefitsDelivered: u?.n ?? 0, walletIssuedCents: w?.s ?? 0,
  };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

/** Margen incremental estimado entre dos periodos, normalizado por día. */
function incrementalMarginCents(ctx: Ctx, tenantId: string, during: PeriodMetrics, before: PeriodMetrics): number {
  const cfg = loadProgram(ctx, tenantId);
  const scale = during.days / Math.max(1, before.days);
  const litersDelta = during.litersMl - before.litersMl * scale;
  const storeDelta = during.storeCents - before.storeCents * scale;
  return Math.round((litersDelta / 1000) * cfg.marginCentsPerLiter + (storeDelta * cfg.storeMarginPercent) / 100);
}

export function dashboard(ctx: Ctx, tenantId: string, from: string, to: string) {
  const cur = metrics(ctx, tenantId, from, to);
  const len = new Date(to).getTime() - new Date(from).getTime();
  const prevFrom = iso(new Date(new Date(from).getTime() - len));
  const prev = metrics(ctx, tenantId, prevFrom, from);
  const now = iso(ctx.now());
  const soon = iso(new Date(ctx.now().getTime() + 7 * 86_400_000));
  const promos = all<{ id: string; name: string; status: string; type: string; rules_json: string; inventory_initial: number | null; inventory_used: number }>(ctx.db, 'SELECT id, name, status, type, rules_json, inventory_initial, inventory_used FROM promotions WHERE tenant_id = ?', tenantId);
  const active = promos.filter((p) => p.status === 'active');
  const expiring = active.filter((p) => { const e = (JSON.parse(p.rules_json) as { endsAt?: string }).endsAt; return e && e > now && e <= soon; });
  const exhausted = promos.filter((p) => p.status === 'exhausted');
  const nearlyExhausted = active.filter((p) => p.inventory_initial !== null && p.inventory_used / p.inventory_initial >= 0.85);
  const wallet = one<{ generated: number | null; used: number | null; expired: number | null; outstanding: number | null }>(ctx.db,
    `SELECT SUM(CASE WHEN kind='earn' AND created_at >= ? AND created_at < ? THEN amount_cents END) AS generated,
            SUM(CASE WHEN kind='spend' AND created_at >= ? AND created_at < ? THEN amount_cents END) AS used,
            SUM(CASE WHEN kind='expire' AND created_at >= ? AND created_at < ? THEN amount_cents END) AS expired,
            SUM(CASE WHEN kind='earn' AND status IN ('active','partial') THEN remaining_cents END) AS outstanding
     FROM wallet_movements WHERE tenant_id = ?`, from, to, from, to, from, to, tenantId);
  const incMargin = incrementalMarginCents(ctx, tenantId, cur, prev);
  const cost = cur.benefitsCostCents;
  const roi = cost > 0 ? Math.round(((incMargin - cost) / cost) * 100) / 100 : null;

  const byDay = all<Record<string, number | string>>(ctx.db,
    `SELECT substr(dispensed_at, 1, 10) AS day, COUNT(*) AS transactions, SUM(fuel_cents + store_cents - discount_cents) AS sales_cents, SUM(liters_ml) AS liters_ml,
            COUNT(DISTINCT membership_id) AS customers
     FROM sales WHERE tenant_id = ? AND status = 'confirmed' AND dispensed_at >= ? AND dispensed_at < ? GROUP BY day ORDER BY day`, tenantId, from, to);
  const newByDay = new Map(all<{ day: string; n: number }>(ctx.db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND created_at >= ? AND created_at < ? GROUP BY day`, tenantId, from, to).map((r) => [r.day, r.n]));
  const walletByDay = new Map(all<{ day: string; issued: number | null; used: number | null }>(ctx.db,
    `SELECT substr(created_at, 1, 10) AS day, SUM(CASE WHEN kind='earn' THEN amount_cents END) AS issued, SUM(CASE WHEN kind='spend' THEN amount_cents END) AS used FROM wallet_movements WHERE tenant_id = ? AND created_at >= ? AND created_at < ? GROUP BY day`, tenantId, from, to).map((r) => [r.day, r]));
  const usesByDay = new Map(all<{ day: string; n: number }>(ctx.db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM promotion_usages WHERE tenant_id = ? AND created_at >= ? AND created_at < ? GROUP BY day`, tenantId, from, to).map((r) => [r.day, r.n]));
  const series = byDay.map((d) => ({
    day: d.day as string, transactions: d.transactions as number, salesCents: d.sales_cents as number, litersMl: d.liters_ml as number,
    avgTicketCents: Math.round((d.sales_cents as number) / Math.max(1, d.transactions as number)), customers: d.customers as number,
    newCustomers: newByDay.get(d.day as string) ?? 0, recurringCustomers: Math.max(0, (d.customers as number) - (newByDay.get(d.day as string) ?? 0)),
    walletIssuedCents: walletByDay.get(d.day as string)?.issued ?? 0, walletUsedCents: walletByDay.get(d.day as string)?.used ?? 0,
    promoUses: usesByDay.get(d.day as string) ?? 0,
  }));
  const byStation = all(ctx.db,
    `SELECT st.id, st.code, st.name, st.city, st.state, COUNT(s.id) AS transactions, COALESCE(SUM(s.fuel_cents + s.store_cents - s.discount_cents),0) AS sales_cents, COALESCE(SUM(s.liters_ml),0) AS liters_ml
     FROM stations st LEFT JOIN sales s ON s.station_id = st.id AND s.status = 'confirmed' AND s.dispensed_at >= ? AND s.dispensed_at < ?
     WHERE st.tenant_id = ? GROUP BY st.id ORDER BY sales_cents DESC`, from, to, tenantId);
  const promoUsage = all<{ id: string; name: string; type: string; uses: number; cost: number | null; members: number }>(ctx.db,
    `SELECT p.id, p.name, p.type, COUNT(u.id) AS uses, SUM(u.cost_cents) AS cost, COUNT(DISTINCT u.membership_id) AS members
     FROM promotions p LEFT JOIN promotion_usages u ON u.promotion_id = p.id AND u.created_at >= ? AND u.created_at < ? WHERE p.tenant_id = ? GROUP BY p.id ORDER BY uses DESC`, from, to, tenantId);
  const campaigns = all<{ id: string; name: string; status: string; objective: string; starts_at: string; ends_at: string; uses: number; cost: number | null; sales: number | null }>(ctx.db,
    `SELECT c.id, c.name, c.status, c.objective, c.starts_at, c.ends_at, COUNT(u.id) AS uses, SUM(u.cost_cents) AS cost,
            (SELECT SUM(s.fuel_cents + s.store_cents) FROM sales s WHERE s.id IN (SELECT sale_id FROM promotion_usages u2 JOIN promotions p2 ON p2.id = u2.promotion_id WHERE p2.campaign_id = c.id)) AS sales
     FROM campaigns c LEFT JOIN promotions p ON p.campaign_id = c.id LEFT JOIN promotion_usages u ON u.promotion_id = p.id
     WHERE c.tenant_id = ? GROUP BY c.id ORDER BY c.starts_at DESC`, tenantId);

  return {
    range: { from, to },
    kpis: {
      salesCents: cur.salesCents, salesChangePct: pct(cur.salesCents, prev.salesCents),
      avgTicketCents: cur.avgTicketCents, avgTicketChangePct: pct(cur.avgTicketCents, prev.avgTicketCents), prevAvgTicketCents: prev.avgTicketCents,
      litersMl: cur.litersMl, litersChangePct: pct(cur.litersMl, prev.litersMl),
      transactions: cur.transactions, transactionsChangePct: pct(cur.transactions, prev.transactions),
      activePromotions: active.length, expiringPromotions: expiring.length, exhaustedPromotions: exhausted.length, nearlyExhausted: nearlyExhausted.length,
      walletGeneratedCents: wallet?.generated ?? 0, walletUsedCents: wallet?.used ?? 0, walletExpiredCents: wallet?.expired ?? 0, walletOutstandingCents: wallet?.outstanding ?? 0,
      newCustomers: cur.newCustomers, recurringCustomers: cur.recurringCustomers, participants: cur.participants,
      promoUses: cur.benefitsDelivered, promoCostCents: cur.benefitsCostCents, incrementalMarginCents: incMargin, roi,
    },
    series, byStation, promoUsage: promoUsage.map((p) => ({ ...p, typeLabel: PROMO_TYPE_LABELS[p.type as keyof typeof PROMO_TYPE_LABELS] ?? p.type, cost: p.cost ?? 0 })),
    campaigns: campaigns.map((c) => ({ ...c, objectiveLabel: OBJECTIVE_LABELS[c.objective as keyof typeof OBJECTIVE_LABELS] ?? c.objective, cost: c.cost ?? 0, sales: c.sales ?? 0 })),
    expiring: expiring.map((p) => ({ id: p.id, name: p.name, endsAt: (JSON.parse(p.rules_json) as { endsAt?: string }).endsAt })),
    nearlyExhausted: nearlyExhausted.map((p) => ({ id: p.id, name: p.name, initial: p.inventory_initial, used: p.inventory_used })),
  };
}

export type Verdict = 'funciono' | 'parcial' | 'sin_impacto' | 'perdidas' | 'sin_datos';

/** Antes, durante y después de una campaña, con veredicto y recomendación (sección 14). */
export function evaluateCampaign(ctx: Ctx, tenantId: string, campaignId: string) {
  const c = one<{ id: string; name: string; status: string; objective: string; starts_at: string; ends_at: string; budget_cents: number | null }>(ctx.db, 'SELECT * FROM campaigns WHERE tenant_id = ? AND id = ?', tenantId, campaignId);
  if (!c) throw notFound('CAMPAIGN_NOT_FOUND', 'No encontramos esa campaña.');
  const now = ctx.now();
  const start = new Date(c.starts_at); const end = new Date(c.ends_at);
  const duringEnd = end < now ? end : now;
  const lenMs = Math.max(86_400_000, duringEnd.getTime() - start.getTime());
  const before = metrics(ctx, tenantId, iso(new Date(start.getTime() - lenMs)), iso(start), campaignId);
  const during = metrics(ctx, tenantId, iso(start), iso(duringEnd), campaignId);
  const afterAvailable = end < now;
  const after = afterAvailable ? metrics(ctx, tenantId, iso(end), iso(new Date(Math.min(now.getTime(), end.getTime() + lenMs))), campaignId) : null;

  const incMargin = incrementalMarginCents(ctx, tenantId, during, before);
  const cost = during.benefitsCostCents;
  const roi = cost > 0 ? Math.round(((incMargin - cost) / cost) * 100) / 100 : null;
  const dTicket = pct(during.avgTicketCents, before.avgTicketCents);
  const dLiters = pct(during.avgLitersMl, before.avgLitersMl);
  const dTx = pct(during.txPerDay, before.txPerDay);

  let verdict: Verdict; let recommendation: string; let explanation: string;
  if (before.transactions < 20 || during.transactions < 20) {
    verdict = 'sin_datos'; recommendation = 'Esperar más transacciones antes de decidir.'; explanation = 'Hay menos de 20 transacciones en alguno de los periodos; la comparación no es confiable.';
  } else if (roi !== null && roi >= 0.5 && ((dTicket ?? 0) >= 3 || (dLiters ?? 0) >= 3 || (dTx ?? 0) >= 5)) {
    verdict = 'funciono'; recommendation = 'Repetir la campaña con las mismas reglas y ampliar a más estaciones.'; explanation = `El margen incremental estimado supera el costo de los beneficios (ROI ${roi}) y el ticket, los litros o la frecuencia subieron.`;
  } else if (roi !== null && roi > 0) {
    verdict = 'parcial'; recommendation = 'Modificar: subir el umbral de compra o reducir el beneficio para mejorar el retorno.'; explanation = `Dejó margen positivo (ROI ${roi}) pero el cambio de comportamiento es pequeño.`;
  } else if (Math.abs(dTicket ?? 0) < 2 && Math.abs(dLiters ?? 0) < 2 && Math.abs(dTx ?? 0) < 3) {
    verdict = 'sin_impacto'; recommendation = 'Modificar la mecánica: el beneficio no cambió el comportamiento. Probar un umbral escalonado.'; explanation = 'Ticket, litros y transacciones se mantuvieron dentro de ±2 %.';
  } else {
    verdict = 'perdidas'; recommendation = 'No repetir tal cual: el costo de beneficios superó el margen incremental. Revisar canibalización y umbrales.'; explanation = `El costo (${(cost / 100).toFixed(0)} MXN) fue mayor que el margen incremental estimado (${(incMargin / 100).toFixed(0)} MXN).`;
  }
  const promos = all<{ id: string; name: string; type: string; status: string; uses: number; cost: number | null; members: number }>(ctx.db,
    `SELECT p.id, p.name, p.type, p.status, COUNT(u.id) AS uses, SUM(u.cost_cents) AS cost, COUNT(DISTINCT u.membership_id) AS members FROM promotions p LEFT JOIN promotion_usages u ON u.promotion_id = p.id WHERE p.campaign_id = ? GROUP BY p.id ORDER BY uses DESC`, campaignId);
  return {
    campaign: { id: c.id, name: c.name, status: c.status, objective: c.objective, objectiveLabel: OBJECTIVE_LABELS[c.objective as keyof typeof OBJECTIVE_LABELS] ?? c.objective, startsAt: c.starts_at, endsAt: c.ends_at, budgetCents: c.budget_cents },
    periods: { before, during, after },
    variation: { avgTicketPct: dTicket, avgLitersPct: dLiters, transactionsPerDayPct: dTx, newCustomers: during.newCustomers - before.newCustomers, recurringCustomers: during.recurringCustomers - before.recurringCustomers },
    economics: { benefitsCostCents: cost, benefitsDelivered: during.benefitsDelivered, revenueCents: during.salesCents, revenueBeforeCents: before.salesCents, incrementalMarginCents: incMargin, roi, budgetCents: c.budget_cents, budgetUsedPct: c.budget_cents ? Math.round((cost / c.budget_cents) * 1000) / 10 : null },
    verdict, verdictLabel: { funciono: 'Funcionó', parcial: 'Funcionó parcialmente', sin_impacto: 'No generó impacto', perdidas: 'Generó pérdidas', sin_datos: 'Sin datos suficientes' }[verdict],
    recommendation, explanation,
    promotions: promos.map((p) => ({ ...p, typeLabel: PROMO_TYPE_LABELS[p.type as keyof typeof PROMO_TYPE_LABELS] ?? p.type, cost: p.cost ?? 0 })),
    note: 'La comparación antes/durante no aísla estacionalidad ni competencia. Para atribución causal, usar el grupo de control por promoción.',
  };
}

/** Indicadores de ticket promedio de una promoción concreta (sección 9). */
export function promotionImpact(ctx: Ctx, tenantId: string, promotionId: string) {
  const p = one<{ id: string; name: string; rules_json: string; created_at: string }>(ctx.db, 'SELECT id, name, rules_json, created_at FROM promotions WHERE tenant_id = ? AND id = ?', tenantId, promotionId);
  if (!p) throw notFound('PROMOTION_NOT_FOUND', 'No encontramos esa promoción.');
  const rules = JSON.parse(p.rules_json) as { startsAt?: string; endsAt?: string };
  const start = new Date(rules.startsAt ?? p.created_at); const now = ctx.now();
  const end = rules.endsAt && new Date(rules.endsAt) < now ? new Date(rules.endsAt) : now;
  const lenMs = Math.max(86_400_000, end.getTime() - start.getTime());
  const before = metrics(ctx, tenantId, iso(new Date(start.getTime() - lenMs)), iso(start));
  const during = metrics(ctx, tenantId, iso(start), iso(end));
  const u = one<{ n: number; cost: number | null; members: number }>(ctx.db, 'SELECT COUNT(*) AS n, SUM(cost_cents) AS cost, COUNT(DISTINCT membership_id) AS members FROM promotion_usages WHERE promotion_id = ?', promotionId);
  const incMargin = incrementalMarginCents(ctx, tenantId, during, before);
  const cost = u?.cost ?? 0;
  return {
    promotion: { id: p.id, name: p.name },
    avgTicketBeforeCents: before.avgTicketCents, avgTicketDuringCents: during.avgTicketCents, avgTicketChangePct: pct(during.avgTicketCents, before.avgTicketCents),
    avgLitersBeforeMl: before.avgLitersMl, avgLitersDuringMl: during.avgLitersMl,
    txPerDayBefore: before.txPerDay, txPerDayDuring: during.txPerDay,
    participants: u?.members ?? 0, benefitsDelivered: u?.n ?? 0, costCents: cost,
    salesIncreaseCents: during.salesCents - Math.round(before.salesCents * (during.days / Math.max(1, before.days))),
    incrementalMarginCents: incMargin, roi: cost > 0 ? Math.round(((incMargin - cost) / cost) * 100) / 100 : null,
  };
}
