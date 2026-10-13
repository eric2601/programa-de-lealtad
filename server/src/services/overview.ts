import type { Ctx } from '../context.js';
import { iso, loadProgram } from '../context.js';
import { all, one } from '../db.js';

/**
 * Dashboard de operación del día: lo que pasó hoy en la estación (o en todo el grupo) hasta este
 * momento, comparado con el mismo día de la semana pasada a la misma hora. Pensado para el gerente
 * en turno: pocas cifras, actividad por hora, últimas cargas y alertas accionables.
 */

/** Ciudad de México no aplica horario de verano desde 2022: UTC−6 fijo. */
const TZ_OFFSET_MIN = -360;

function localDayStart(d: Date): Date {
  const local = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(start - TZ_OFFSET_MIN * 60_000);
}
const localHour = (isoDate: string): number => ((new Date(isoDate).getUTCHours() + TZ_OFFSET_MIN / 60) % 24 + 24) % 24;

interface SaleRow {
  id: string; station_id: string; user_id: string; membership_id: string; pos_reference: string; pump_number: number | null; fuel_type: string | null;
  liters_ml: number; fuel_cents: number; store_cents: number; discount_cents: number; wallet_spent_cents: number; reward_cents: number; total_points: number;
  payment_method: string; promos_json: string | null; dispensed_at: string; first_name: string; user_name: string; station_code: string;
}

function salesBetween(ctx: Ctx, tenantId: string, stationId: string | null, from: string, to: string): SaleRow[] {
  return all<SaleRow>(ctx.db,
    `SELECT s.id, s.station_id, s.user_id, s.membership_id, s.pos_reference, s.pump_number, s.fuel_type, s.liters_ml, s.fuel_cents, s.store_cents, s.discount_cents,
            s.wallet_spent_cents, s.reward_cents, s.total_points, s.payment_method, s.promos_json, s.dispensed_at,
            m.first_name, u.name AS user_name, st.code AS station_code
     FROM sales s JOIN memberships m ON m.id = s.membership_id JOIN users u ON u.id = s.user_id JOIN stations st ON st.id = s.station_id
     WHERE s.tenant_id = ? AND s.status = 'confirmed' AND s.dispensed_at >= ? AND s.dispensed_at < ? ${stationId ? 'AND s.station_id = ?' : ''}
     ORDER BY s.dispensed_at DESC`, ...(stationId ? [tenantId, from, to, stationId] : [tenantId, from, to]));
}

