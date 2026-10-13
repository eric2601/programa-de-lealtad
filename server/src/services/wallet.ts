import type { Ctx } from '../context.js';
import { audit, iso, newId } from '../context.js';
import { all, one, run } from '../db.js';
import { unprocessable } from '../errors.js';

export interface WalletMovementRow {
  id: string; tenant_id: string; membership_id: string; kind: 'earn' | 'spend' | 'expire' | 'cancel' | 'reverse';
  amount_cents: number; remaining_cents: number; status: 'active' | 'partial' | 'used' | 'expired' | 'cancelled' | 'done';
  source_type: string; promotion_id: string | null; station_id: string | null; sale_id: string | null;
  expires_at: string | null; note: string | null; created_at: string;
  min_purchase_cents: number; scope: 'any' | 'fuel' | 'store'; single_use: number;
}

export interface CreditInput {
  tenantId: string; membershipId: string; amountCents: number;
  sourceType: 'promotion' | 'cashback' | 'bonus' | 'referral' | 'campaign' | 'birthday' | 'loyalty' | 'manual';
  promotionId?: string | null; stationId?: string | null; saleId?: string | null; expiresDays?: number | null; note?: string;
  /** Condiciones de uso del abono. */
  minPurchaseCents?: number; scope?: 'any' | 'fuel' | 'store'; singleUse?: boolean;
}

/** Importes de la compra en la que se quiere usar dinero virtual. */
export interface SaleAmounts { totalCents: number; fuelCents: number; storeCents: number }
const NO_LIMIT: SaleAmounts = { totalCents: Number.MAX_SAFE_INTEGER, fuelCents: Number.MAX_SAFE_INTEGER, storeCents: Number.MAX_SAFE_INTEGER };

const INSERT = 'INSERT INTO wallet_movements (id, tenant_id, membership_id, kind, amount_cents, remaining_cents, status, source_type, promotion_id, station_id, sale_id, expires_at, note, created_at, min_purchase_cents, scope, single_use) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

/** Marca como expirados los abonos vencidos con saldo, dejando el movimiento de expiración. */
export function expireStale(ctx: Ctx, tenantId: string, membershipId?: string): number {
  const now = iso(ctx.now());
  const rows = all<WalletMovementRow>(ctx.db,
    `SELECT * FROM wallet_movements WHERE tenant_id = ? AND kind = 'earn' AND status IN ('active','partial') AND remaining_cents > 0 AND expires_at IS NOT NULL AND expires_at <= ?${membershipId ? ' AND membership_id = ?' : ''}`,
    ...(membershipId ? [tenantId, now, membershipId] : [tenantId, now]));
  for (const r of rows) {
    run(ctx.db, INSERT, newId(), tenantId, r.membership_id, 'expire', r.remaining_cents, 0, 'done', r.source_type, r.promotion_id, r.station_id, null, null, `Expiró el abono ${r.id.slice(0, 8)}`, now, 0, 'any', 0);
    run(ctx.db, `UPDATE wallet_movements SET remaining_cents = 0, status = 'expired' WHERE id = ?`, r.id);
  }
  return rows.length;
}

export function credit(ctx: Ctx, input: CreditInput): WalletMovementRow {
  if (input.amountCents <= 0) throw unprocessable('WALLET_AMOUNT', 'El abono debe ser mayor que cero.');
  const now = ctx.now();
  const id = newId();
  const expiresAt = input.expiresDays ? iso(new Date(now.getTime() + input.expiresDays * 86_400_000)) : null;
  run(ctx.db, INSERT, id, input.tenantId, input.membershipId, 'earn', input.amountCents, input.amountCents, 'active', input.sourceType, input.promotionId ?? null, input.stationId ?? null, input.saleId ?? null, expiresAt, input.note ?? null, iso(now), input.minPurchaseCents ?? 0, input.scope ?? 'any', input.singleUse ? 1 : 0);
  return one<WalletMovementRow>(ctx.db, 'SELECT * FROM wallet_movements WHERE id = ?', id)!;
}

/** Saldo total vigente, sin considerar las condiciones de cada abono. */
export function availableCents(ctx: Ctx, tenantId: string, membershipId: string): number {
  expireStale(ctx, tenantId, membershipId);
  const row = one<{ s: number | null }>(ctx.db, `SELECT SUM(remaining_cents) AS s FROM wallet_movements WHERE tenant_id = ? AND membership_id = ? AND kind = 'earn' AND status IN ('active','partial')`, tenantId, membershipId);
  return row?.s ?? 0;
}

interface Allocation { earn: WalletMovementRow; take: number; forfeit: number }

/**
 * Plan de gasto: qué abonos se usan y cuánto de cada uno, respetando compra mínima, ámbito
 * (combustible o tienda) y uso único. Se consumen primero los que vencen antes.
 */
