import type { Ctx } from '../context.js';
import { iso, newId } from '../context.js';
import { all, one, run } from '../db.js';

/**
 * Notificaciones automáticas (sección 16). Cada regla busca eventos, evita duplicados con la
 * clave (kind, ref) y envía por el canal permitido: las de servicio a todo miembro, las
 * promocionales solo a quien autorizó publicidad.
 */
export const KINDS = ['nueva_promocion', 'promocion_por_vencer', 'dinero_por_expirar', 'cupon_por_vencer', 'promocion_por_agotarse', 'nuevo_beneficio', 'cliente_inactivo', 'cumpleanos', 'meta_alcanzada'] as const;
export const KIND_LABELS: Record<typeof KINDS[number], string> = {
  nueva_promocion: 'Nueva promoción', promocion_por_vencer: 'Promoción próxima a vencer', dinero_por_expirar: 'Dinero virtual por expirar', cupon_por_vencer: 'Cupón por vencer',
  promocion_por_agotarse: 'Promoción cerca de agotarse', nuevo_beneficio: 'Nuevo beneficio disponible', cliente_inactivo: 'Cliente inactivo', cumpleanos: 'Cumpleaños', meta_alcanzada: 'Meta de consumo alcanzada',
};
const MARKETING = new Set(['nueva_promocion', 'promocion_por_vencer', 'cliente_inactivo', 'cumpleanos']);

interface MemberRow { id: string; first_name: string; phone_e164: string; marketing: number }

function members(ctx: Ctx, tenantId: string): MemberRow[] {
  return all<MemberRow>(ctx.db,
    `SELECT m.id, m.first_name, c.phone_e164,
            COALESCE((SELECT granted FROM consents WHERE membership_id = m.id AND purpose = 'marketing' ORDER BY created_at DESC LIMIT 1), 0) AS marketing
     FROM memberships m JOIN customers c ON c.id = m.customer_id WHERE m.tenant_id = ?`, tenantId);
}

