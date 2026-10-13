import type { Ctx } from '../context.js';
import { iso } from '../context.js';
import { all, one } from '../db.js';
import { SEGMENTS, SEGMENT_LABELS, type CustomerType, type Segment } from '../promo/types.js';

export interface MemberStats {
  totalSales: number;
  visits30: number;
  visits90: number;
  cents90: number;
  visitsThisMonth: number;
  visitsThisWeek: number;
  monthlyCents: number;
  lifetimeCents: number;
  avgTicketCents: number;
  lastAt: string | null;
  daysSinceLast: number | null;
  createdAt: string;
  customerType: CustomerType;
  homeStationId: string | null;
  /** Visitas de los últimos 60 días, la más reciente primero. */
  recentVisits: Array<{ at: string; fuelCents: number; storeCents: number }>;
}

export function memberStats(ctx: Ctx, tenantId: string, membershipId: string, at: Date = ctx.now()): MemberStats {
  const d = (days: number) => iso(new Date(at.getTime() - days * 86_400_000));
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1);
  const m = one<{ created_at: string; customer_type: CustomerType; home_station_id: string | null }>(ctx.db, 'SELECT created_at, customer_type, home_station_id FROM memberships WHERE id = ?', membershipId);
  const agg = one<{ total: number; v30: number; v90: number; c90: number | null; vm: number; vw: number; cm: number | null; life: number | null; last: string | null }>(ctx.db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN dispensed_at >= ? THEN 1 ELSE 0 END) AS v30,
            SUM(CASE WHEN dispensed_at >= ? THEN 1 ELSE 0 END) AS v90,
            SUM(CASE WHEN dispensed_at >= ? THEN fuel_cents + store_cents ELSE 0 END) AS c90,
            SUM(CASE WHEN dispensed_at >= ? THEN 1 ELSE 0 END) AS vm,
            SUM(CASE WHEN dispensed_at >= ? THEN 1 ELSE 0 END) AS vw,
            SUM(CASE WHEN dispensed_at >= ? THEN fuel_cents + store_cents ELSE 0 END) AS cm,
            SUM(fuel_cents + store_cents) AS life,
            MAX(dispensed_at) AS last
     FROM sales WHERE tenant_id = ? AND membership_id = ? AND status = 'confirmed' AND dispensed_at <= ?`,
    d(30), d(90), d(90), iso(monthStart), d(7), iso(monthStart), tenantId, membershipId, iso(at));
  const total = agg?.total ?? 0;
  const recentVisits = all<{ at: string; fuelCents: number; storeCents: number }>(ctx.db,
    `SELECT dispensed_at AS at, fuel_cents AS fuelCents, store_cents AS storeCents FROM sales WHERE tenant_id = ? AND membership_id = ? AND status = 'confirmed' AND dispensed_at <= ? AND dispensed_at >= ? ORDER BY dispensed_at DESC LIMIT 40`,
    tenantId, membershipId, iso(at), d(60));
  return {
    recentVisits,
    totalSales: total,
    visits30: agg?.v30 ?? 0, visits90: agg?.v90 ?? 0, cents90: agg?.c90 ?? 0,
    visitsThisMonth: agg?.vm ?? 0, visitsThisWeek: agg?.vw ?? 0, monthlyCents: agg?.cm ?? 0,
    lifetimeCents: agg?.life ?? 0,
    avgTicketCents: total ? Math.round((agg?.life ?? 0) / total) : 0,
    lastAt: agg?.last ?? null,
    daysSinceLast: agg?.last ? Math.floor((at.getTime() - new Date(agg.last).getTime()) / 86_400_000) : null,
    createdAt: m?.created_at ?? iso(at),
    customerType: m?.customer_type ?? 'particular',
    homeStationId: m?.home_station_id ?? null,
  };
}

/** Segmentos calculados con reglas fijas y explicables (sección 11). */
export function segmentsFromStats(s: MemberStats, at: Date): Segment[] {
  const out: Segment[] = [];
  if (s.customerType !== 'particular') out.push(s.customerType as Segment);
  const ageDays = (at.getTime() - new Date(s.createdAt).getTime()) / 86_400_000;
  if (s.totalSales <= 1 || ageDays <= 30) out.push('nuevo');
  if (s.totalSales > 0 && s.daysSinceLast !== null && s.daysSinceLast > 30) out.push('inactivo');
  if (s.visits30 >= 4) out.push('frecuente');
  if (s.cents90 >= 1_500_000 || s.visits90 >= 36) out.push('vip');
  if (s.monthlyCents >= 300_000) out.push('alto_consumo');
  else if (s.totalSales > 0 && s.monthlyCents < 80_000 && !out.includes('nuevo')) out.push('bajo_consumo');
  return out;
}

export function segmentsOf(ctx: Ctx, tenantId: string, membershipId: string, at: Date = ctx.now()): { segments: Segment[]; stats: MemberStats } {
  const stats = memberStats(ctx, tenantId, membershipId, at);
  return { segments: segmentsFromStats(stats, at), stats };
}

export interface SegmentCount { key: Segment | string; label: string; members: number; avgTicketCents: number; avgVisits30: number }

/** Conteo por segmento y por estación, ciudad y estado de origen. */
export function segmentCounts(ctx: Ctx, tenantId: string): SegmentCount[] {
  const members = all<{ id: string }>(ctx.db, 'SELECT id FROM memberships WHERE tenant_id = ?', tenantId);
  const acc = new Map<string, { label: string; n: number; ticket: number; visits: number }>();
  const bump = (key: string, label: string, s: MemberStats) => {
    const a = acc.get(key) ?? { label, n: 0, ticket: 0, visits: 0 };
    a.n++; a.ticket += s.avgTicketCents; a.visits += s.visits30; acc.set(key, a);
  };
  const stations = new Map(all<{ id: string; name: string; city: string | null; state: string | null }>(ctx.db, 'SELECT id, name, city, state FROM stations WHERE tenant_id = ?', tenantId).map((s) => [s.id, s]));
  const at = ctx.now();
  for (const m of members) {
    const s = memberStats(ctx, tenantId, m.id, at);
    for (const seg of segmentsFromStats(s, at)) bump(seg, SEGMENT_LABELS[seg], s);
    const st = s.homeStationId ? stations.get(s.homeStationId) : undefined;
    if (st) { bump(`station:${st.id}`, `Estación ${st.name}`, s); if (st.city) bump(`city:${st.city}`, `Ciudad ${st.city}`, s); if (st.state) bump(`state:${st.state}`, `Estado ${st.state}`, s); }
  }
  const order = (k: string) => { const i = (SEGMENTS as readonly string[]).indexOf(k); return i === -1 ? 100 : i; };
  return [...acc.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[1].label.localeCompare(b[1].label))
    .map(([key, a]) => ({ key, label: a.label, members: a.n, avgTicketCents: Math.round(a.ticket / a.n), avgVisits30: Math.round((a.visits / a.n) * 10) / 10 }));
}

export function membersInSegment(ctx: Ctx, tenantId: string, key: string, limit = 200) {
  const rows = all<{ id: string; first_name: string; customer_type: CustomerType; home_station_id: string | null; points_balance: number }>(ctx.db, 'SELECT id, first_name, customer_type, home_station_id, points_balance FROM memberships WHERE tenant_id = ?', tenantId);
  const stations = new Map(all<{ id: string; name: string; city: string | null; state: string | null }>(ctx.db, 'SELECT id, name, city, state FROM stations WHERE tenant_id = ?', tenantId).map((s) => [s.id, s]));
  const at = ctx.now();
  const out: Array<{ membershipId: string; firstName: string; customerType: CustomerType; station: string | null; points: number; visits30: number; avgTicketCents: number; segments: Segment[] }> = [];
  for (const r of rows) {
    const s = memberStats(ctx, tenantId, r.id, at);
    const segs = segmentsFromStats(s, at);
    const st = r.home_station_id ? stations.get(r.home_station_id) : undefined;
    const match = (segs as string[]).includes(key) || (st && (key === `station:${st.id}` || key === `city:${st.city}` || key === `state:${st.state}`));
    if (match) out.push({ membershipId: r.id, firstName: r.first_name, customerType: r.customer_type, station: st?.name ?? null, points: r.points_balance, visits30: s.visits30, avgTicketCents: s.avgTicketCents, segments: segs });
    if (out.length >= limit) break;
  }
  return out;
}