function plan(ctx: Ctx, tenantId: string, membershipId: string, wanted: number, amounts: SaleAmounts): { allocations: Allocation[]; total: number } {
  expireStale(ctx, tenantId, membershipId);
  const earns = all<WalletMovementRow>(ctx.db,
    `SELECT * FROM wallet_movements WHERE tenant_id = ? AND membership_id = ? AND kind = 'earn' AND status IN ('active','partial') AND remaining_cents > 0 AND min_purchase_cents <= ?
     ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at`, tenantId, membershipId, amounts.totalCents);
  let left = wanted, fuelCap = amounts.fuelCents, storeCap = amounts.storeCents;
  const allocations: Allocation[] = [];
  for (const e of earns) {
    if (left <= 0) break;
    const cap = e.scope === 'fuel' ? fuelCap : e.scope === 'store' ? storeCap : fuelCap + storeCap;
    const take = Math.min(left, e.remaining_cents, cap);
    if (take <= 0) continue;
    if (e.scope === 'fuel') fuelCap -= take;
    else if (e.scope === 'store') storeCap -= take;
    else { const f = Math.min(take, fuelCap); fuelCap -= f; storeCap -= take - f; }
    allocations.push({ earn: e, take, forfeit: e.single_use ? e.remaining_cents - take : 0 });
    left -= take;
  }
  return { allocations, total: wanted - left };
}

/** Máximo de dinero virtual utilizable en esta compra, con las condiciones de cada abono. */
export function spendableCents(ctx: Ctx, tenantId: string, membershipId: string, amounts: SaleAmounts): number {
  return plan(ctx, tenantId, membershipId, Number.MAX_SAFE_INTEGER, amounts).total;
}

/** Gasta dinero virtual consumiendo primero los abonos que vencen antes (FIFO por expiración). */
export function spend(ctx: Ctx, input: { tenantId: string; membershipId: string; amountCents: number; saleId: string; stationId: string; amounts?: SaleAmounts }): WalletMovementRow {
  if (input.amountCents <= 0) throw unprocessable('WALLET_AMOUNT', 'El importe debe ser mayor que cero.');
  const amounts = input.amounts ?? NO_LIMIT;
  const { allocations, total } = plan(ctx, input.tenantId, input.membershipId, input.amountCents, amounts);
  if (total < input.amountCents) throw unprocessable('WALLET_INSUFFICIENT', `Dinero virtual utilizable insuficiente en esta compra: $${(total / 100).toFixed(2)}.`);
  const now = iso(ctx.now());
  const spendId = newId();
  run(ctx.db, INSERT, spendId, input.tenantId, input.membershipId, 'spend', input.amountCents, 0, 'done', 'sale', null, input.stationId, input.saleId, null, 'Pago con dinero virtual', now, 0, 'any', 0);
  for (const a of allocations) {
    run(ctx.db, 'INSERT INTO wallet_allocations (id, spend_id, earn_id, amount_cents) VALUES (?,?,?,?)', newId(), spendId, a.earn.id, a.take);
    const remaining = a.earn.remaining_cents - a.take - a.forfeit;
    run(ctx.db, `UPDATE wallet_movements SET remaining_cents = ?, status = ? WHERE id = ?`, remaining, remaining === 0 ? 'used' : 'partial', a.earn.id);
    if (a.forfeit > 0) {
      run(ctx.db, INSERT, newId(), input.tenantId, input.membershipId, 'cancel', a.forfeit, 0, 'done', a.earn.source_type, a.earn.promotion_id, input.stationId, input.saleId, null, 'Uso único: sobrante no utilizado', now, 0, 'any', 0);
    }
  }
  return one<WalletMovementRow>(ctx.db, 'SELECT * FROM wallet_movements WHERE id = ?', spendId)!;
}

/** Al anular una venta: cancela lo abonado por ella y devuelve lo gastado en ella. */
export function reverseForSale(ctx: Ctx, tenantId: string, saleId: string, actorUserId: string | null): void {
  const now = iso(ctx.now());
  const earns = all<WalletMovementRow>(ctx.db, `SELECT * FROM wallet_movements WHERE tenant_id = ? AND sale_id = ? AND kind = 'earn' AND status IN ('active','partial')`, tenantId, saleId);
  for (const e of earns) {
    if (e.remaining_cents > 0) run(ctx.db, INSERT, newId(), tenantId, e.membership_id, 'cancel', e.remaining_cents, 0, 'done', e.source_type, e.promotion_id, e.station_id, saleId, null, 'Venta anulada', now, 0, 'any', 0);
    run(ctx.db, `UPDATE wallet_movements SET remaining_cents = 0, status = 'cancelled' WHERE id = ?`, e.id);
  }
  const spends = all<WalletMovementRow>(ctx.db, `SELECT * FROM wallet_movements WHERE tenant_id = ? AND sale_id = ? AND kind = 'spend'`, tenantId, saleId);
  for (const s of spends) {
    const allocs = all<{ earn_id: string; amount_cents: number }>(ctx.db, 'SELECT earn_id, amount_cents FROM wallet_allocations WHERE spend_id = ?', s.id);
    for (const a of allocs) {
      const e = one<WalletMovementRow>(ctx.db, 'SELECT * FROM wallet_movements WHERE id = ?', a.earn_id);
      if (!e || e.status === 'cancelled') continue;
      const remaining = e.remaining_cents + a.amount_cents;
      run(ctx.db, `UPDATE wallet_movements SET remaining_cents = ?, status = ? WHERE id = ?`, remaining, remaining === e.amount_cents ? 'active' : 'partial', e.id);
    }
    run(ctx.db, INSERT, newId(), tenantId, s.membership_id, 'reverse', s.amount_cents, 0, 'done', 'sale', null, s.station_id, saleId, null, 'Devolución por venta anulada', now, 0, 'any', 0);
  }
  if (earns.length || spends.length) audit(ctx, tenantId, actorUserId, 'wallet.reverse', 'sale', saleId, { earns: earns.length, spends: spends.length });
}