function emit(ctx: Ctx, tenantId: string, m: MemberRow | null, kind: typeof KINDS[number], ref: string, title: string, body: string, out: { created: number; skipped: number }): void {
  const exists = one(ctx.db, 'SELECT 1 AS x FROM notifications WHERE tenant_id = ? AND kind = ? AND ref = ?', tenantId, kind, ref);
  if (exists) { out.skipped++; return; }
  const marketing = MARKETING.has(kind);
  const channel = m ? (marketing ? 'whatsapp_marketing' : 'whatsapp_service') : 'admin';
  const allowed = !m || !marketing || !!m.marketing;
  run(ctx.db, 'INSERT INTO notifications (id, tenant_id, membership_id, kind, ref, title, body, channel, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    newId(), tenantId, m?.id ?? null, kind, ref, title, body, channel, allowed ? 'sent' : 'blocked_no_consent', iso(ctx.now()));
  if (m && allowed) ctx.notifier.send(m.phone_e164, marketing ? 'marketing' : 'utility', `${title}. ${body}${marketing ? ' Responde BAJA para no recibir promociones.' : ''}`);
  out.created++;
}

export function run_(ctx: Ctx, tenantId: string, opts: { maxPerKind?: number } = {}) {
  const max = opts.maxPerKind ?? 200;
  const now = ctx.now(); const nowIso = iso(now);
  const in3 = iso(new Date(now.getTime() + 3 * 86_400_000)); const in7 = iso(new Date(now.getTime() + 7 * 86_400_000));
  const ago1 = iso(new Date(now.getTime() - 86_400_000)); const ago30 = iso(new Date(now.getTime() - 30 * 86_400_000));
  const out = { created: 0, skipped: 0 };
  const all_ = members(ctx, tenantId);
  const promos = all<{ id: string; name: string; rules_json: string; inventory_initial: number | null; inventory_used: number; created_at: string; benefit_json: string }>(ctx.db, `SELECT id, name, rules_json, inventory_initial, inventory_used, created_at, benefit_json FROM promotions WHERE tenant_id = ? AND status = 'active'`, tenantId);

  // Nueva promoción (últimas 24 h) y promoción próxima a vencer (3 días): a quien autorizó publicidad.
  for (const p of promos) {
    const r = JSON.parse(p.rules_json) as { endsAt?: string };
    if (p.created_at >= ago1) all_.slice(0, max).forEach((m) => emit(ctx, tenantId, m, 'nueva_promocion', `${p.id}:${m.id}`, `Nueva promoción: ${p.name}`, 'Di tu número al cargar y aplica automáticamente.', out));
    if (r.endsAt && r.endsAt > nowIso && r.endsAt <= in3) all_.slice(0, max).forEach((m) => emit(ctx, tenantId, m, 'promocion_por_vencer', `${p.id}:${m.id}`, `${p.name} termina pronto`, `Aprovéchala antes del ${r.endsAt!.slice(0, 10)}.`, out));
    if (p.inventory_initial !== null && p.inventory_used / p.inventory_initial >= 0.85 && p.inventory_used < p.inventory_initial) {
      emit(ctx, tenantId, null, 'promocion_por_agotarse', `${p.id}:${p.inventory_used}`, `"${p.name}" está por agotarse`, `Quedan ${p.inventory_initial - p.inventory_used} de ${p.inventory_initial} beneficios.`, out);
    }
  }
  // Dinero virtual por expirar (7 días), cupón por vencer (3 días): servicio.
  const wallet = all<{ membership_id: string; cents: number; at: string }>(ctx.db, `SELECT membership_id, SUM(remaining_cents) AS cents, MIN(expires_at) AS at FROM wallet_movements WHERE tenant_id = ? AND kind='earn' AND status IN ('active','partial') AND expires_at > ? AND expires_at <= ? GROUP BY membership_id`, tenantId, nowIso, in7);
  for (const w of wallet.slice(0, max)) { const m = all_.find((x) => x.id === w.membership_id); if (m) emit(ctx, tenantId, m, 'dinero_por_expirar', `${m.id}:${w.at.slice(0, 10)}`, `Tienes $${(w.cents / 100).toFixed(0)} por vencer`, `Úsalos en tu próxima carga antes del ${w.at.slice(0, 10)}.`, out); }
  const coupons = all<{ id: string; membership_id: string; label: string | null; valid_until: string }>(ctx.db, `SELECT id, membership_id, label, valid_until FROM coupons WHERE tenant_id = ? AND status = 'issued' AND valid_until > ? AND valid_until <= ?`, tenantId, nowIso, in3);
  for (const c of coupons.slice(0, max)) { const m = all_.find((x) => x.id === c.membership_id); if (m) emit(ctx, tenantId, m, 'cupon_por_vencer', c.id, `Tu cupón "${c.label ?? 'cupón'}" vence pronto`, `Canjéalo antes del ${c.valid_until.slice(0, 10)}.`, out); }
  // Nuevo beneficio disponible: puntos suficientes para canjear (servicio), una vez por umbral.
  const canRedeem = all<{ id: string; points_balance: number }>(ctx.db, `SELECT id, points_balance FROM memberships WHERE tenant_id = ? AND points_balance >= 100`, tenantId);
  for (const r of canRedeem.slice(0, max)) { const m = all_.find((x) => x.id === r.id); if (m) emit(ctx, tenantId, m, 'nuevo_beneficio', `${m.id}:${Math.floor(r.points_balance / 100) * 100}`, 'Ya puedes canjear tus puntos', `Tienes ${r.points_balance} puntos disponibles en tu próxima carga.`, out); }
  // Cliente inactivo (30 días sin cargar): marketing.
  const inactive = all<{ id: string; last: string }>(ctx.db, `SELECT id, last_purchase_at AS last FROM memberships WHERE tenant_id = ? AND last_purchase_at IS NOT NULL AND last_purchase_at < ?`, tenantId, ago30);
  for (const r of inactive.slice(0, max)) { const m = all_.find((x) => x.id === r.id); if (m) emit(ctx, tenantId, m, 'cliente_inactivo', `${m.id}:${r.last.slice(0, 7)}`, `${m.first_name}, te extrañamos`, 'Esta semana tienes puntos extra con tu número en cualquier estación del grupo.', out); }
  // Cumpleaños hoy: marketing.
  const mmdd = nowIso.slice(5, 10);
  const bday = all<{ id: string }>(ctx.db, `SELECT id FROM memberships WHERE tenant_id = ? AND birthday IS NOT NULL AND substr(birthday, 6, 5) = ?`, tenantId, mmdd);
  for (const r of bday) { const m = all_.find((x) => x.id === r.id); if (m) emit(ctx, tenantId, m, 'cumpleanos', `${m.id}:${nowIso.slice(0, 4)}`, `¡Feliz cumpleaños, ${m.first_name}!`, 'Tienes un lavado gratis esta semana en tu estación.', out); }
  // Meta de consumo alcanzada: promociones de frecuencia o consumo mensual entregadas hoy (servicio).
  const goals = all<{ membership_id: string; name: string; sale_id: string }>(ctx.db,
    `SELECT u.membership_id, p.name, u.sale_id FROM promotion_usages u JOIN promotions p ON p.id = u.promotion_id WHERE u.tenant_id = ? AND u.created_at >= ? AND (p.rules_json LIKE '%visitsInPeriod%' OR p.rules_json LIKE '%minMonthlyCents%')`, tenantId, ago1);
  for (const g of goals.slice(0, max)) { const m = all_.find((x) => x.id === g.membership_id); if (m) emit(ctx, tenantId, m, 'meta_alcanzada', g.sale_id, `¡Alcanzaste tu meta: ${g.name}!`, 'Tu beneficio ya está en tu cuenta.', out); }
  return out;
}

export function list(ctx: Ctx, tenantId: string, limit = 100) {
  const rows = all<Record<string, unknown>>(ctx.db,
    `SELECT n.*, m.first_name FROM notifications n LEFT JOIN memberships m ON m.id = n.membership_id WHERE n.tenant_id = ? ORDER BY n.created_at DESC LIMIT ?`, tenantId, limit);
  const counts = all<{ kind: string; n: number }>(ctx.db, 'SELECT kind, COUNT(*) AS n FROM notifications WHERE tenant_id = ? GROUP BY kind', tenantId);
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind, kindLabel: KIND_LABELS[r.kind as keyof typeof KIND_LABELS] ?? r.kind, title: r.title, body: r.body, channel: r.channel, status: r.status, firstName: r.first_name ?? null, createdAt: r.created_at })),
    counts: counts.map((c) => ({ kind: c.kind, label: KIND_LABELS[c.kind as keyof typeof KIND_LABELS] ?? c.kind, count: c.n })),
  };
}

export function forMember(ctx: Ctx, tenantId: string, membershipId: string, limit = 20) {
  return all<Record<string, unknown>>(ctx.db, `SELECT id, kind, title, body, status, created_at FROM notifications WHERE tenant_id = ? AND membership_id = ? ORDER BY created_at DESC LIMIT ?`, tenantId, membershipId, limit)
    .map((r) => ({ id: r.id, kind: r.kind, kindLabel: KIND_LABELS[r.kind as keyof typeof KIND_LABELS] ?? r.kind, title: r.title, body: r.body, status: r.status, createdAt: r.created_at }));
}
