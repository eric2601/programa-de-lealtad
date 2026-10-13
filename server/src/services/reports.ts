import type { Ctx } from '../context.js';
import { iso, loadProgram } from '../context.js';
import { all, one } from '../db.js';

/**
 * Resumen operativo del grupo. Muestra litros identificados, puntos emitidos y canjeados,
 * miembros activos y la conciliación por despachador. No atribuye ventas al programa: para
 * eso está el grupo de control de campañas (fase MVP tardía).
 */
export function summary(ctx: Ctx, tenantId: string, from: string, to: string) {
  const cfg = loadProgram(ctx, tenantId);
  const totals = one<{ sales: number; liters_ml: number | null; fuel_cents: number | null; store_cents: number | null; reward_cents: number | null; points: number | null }>(
    ctx.db,
    `SELECT COUNT(*) AS sales, SUM(liters_ml) AS liters_ml, SUM(fuel_cents) AS fuel_cents, SUM(store_cents) AS store_cents,
            SUM(reward_cents) AS reward_cents, SUM(total_points) AS points
     FROM sales WHERE tenant_id = ? AND status = 'confirmed' AND dispensed_at >= ? AND dispensed_at < ?`,
    tenantId, from, to,
  );
  const redeemed = one<{ points: number | null }>(ctx.db,
    `SELECT SUM(-points_delta) AS points FROM ledger_entries WHERE tenant_id = ? AND kind = 'redeem' AND created_at >= ? AND created_at < ?`, tenantId, from, to);
  const now = ctx.now();
  const d30 = iso(new Date(now.getTime() - 30 * 86_400_000));
  const d90 = iso(new Date(now.getTime() - 90 * 86_400_000));
  const active30 = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND last_purchase_at >= ?', tenantId, d30);
  const active90 = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND last_purchase_at >= ?', tenantId, d90);
  const members = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ?', tenantId);
  const liability = one<{ points: number | null }>(ctx.db, 'SELECT SUM(points_balance) AS points FROM memberships WHERE tenant_id = ?', tenantId);

  const byStation = all(ctx.db,
    `SELECT st.code, st.name, COUNT(s.id) AS sales, COALESCE(SUM(s.liters_ml),0) AS liters_ml, COALESCE(SUM(s.total_points),0) AS points,
            COALESCE(SUM(s.reward_cents),0) AS reward_cents
     FROM stations st LEFT JOIN sales s ON s.station_id = st.id AND s.status = 'confirmed' AND s.dispensed_at >= ? AND s.dispensed_at < ?
     WHERE st.tenant_id = ? GROUP BY st.id ORDER BY st.code`, from, to, tenantId);

  // Conciliación por despachador: litros identificados y concentración en pocos números.
  const byAttendant = all(ctx.db,
    `SELECT u.name, st.code AS station, COUNT(s.id) AS sales, COALESCE(SUM(s.liters_ml),0) AS liters_ml,
            COUNT(DISTINCT s.membership_id) AS distinct_members
     FROM users u LEFT JOIN stations st ON st.id = u.station_id
     LEFT JOIN sales s ON s.user_id = u.id AND s.status = 'confirmed' AND s.dispensed_at >= ? AND s.dispensed_at < ?
     WHERE u.tenant_id = ? AND u.role = 'attendant' GROUP BY u.id ORDER BY liters_ml DESC`, from, to, tenantId);

  const alerts: { kind: string; detail: string }[] = [];
  for (const a of byAttendant as Array<{ name: string; sales: number; distinct_members: number }>) {
    if (a.sales >= 10 && a.distinct_members / a.sales < 0.5) {
      alerts.push({ kind: 'concentracion', detail: `${a.name}: ${a.sales} cargas en solo ${a.distinct_members} números distintos.` });
    }
  }

  return {
    range: { from, to },
    totals: {
      sales: totals?.sales ?? 0,
      litersMl: totals?.liters_ml ?? 0,
      fuelCents: totals?.fuel_cents ?? 0,
      storeCents: totals?.store_cents ?? 0,
      rewardCents: totals?.reward_cents ?? 0,
      pointsIssued: totals?.points ?? 0,
      pointsRedeemed: redeemed?.points ?? 0,
      pointsIssuedValueCents: (totals?.points ?? 0) * cfg.pointValueCents,
    },
    members: { total: members?.n ?? 0, active30: active30?.n ?? 0, active90: active90?.n ?? 0, liabilityPoints: liability?.points ?? 0, liabilityCents: (liability?.points ?? 0) * cfg.pointValueCents },
    byStation,
    byAttendant,
    alerts,
  };
}