function totals(rows: SaleRow[]) {
  const t = { sales: 0, litersMl: 0, salesCents: 0, storeCents: 0, points: 0, customers: 0, discountCents: 0, walletSpentCents: 0 };
  const members = new Set<string>();
  for (const r of rows) {
    t.sales++; t.litersMl += r.liters_ml; t.salesCents += r.fuel_cents + r.store_cents - r.discount_cents; t.storeCents += r.store_cents;
    t.points += r.total_points; t.discountCents += r.discount_cents; t.walletSpentCents += r.wallet_spent_cents; members.add(r.membership_id);
  }
  t.customers = members.size;
  return t;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

export function today(ctx: Ctx, tenantId: string, stationId: string | null) {
  const cfg = loadProgram(ctx, tenantId);
  const now = ctx.now();
  const dayStart = localDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const weekAgoStart = new Date(dayStart.getTime() - 7 * 86_400_000);
  const weekAgoNow = new Date(now.getTime() - 7 * 86_400_000);
  const weekAgoEnd = new Date(weekAgoStart.getTime() + 86_400_000);

  const rows = salesBetween(ctx, tenantId, stationId, iso(dayStart), iso(dayEnd));
  const lastWeekRows = salesBetween(ctx, tenantId, stationId, iso(weekAgoStart), iso(weekAgoEnd));
  const lastWeekSoFar = lastWeekRows.filter((r) => r.dispensed_at < iso(weekAgoNow));
  const cur = totals(rows);
  const prev = totals(lastWeekSoFar);
  const prevFull = totals(lastWeekRows);

  // Actividad por hora local (0–23): hoy y el mismo día de la semana pasada completo.
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0, litersMl: 0, salesCents: 0, lastWeekSales: 0 }));
  for (const r of rows) { const h = hours[localHour(r.dispensed_at)]; h.sales++; h.litersMl += r.liters_ml; h.salesCents += r.fuel_cents + r.store_cents - r.discount_cents; }
  for (const r of lastWeekRows) hours[localHour(r.dispensed_at)].lastWeekSales++;
  const currentHour = localHour(iso(now));

  // Mezcla de combustible y forma de pago de hoy.
  const fuelMix = { regular: 0, premium: 0, diesel: 0, store_only: 0 } as Record<string, number>;
  const payMix: Record<string, number> = {};
  for (const r of rows) { fuelMix[r.fuel_type ?? 'store_only'] = (fuelMix[r.fuel_type ?? 'store_only'] ?? 0) + (r.fuel_type ? r.liters_ml : 1); payMix[r.payment_method] = (payMix[r.payment_method] ?? 0) + 1; }

  // Despachadores de hoy.
  const byUser = new Map<string, { name: string; station: string; sales: number; litersMl: number; members: Set<string> }>();
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? { name: r.user_name, station: r.station_code, sales: 0, litersMl: 0, members: new Set<string>() };
    u.sales++; u.litersMl += r.liters_ml; u.members.add(r.membership_id); byUser.set(r.user_id, u);
  }
  const attendants = [...byUser.values()].map((u) => ({ name: u.name, station: u.station, sales: u.sales, litersMl: u.litersMl, distinctMembers: u.members.size })).sort((a, b) => b.litersMl - a.litersMl);

  // Promociones usadas hoy.
  const stationFilter = stationId ? 'AND u.station_id = ?' : '';
  const promoUses = all<{ id: string; name: string; uses: number; cost: number }>(ctx.db,
    `SELECT p.id, p.name, COUNT(*) AS uses, COALESCE(SUM(u.cost_cents), 0) AS cost FROM promotion_usages u JOIN promotions p ON p.id = u.promotion_id
     WHERE u.tenant_id = ? AND u.created_at >= ? AND u.created_at < ? ${stationFilter} GROUP BY p.id ORDER BY uses DESC LIMIT 8`,
    ...(stationId ? [tenantId, iso(dayStart), iso(dayEnd), stationId] : [tenantId, iso(dayStart), iso(dayEnd)]));
  const promoTotals = one<{ uses: number; cost: number; members: number }>(ctx.db,
    `SELECT COUNT(*) AS uses, COALESCE(SUM(cost_cents), 0) AS cost, COUNT(DISTINCT membership_id) AS members FROM promotion_usages u WHERE tenant_id = ? AND created_at >= ? AND created_at < ? ${stationFilter}`,
    ...(stationId ? [tenantId, iso(dayStart), iso(dayEnd), stationId] : [tenantId, iso(dayStart), iso(dayEnd)]));

  // Dinero virtual entregado hoy y nuevos registros de hoy (por grupo; el dinero virtual no se ata a estación al abonarse).
  const walletToday = one<{ issued: number | null; used: number | null }>(ctx.db,
    `SELECT SUM(CASE WHEN kind='earn' THEN amount_cents END) AS issued, SUM(CASE WHEN kind='spend' THEN amount_cents END) AS used FROM wallet_movements WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`,
    tenantId, iso(dayStart), iso(dayEnd));
  const newMembers = one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND created_at >= ? AND created_at < ? ${stationId ? 'AND home_station_id = ?' : ''}`,
    ...(stationId ? [tenantId, iso(dayStart), iso(dayEnd), stationId] : [tenantId, iso(dayStart), iso(dayEnd)]));
  const scratchToday = one<{ issued: number; pending: number }>(ctx.db,
    `SELECT COUNT(*) AS issued, SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END) AS pending FROM scratch_cards c JOIN sales s ON s.id = c.sale_id WHERE c.tenant_id = ? AND s.dispensed_at >= ? AND s.dispensed_at < ? ${stationId ? 'AND s.station_id = ?' : ''}`,
    ...(stationId ? [tenantId, iso(dayStart), iso(dayEnd), stationId] : [tenantId, iso(dayStart), iso(dayEnd)]));

  // Alertas accionables.
  const alerts: { kind: 'wallet_expiring' | 'promo_ending' | 'promo_exhausted' | 'concentration' | 'scratch_pending'; text: string; count?: number }[] = [];
  const in7 = iso(new Date(now.getTime() + 7 * 86_400_000));
  const expiring = one<{ n: number; cents: number | null }>(ctx.db, `SELECT COUNT(DISTINCT membership_id) AS n, SUM(remaining_cents) AS cents FROM wallet_movements WHERE tenant_id = ? AND kind = 'earn' AND status IN ('active','partial') AND expires_at > ? AND expires_at <= ?`, tenantId, iso(now), in7);
  if (expiring && expiring.n > 0) alerts.push({ kind: 'wallet_expiring', text: `${expiring.n} clientes tienen dinero virtual que vence en 7 días (${((expiring.cents ?? 0) / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}). Un aviso por WhatsApp los hace regresar.`, count: expiring.n });
  const promos = all<{ name: string; status: string; rules_json: string; inventory_initial: number | null; inventory_used: number }>(ctx.db, `SELECT name, status, rules_json, inventory_initial, inventory_used FROM promotions WHERE tenant_id = ? AND status IN ('active','exhausted')`, tenantId);
  for (const p of promos) {
    const endsAt = (JSON.parse(p.rules_json) as { endsAt?: string }).endsAt;
    if (p.status === 'exhausted') alerts.push({ kind: 'promo_exhausted', text: `“${p.name}” está agotada. Decide si repones existencias o la das de baja.` });
    else if (endsAt && endsAt > iso(now) && endsAt <= in7) alerts.push({ kind: 'promo_ending', text: `“${p.name}” termina el ${endsAt.slice(0, 10)}. Avisa al equipo de la bomba.` });
    else if (p.inventory_initial && p.inventory_used / p.inventory_initial >= 0.85) alerts.push({ kind: 'promo_exhausted', text: `“${p.name}” lleva ${Math.round((p.inventory_used / p.inventory_initial) * 100)} % de sus existencias.` });
  }
  for (const a of attendants) if (a.sales >= 8 && a.distinctMembers / a.sales < 0.5) alerts.push({ kind: 'concentration', text: `${a.name}: ${a.sales} cargas hoy en solo ${a.distinctMembers} números distintos. Revisa sus tickets.` });
  if (scratchToday && scratchToday.pending > 0) alerts.push({ kind: 'scratch_pending', text: `${scratchToday.pending} tarjetas Rasca y Gana de hoy siguen sin rascar. Recuérdalo en la siguiente carga.`, count: scratchToday.pending });

  const recent = rows.slice(0, 12).map((r) => ({
    id: r.id, at: r.dispensed_at, firstName: r.first_name, attendant: r.user_name, station: r.station_code, pump: r.pump_number, fuelType: r.fuel_type,
    litersMl: r.liters_ml, amountCents: r.fuel_cents + r.store_cents - r.discount_cents, storeCents: r.store_cents, points: r.total_points,
    paymentMethod: r.payment_method, walletSpentCents: r.wallet_spent_cents,
    promos: r.promos_json ? (JSON.parse(r.promos_json) as { promotionName?: string; name?: string }[]).map((p) => p.promotionName ?? p.name ?? '').filter(Boolean) : [],
  }));

  return {
    at: iso(now), dayStart: iso(dayStart), localHour: currentHour, stationId,
    today: { ...cur, pointsValueCents: cur.points * cfg.pointValueCents, promoUses: promoTotals?.uses ?? 0, promoCostCents: promoTotals?.cost ?? 0, promoMembers: promoTotals?.members ?? 0,
      walletIssuedCents: walletToday?.issued ?? 0, walletUsedCents: walletToday?.used ?? 0, newMembers: newMembers?.n ?? 0, scratchIssued: scratchToday?.issued ?? 0, scratchPending: scratchToday?.pending ?? 0 },
    lastWeek: { soFar: prev, full: prevFull, salesChangePct: pct(cur.sales, prev.sales), litersChangePct: pct(cur.litersMl, prev.litersMl), salesCentsChangePct: pct(cur.salesCents, prev.salesCents), customersChangePct: pct(cur.customers, prev.customers) },
    hours, fuelMix, payMix, attendants, promoUses, alerts, recent,
  };
}
