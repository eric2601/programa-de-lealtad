import { randomInt } from 'node:crypto';
import type { Ctx } from '../context.js';
import { audit, iso, loadProgram, newId } from '../context.js';
import { all, one, run, withTx } from '../db.js';
import { notFound, unprocessable } from '../errors.js';
import { drawScratchPrize, type ProgramConfig } from '../rules.js';
import { getMembership } from './customers.js';

export interface ScratchCardRow {
  id: string; tenant_id: string; membership_id: string; sale_id: string;
  status: 'available' | 'revealed' | 'expired' | 'cancelled';
  prize_points: number; prize_label: string; created_at: string; expires_at: string; revealed_at: string | null;
}

export interface PublicScratchCard {
  id: string; status: ScratchCardRow['status']; createdAt: string; expiresAt: string; saleReference: string | null;
  /** Solo se expone después de rascar. */
  prize: { points: number; label: string } | null;
}

function dayBounds(at: Date): { from: string; to: string } {
  const start = new Date(at); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: iso(start), to: iso(end) };
}

/**
 * Emite una tarjeta si la carga supera el mínimo y no se rebasó el tope diario. Se llama dentro
 * de la transacción de la venta. El premio queda decidido aquí, no al rascar.
 */
export function issueCardForSale(ctx: Ctx, cfg: ProgramConfig, tenantId: string, membershipId: string, saleId: string, fuelCents: number, dispensedAt: Date): ScratchCardRow | null {
  const s = cfg.scratch;
  if (!s?.enabled || fuelCents < s.minFuelCents || s.prizes.length === 0) return null;
  const { from, to } = dayBounds(dispensedAt);
  // El tope diario se mide por la fecha del despacho, no por cuándo se creó la tarjeta.
  const today = one<{ n: number }>(ctx.db,
    `SELECT COUNT(*) AS n FROM scratch_cards c JOIN sales s ON s.id = c.sale_id
     WHERE c.tenant_id = ? AND c.membership_id = ? AND c.status != 'cancelled' AND s.dispensed_at >= ? AND s.dispensed_at < ?`,
    tenantId, membershipId, from, to);
  if ((today?.n ?? 0) >= s.maxPerDay) return null;
  const prize = drawScratchPrize(s.prizes, (max) => randomInt(0, max));
  const now = ctx.now();
  const id = newId();
  const expiresAt = iso(new Date(now.getTime() + s.expiresDays * 86_400_000));
  run(ctx.db, 'INSERT INTO scratch_cards (id, tenant_id, membership_id, sale_id, status, prize_points, prize_label, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, tenantId, membershipId, saleId, 'available', prize.points, prize.label, iso(now), expiresAt);
  audit(ctx, tenantId, null, 'scratch.issue', 'scratch_card', id, { saleId, fuelCents });
  return one<ScratchCardRow>(ctx.db, 'SELECT * FROM scratch_cards WHERE id = ?', id)!;
}

export function toPublic(ctx: Ctx, c: ScratchCardRow): PublicScratchCard {
  const sale = one<{ pos_reference: string }>(ctx.db, 'SELECT pos_reference FROM sales WHERE id = ?', c.sale_id);
  return {
    id: c.id, status: c.status, createdAt: c.created_at, expiresAt: c.expires_at, saleReference: sale?.pos_reference ?? null,
    prize: c.status === 'revealed' ? { points: c.prize_points, label: c.prize_label } : null,
  };
}

/** Tarjetas vigentes o reveladas en los últimos 30 días, para el portal y la isla. */
export function cardsForMembership(ctx: Ctx, membershipId: string): PublicScratchCard[] {
  const now = ctx.now();
  const since = iso(new Date(now.getTime() - 30 * 86_400_000));
  const rows = all<ScratchCardRow>(ctx.db,
    `SELECT * FROM scratch_cards WHERE membership_id = ? AND (status = 'available' OR created_at >= ?) AND status != 'cancelled' ORDER BY created_at DESC`,
    membershipId, since);
  return rows.map((c) => {
    if (c.status === 'available' && c.expires_at <= iso(now)) {
      run(ctx.db, `UPDATE scratch_cards SET status = 'expired' WHERE id = ?`, c.id);
      c.status = 'expired';
    }
    return toPublic(ctx, c);
  });
}

export function pendingCount(ctx: Ctx, membershipId: string): number {
  const row = one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM scratch_cards WHERE membership_id = ? AND status = 'available' AND expires_at > ?`, membershipId, iso(ctx.now()));
  return row?.n ?? 0;
}

export interface RevealScope { tenantId?: string; customerId?: string; actorUserId?: string | null }

/**
 * Revela la tarjeta y acredita el premio. Es idempotente: rascar dos veces devuelve el mismo
 * premio sin acreditarlo de nuevo. El asiento lleva el `sale_id` de la carga que la originó,
 * así una anulación de la venta también revierte el premio.
 */
export function revealCard(ctx: Ctx, cardId: string, scope: RevealScope) {
  return withTx(ctx.db, () => {
    const card = one<ScratchCardRow>(ctx.db, 'SELECT * FROM scratch_cards WHERE id = ?', cardId);
    if (!card || (scope.tenantId && card.tenant_id !== scope.tenantId)) throw notFound('SCRATCH_NOT_FOUND', 'No encontramos esa tarjeta.');
    const membership = getMembership(ctx, card.tenant_id, card.membership_id);
    if (scope.customerId && membership.customer_id !== scope.customerId) throw notFound('SCRATCH_NOT_FOUND', 'No encontramos esa tarjeta.');
    const cfg = loadProgram(ctx, card.tenant_id);
    const now = ctx.now();
    if (card.status === 'revealed') {
      return { cardId: card.id, status: 'revealed' as const, prize: { points: card.prize_points, label: card.prize_label }, creditedPoints: 0, balance: membership.points_balance, alreadyRevealed: true };
    }
    if (card.status !== 'available' || card.expires_at <= iso(now)) {
      if (card.status === 'available') run(ctx.db, `UPDATE scratch_cards SET status = 'expired' WHERE id = ?`, card.id);
      throw unprocessable('SCRATCH_EXPIRED', 'Esta tarjeta ya venció o fue cancelada.');
    }
    const customer = one<{ verified_at: string | null }>(ctx.db, 'SELECT verified_at FROM customers WHERE id = ?', membership.customer_id);
    let points = card.prize_points;
    if (!customer?.verified_at) points = Math.min(points, Math.max(0, cfg.unverifiedPointsCap - membership.points_balance));
    if (points > 0) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        newId(), card.tenant_id, card.membership_id, 'earn', points, card.sale_id, scope.actorUserId ?? null, `Rasca y Gana: ${card.prize_label}`, iso(now));
      run(ctx.db, 'UPDATE memberships SET points_balance = points_balance + ? WHERE id = ?', points, card.membership_id);
    }
    run(ctx.db, `UPDATE scratch_cards SET status = 'revealed', revealed_at = ? WHERE id = ?`, iso(now), card.id);
    audit(ctx, card.tenant_id, scope.actorUserId ?? null, 'scratch.reveal', 'scratch_card', card.id, { prize: card.prize_points, credited: points });
    const fresh = getMembership(ctx, card.tenant_id, card.membership_id);
    return { cardId: card.id, status: 'revealed' as const, prize: { points: card.prize_points, label: card.prize_label }, creditedPoints: points, balance: fresh.points_balance, alreadyRevealed: false };
  });
}

export function cancelCardsForSale(ctx: Ctx, saleId: string): void {
  run(ctx.db, `UPDATE scratch_cards SET status = 'cancelled' WHERE sale_id = ? AND status IN ('available','revealed')`, saleId);
}
