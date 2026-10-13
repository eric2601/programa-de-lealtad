import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { audit, iso, loadProgram, newId } from '../context.js';
import { all, one, run, withTx } from '../db.js';
import { notFound, unprocessable } from '../errors.js';
import { pointsToCents } from '../rules.js';
import { codeMatches, findCustomerByPhone, findMembership, getMembership, hashCode, heldPoints, type CustomerRow } from './customers.js';

export interface RedemptionRow {
  id: string; tenant_id: string; membership_id: string; points: number; value_cents: number;
  status: 'pending' | 'confirmed' | 'applied' | 'expired' | 'cancelled'; code_hash: string; attempts: number;
  sale_id: string | null; expires_at: string; created_at: string;
}

const MAX_ATTEMPTS = 3;

export const prepareSchema = z.object({
  // Teléfono (10 dígitos) o placa: las de moto y CDMX tienen 6 caracteres.
  phone: z.string().min(6),
  points: z.number().int().positive(),
});

/** Marca como expiradas las reservas vencidas y deja asiento de liberación para auditoría. */
export function expireStale(ctx: Ctx, tenantId: string): number {
  const now = iso(ctx.now());
  const stale = all<RedemptionRow>(ctx.db, `SELECT * FROM redemptions WHERE tenant_id = ? AND status IN ('pending','confirmed') AND expires_at <= ?`, tenantId, now);
  for (const r of stale) {
    run(ctx.db, `UPDATE redemptions SET status = 'expired' WHERE id = ?`, r.id);
    run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, note, created_at) VALUES (?,?,?,?,?,?,?)',
      newId(), tenantId, r.membership_id, 'release', 0, `Reserva ${r.id} de ${r.points} puntos liberada por expiración`, now);
  }
  return stale.length;
}

/**
 * Reserva puntos y envía un código de un solo uso al teléfono del cliente. La reserva
 * descuenta del saldo disponible sin tocar el libro; el asiento definitivo se escribe al
 * cerrar la venta. Dos reservas que juntas exceden el saldo no pueden coexistir.
 */
export function prepare(ctx: Ctx, tenantId: string, userId: string, input: z.infer<typeof prepareSchema>) {
  const data = prepareSchema.parse(input);
  const cfg = loadProgram(ctx, tenantId);
  const { customer, e164 } = findCustomerByPhone(ctx, data.phone);
  if (!customer) throw notFound('MEMBER_NOT_FOUND', 'Ese teléfono no participa en este programa.');
  const m = findMembership(ctx, tenantId, customer.id);
  if (!m) throw notFound('MEMBER_NOT_FOUND', 'Ese teléfono no participa en este programa.');
  if (!customer.verified_at) throw unprocessable('PHONE_UNVERIFIED', 'Para canjear, el cliente debe confirmar su teléfono una vez con el código que le enviamos.');
  if (data.points < cfg.redemption.minPoints) throw unprocessable('BELOW_MIN', `El canje mínimo es de ${cfg.redemption.minPoints} puntos.`);
  if (data.points % cfg.redemption.stepPoints !== 0) throw unprocessable('NOT_MULTIPLE', `El canje debe ser en múltiplos de ${cfg.redemption.stepPoints} puntos.`);

  const now = ctx.now();
  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  const result = withTx(ctx.db, () => {
    expireStale(ctx, tenantId);
    const fresh = getMembership(ctx, tenantId, m.id);
    const available = fresh.points_balance - heldPoints(ctx, tenantId, m.id);
    if (available < data.points) {
      throw unprocessable('INSUFFICIENT_POINTS', `Saldo disponible insuficiente: ${available} puntos.`);
    }
    const id = newId();
    const expiresAt = iso(new Date(now.getTime() + cfg.redemption.reservationMinutes * 60_000));
    const valueCents = pointsToCents(data.points, cfg);
    run(ctx.db, 'INSERT INTO redemptions (id, tenant_id, membership_id, points, value_cents, status, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, tenantId, m.id, data.points, valueCents, 'pending', hashCode(code, ctx.salt), expiresAt, iso(now));
    audit(ctx, tenantId, userId, 'redemption.prepare', 'redemption', id, { points: data.points });
    return { redemptionId: id, points: data.points, valueCents, expiresAt };
  });
  ctx.notifier.send(e164, 'auth', `Tu código para canjear ${data.points} puntos ($${(result.valueCents / 100).toFixed(2)}) es ${code}. Vence en ${cfg.redemption.reservationMinutes} minutos. No lo compartas.`);
  return { ...result, ...(ctx.devMode ? { devCode: code } : {}) };
}

/**
 * Confirma la reserva con el código. Los intentos fallidos se registran fuera de una
 * transacción envolvente para que persistan aunque la llamada termine en error.
 */
export function confirm(ctx: Ctx, tenantId: string, userId: string, redemptionId: string, code: string) {
  withTx(ctx.db, () => expireStale(ctx, tenantId));
  const r = one<RedemptionRow>(ctx.db, 'SELECT * FROM redemptions WHERE tenant_id = ? AND id = ?', tenantId, redemptionId);
  if (!r) throw notFound('REDEMPTION_NOT_FOUND', 'No encontramos ese canje.');
  if (r.status === 'expired') throw unprocessable('REDEMPTION_EXPIRED', 'La reserva venció. Prepara el canje de nuevo.');
  if (r.status !== 'pending') throw unprocessable('REDEMPTION_STATE', `El canje ya está en estado ${r.status}.`);
  if (!codeMatches(code, r.code_hash, ctx.salt)) {
    const attempts = r.attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    run(ctx.db, `UPDATE redemptions SET attempts = ?, status = CASE WHEN ? THEN 'cancelled' ELSE status END WHERE id = ?`, attempts, locked ? 1 : 0, r.id);
    audit(ctx, tenantId, userId, 'redemption.code_wrong', 'redemption', r.id, { attempts });
    if (locked) throw unprocessable('REDEMPTION_LOCKED', 'Demasiados intentos; el canje se canceló. Prepara uno nuevo.');
    throw unprocessable('CODE_WRONG', `Código incorrecto. Intentos restantes: ${MAX_ATTEMPTS - attempts}.`);
  }
  run(ctx.db, `UPDATE redemptions SET status = 'confirmed' WHERE id = ? AND status = 'pending'`, r.id);
  audit(ctx, tenantId, userId, 'redemption.confirm', 'redemption', r.id);
  return { redemptionId: r.id, points: r.points, valueCents: r.value_cents, status: 'confirmed' as const, expiresAt: r.expires_at };
}

export function cancel(ctx: Ctx, tenantId: string, userId: string, redemptionId: string): void {
  const r = one<RedemptionRow>(ctx.db, 'SELECT * FROM redemptions WHERE tenant_id = ? AND id = ?', tenantId, redemptionId);
  if (!r) throw notFound('REDEMPTION_NOT_FOUND', 'No encontramos ese canje.');
  if (r.status === 'applied') throw unprocessable('REDEMPTION_STATE', 'Un canje aplicado se revierte anulando la venta.');
  run(ctx.db, `UPDATE redemptions SET status = 'cancelled' WHERE id = ?`, r.id);
  audit(ctx, tenantId, userId, 'redemption.cancel', 'redemption', r.id);
}

export function getRedemption(ctx: Ctx, tenantId: string, id: string): RedemptionRow | undefined {
  return one<RedemptionRow>(ctx.db, 'SELECT * FROM redemptions WHERE tenant_id = ? AND id = ?', tenantId, id);
}

export type { CustomerRow };