export interface WalletSummary {
  availableCents: number; generatedCents: number; usedCents: number; expiredCents: number; cancelledCents: number;
  nextExpiry: { cents: number; at: string } | null;
  movements: Array<{ id: string; kind: string; amountCents: number; remainingCents: number; status: string; sourceType: string; promotionId: string | null; promotionName: string | null; stationName: string | null; saleReference: string | null; expiresAt: string | null; note: string | null; createdAt: string; minPurchaseCents: number; scope: string; singleUse: boolean; conditions: string | null }>;
}

function conditionsText(minPurchase: number, scope: string, singleUse: boolean): string | null {
  const parts: string[] = [];
  if (minPurchase > 0) parts.push(`compra mínima $${(minPurchase / 100).toLocaleString('es-MX')}`);
  if (scope === 'store') parts.push('solo en tienda');
  if (scope === 'fuel') parts.push('solo en combustible');
  if (singleUse) parts.push('uso único');
  return parts.length ? parts.join(' · ') : null;
}

export function summary(ctx: Ctx, tenantId: string, membershipId: string, limit = 40): WalletSummary {
  const availableCentsNow = availableCents(ctx, tenantId, membershipId);
  const sums = one<{ generated: number | null; used: number | null; expired: number | null; cancelled: number | null }>(ctx.db,
    `SELECT SUM(CASE WHEN kind='earn' THEN amount_cents END) AS generated, SUM(CASE WHEN kind='spend' THEN amount_cents END) AS used,
            SUM(CASE WHEN kind='expire' THEN amount_cents END) AS expired, SUM(CASE WHEN kind='cancel' THEN amount_cents END) AS cancelled
     FROM wallet_movements WHERE tenant_id = ? AND membership_id = ?`, tenantId, membershipId);
  const next = one<{ cents: number; at: string }>(ctx.db,
    `SELECT remaining_cents AS cents, expires_at AS at FROM wallet_movements WHERE tenant_id = ? AND membership_id = ? AND kind='earn' AND status IN ('active','partial') AND expires_at IS NOT NULL ORDER BY expires_at LIMIT 1`, tenantId, membershipId);
  const movements = all<Record<string, unknown>>(ctx.db,
    `SELECT w.*, p.name AS promotion_name, st.name AS station_name, s.pos_reference
     FROM wallet_movements w LEFT JOIN promotions p ON p.id = w.promotion_id LEFT JOIN stations st ON st.id = w.station_id LEFT JOIN sales s ON s.id = w.sale_id
     WHERE w.tenant_id = ? AND w.membership_id = ? ORDER BY w.created_at DESC LIMIT ?`, tenantId, membershipId, limit);
  return {
    availableCents: availableCentsNow,
    generatedCents: sums?.generated ?? 0, usedCents: sums?.used ?? 0, expiredCents: sums?.expired ?? 0, cancelledCents: sums?.cancelled ?? 0,
    nextExpiry: next ?? null,
    movements: movements.map((m) => ({
      id: m.id as string, kind: m.kind as string, amountCents: m.amount_cents as number, remainingCents: m.remaining_cents as number, status: m.status as string,
      sourceType: m.source_type as string, promotionId: (m.promotion_id as string) ?? null, promotionName: (m.promotion_name as string) ?? null,
      stationName: (m.station_name as string) ?? null, saleReference: (m.pos_reference as string) ?? null, expiresAt: (m.expires_at as string) ?? null,
      note: (m.note as string) ?? null, createdAt: m.created_at as string,
      minPurchaseCents: (m.min_purchase_cents as number) ?? 0, scope: (m.scope as string) ?? 'any', singleUse: !!(m.single_use as number),
      conditions: m.kind === 'earn' ? conditionsText((m.min_purchase_cents as number) ?? 0, (m.scope as string) ?? 'any', !!(m.single_use as number)) : null,
    })),
  };
}
