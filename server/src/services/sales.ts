import { z } from 'zod';
import { plateKind, type VehicleKind } from '../plate.js';
import type { Ctx } from '../context.js';
import { audit, iso, loadProgram, newId } from '../context.js';
import { all, one, run, withTx } from '../db.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors.js';
import { computeEarn, pointsToCents, type FuelType } from '../rules.js';
import { findCustomerByPhone, findMembership, getMembership, isEmployeePhone, membershipSummary, type CustomerRow, type MembershipRow } from './customers.js';
import { expireStale, type RedemptionRow } from './redemptions.js';
import { cancelCardsForSale, issueCardForSale } from './scratch.js';
import { PAYMENT_METHODS, type SaleContext } from '../promo/types.js';
import * as promotions from './promotions.js';
import * as wallet from './wallet.js';
import { segmentsOf } from './segments.js';

export const saleSchema = z.object({
  // Teléfono (10 dígitos) o placa: las de moto y CDMX tienen 6 caracteres.
  phone: z.string().min(6),
  posReference: z.string().trim().min(1).max(40),
  pumpNumber: z.number().int().positive().optional(),
  fuelType: z.enum(['regular', 'premium', 'diesel']).optional(),
  litersMl: z.number().int().nonnegative().default(0),
  pricePerLiterCents: z.number().int().nonnegative().default(0),
  storeCents: z.number().int().nonnegative().default(0),
  redemptionId: z.string().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('efectivo'),
  /** Dinero virtual que el cliente quiere usar en esta compra. */
  walletSpendCents: z.number().int().nonnegative().default(0),
  /** Etiquetas de artículos de tienda incluidos (cafe, lavado, aceite, agua…), para promociones condicionadas. */
  storeItems: z.array(z.string().trim().toLowerCase().min(1)).default([]),
  source: z.enum(['manual', 'pos']).default('manual'),
  /** Hora real del despacho (ISO). Sin conexión, la isla manda la hora original. */
  dispensedAt: z.string().datetime().optional(),
}).refine((s) => (s.fuelType ? s.litersMl > 0 && s.pricePerLiterCents > 0 : s.litersMl === 0), {
  message: 'Un despacho de combustible requiere tipo, litros y precio por litro.',
}).refine((s) => s.fuelType || s.storeCents > 0, { message: 'La venta debe incluir combustible o tienda.' });

export type SaleInput = z.infer<typeof saleSchema>;
export type SaleInputRaw = z.input<typeof saleSchema>;

export interface SaleRow {
  id: string; tenant_id: string; station_id: string; user_id: string; membership_id: string; pos_reference: string;
  pump_number: number | null; fuel_type: FuelType | null; liters_ml: number; price_per_liter_cents: number;
  fuel_cents: number; store_cents: number; reward_cents: number; returned_cents: number;
  fuel_points: number; store_points: number; total_points: number; stamp_awarded: number; stamps_before: number;
  source: 'manual' | 'pos'; status: 'confirmed' | 'void'; idempotency_key: string; dispensed_at: string; created_at: string;
}

export interface Actor { userId: string; tenantId: string; stationId: string; role: 'owner' | 'admin' | 'manager' | 'attendant' }

function dayBounds(at: Date): { from: string; to: string } {
  const start = new Date(at); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: iso(start), to: iso(end) };
}

function adjustBalance(ctx: Ctx, membershipId: string, delta: number): void {
  run(ctx.db, 'UPDATE memberships SET points_balance = points_balance + ? WHERE id = ?', delta, membershipId);
}

interface StationRow { id: string; state: string | null; city: string | null }

/**
 * Tipo de vehículo que carga: si llegó identificado por placa, el de esa placa; si fue por teléfono,
 * los de todos sus vehículos (no sabemos cuál trae, así que cualquiera de ellos califica).
 */
function vehicleKindsFor(ctx: Ctx, membershipId: string, ident: string): VehicleKind[] {
  if (/[A-Za-z]/.test(ident)) return [plateKind(ident)];
  const rows = all<{ kind: VehicleKind }>(ctx.db, 'SELECT DISTINCT v.kind FROM vehicles v JOIN memberships m ON m.customer_id = v.customer_id WHERE m.id = ?', membershipId);
  return rows.map((r) => r.kind);
}

/** Contexto de la compra para el motor de promociones, incluyendo la compra actual en los acumulados. */
function buildSaleContext(ctx: Ctx, tenantId: string, membershipId: string, stationId: string, data: SaleInput, fuelCents: number, at: Date): SaleContext {
  const station = one<StationRow>(ctx.db, 'SELECT id, state, city FROM stations WHERE id = ?', stationId);
  const { segments, stats } = segmentsOf(ctx, tenantId, membershipId, at);
  return {
    tenantId, membershipId, customerType: stats.customerType, vehicleKinds: vehicleKindsFor(ctx, membershipId, data.phone), segments, stationId, state: station?.state ?? null, city: station?.city ?? null,
    fuelType: data.fuelType ?? null, litersMl: data.litersMl, fuelCents, storeCents: data.storeCents, totalCents: fuelCents + data.storeCents,
    paymentMethod: data.paymentMethod, at,
    visitsThisMonth: stats.visitsThisMonth + 1, visitsThisWeek: stats.visitsThisWeek + 1,
    monthlyCents: stats.monthlyCents + fuelCents + data.storeCents, lifetimeCents: stats.lifetimeCents + fuelCents + data.storeCents,
    recentVisits: stats.recentVisits, avgTicketCents: stats.avgTicketCents, storeItems: data.storeItems,
  };
}

const saleAmounts = (fuelCents: number, storeCents: number, redemptionCents: number, discountCents: number) => ({
  totalCents: fuelCents + storeCents, fuelCents: Math.max(0, fuelCents - redemptionCents - discountCents), storeCents,
});

/**
 * Vista previa antes de cobrar: promociones que aplican, descuentos, puntos, dinero virtual
 * disponible y cuánto falta para el siguiente beneficio. No escribe nada.
 */
export function previewSale(ctx: Ctx, actor: Actor, input: unknown) {
  const data = saleSchema.parse(input);
  const cfg = loadProgram(ctx, actor.tenantId);
  const { customer, e164 } = findCustomerByPhone(ctx, data.phone);
  if (isEmployeePhone(ctx, actor.tenantId, e164)) throw forbidden('EMPLOYEE_BLOCKED', 'Los teléfonos de empleados del grupo no acumulan puntos.');
  const membership = customer ? findMembership(ctx, actor.tenantId, customer.id) : undefined;
  if (!customer || !membership) throw notFound('MEMBER_NOT_FOUND', 'Ese teléfono no participa en este programa. Regístralo primero.');
  const at = data.dispensedAt ? new Date(data.dispensedAt) : ctx.now();
  const fuelCents = Math.round((data.litersMl * data.pricePerLiterCents) / 1000);
  const redemption = data.redemptionId ? one<RedemptionRow>(ctx.db, 'SELECT * FROM redemptions WHERE tenant_id = ? AND id = ?', actor.tenantId, data.redemptionId) : undefined;
  const redemptionCents = redemption?.status === 'confirmed' ? redemption.value_cents : 0;
  const saleCtx = buildSaleContext(ctx, actor.tenantId, membership.id, actor.stationId, data, fuelCents, at);
  const provisional = computeEarn({ fuelType: data.fuelType ?? null, litersMl: data.litersMl, fuelCents, storeCents: data.storeCents, rewardCents: redemptionCents + data.walletSpendCents, dispensedAt: at }, cfg);
  const evaluation = promotions.evaluateForSale(ctx, actor.tenantId, saleCtx, provisional.totalPoints);
  const walletAvailable = wallet.availableCents(ctx, actor.tenantId, membership.id);
  const total = fuelCents + data.storeCents;
  const maxWallet = Math.max(0, Math.min(wallet.spendableCents(ctx, actor.tenantId, membership.id, saleAmounts(fuelCents, data.storeCents, redemptionCents, evaluation.totalDiscountCents)), total - redemptionCents - evaluation.totalDiscountCents));
  const walletSpend = Math.min(data.walletSpendCents, maxWallet);
  const earn = computeEarn({ fuelType: data.fuelType ?? null, litersMl: data.litersMl, fuelCents, storeCents: data.storeCents, rewardCents: redemptionCents + walletSpend + evaluation.totalDiscountCents, dispensedAt: at }, cfg);
  return {
    fuelCents, storeCents: data.storeCents, totalCents: total, redemptionCents,
    discountCents: evaluation.totalDiscountCents, walletAvailableCents: walletAvailable, walletSpendCents: walletSpend, maxWalletSpendCents: maxWallet,
    paidCents: Math.max(0, total - redemptionCents - evaluation.totalDiscountCents - walletSpend),
    basePoints: earn.totalPoints, promoPoints: evaluation.totalPoints, walletEarnCents: evaluation.totalWalletCents,
    promotions: evaluation, segments: saleCtx.segments, customerType: saleCtx.customerType,
  };
}

/**
 * Registra un despacho y, si viene un canje confirmado, lo aplica en la misma transacción.
 * Es idempotente por (grupo, clave): repetir la petición devuelve la misma respuesta.
 */
export function registerSale(ctx: Ctx, actor: Actor, idempotencyKey: string, input: SaleInputRaw) {
  if (!idempotencyKey) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Falta el encabezado Idempotency-Key.');
  const cached = one<{ response_json: string }>(ctx.db, 'SELECT response_json FROM idempotency WHERE tenant_id = ? AND key = ?', actor.tenantId, idempotencyKey);
  if (cached) return JSON.parse(cached.response_json);

  const data = saleSchema.parse(input);
  const cfg = loadProgram(ctx, actor.tenantId);
  const { customer, e164 } = findCustomerByPhone(ctx, data.phone);
  if (isEmployeePhone(ctx, actor.tenantId, e164)) throw forbidden('EMPLOYEE_BLOCKED', 'Los teléfonos de empleados del grupo no acumulan puntos.');
  if (!customer) throw notFound('MEMBER_NOT_FOUND', 'Ese teléfono no participa en este programa. Regístralo primero.');
  const membership = findMembership(ctx, actor.tenantId, customer.id);
  if (!membership) throw notFound('MEMBER_NOT_FOUND', 'Ese teléfono no participa en este programa. Regístralo primero.');

  const dispensedAt = data.dispensedAt ? new Date(data.dispensedAt) : ctx.now();
  if (dispensedAt.getTime() > ctx.now().getTime() + 5 * 60_000) throw unprocessable('DISPENSED_IN_FUTURE', 'La hora del despacho no puede ser futura.');
  const fuelCents = Math.round((data.litersMl * data.pricePerLiterCents) / 1000);

  return withTx(ctx.db, () => {
    expireStale(ctx, actor.tenantId);

    const dupe = one(ctx.db, 'SELECT 1 AS x FROM sales WHERE tenant_id = ? AND station_id = ? AND pos_reference = ?', actor.tenantId, actor.stationId, data.posReference);
    if (dupe) throw conflict('POS_REFERENCE_DUPLICATE', `El folio ${data.posReference} ya está registrado en esta estación.`);

    // Topes diarios por número: cargas y litros.
    const { from, to } = dayBounds(dispensedAt);
    const today = one<{ n: number; ml: number | null }>(ctx.db,
      `SELECT COUNT(*) AS n, SUM(liters_ml) AS ml FROM sales WHERE tenant_id = ? AND membership_id = ? AND status = 'confirmed' AND dispensed_at >= ? AND dispensed_at < ?`,
      actor.tenantId, membership.id, from, to);
    if (data.fuelType) {
      if ((today?.n ?? 0) >= cfg.maxSalesPerDay) throw unprocessable('DAILY_SALES_CAP', `Este número ya registró ${cfg.maxSalesPerDay} cargas hoy.`);
      if ((today?.ml ?? 0) + data.litersMl > cfg.maxLitersPerDayMl) {
        throw unprocessable('DAILY_LITERS_CAP', `Este número superaría el tope de ${cfg.maxLitersPerDayMl / 1000} litros por día.`);
      }
    }

    // Canje confirmado, si viene.
    let redemption: RedemptionRow | undefined;
    if (data.redemptionId) {
      redemption = one<RedemptionRow>(ctx.db, 'SELECT * FROM redemptions WHERE tenant_id = ? AND id = ?', actor.tenantId, data.redemptionId);
      if (!redemption || redemption.membership_id !== membership.id) throw notFound('REDEMPTION_NOT_FOUND', 'El canje no corresponde a este cliente.');
      if (redemption.status !== 'confirmed') throw unprocessable('REDEMPTION_NOT_CONFIRMED', `El canje está en estado ${redemption.status}; debe confirmarse con el código.`);
      if (redemption.value_cents > fuelCents + data.storeCents) throw unprocessable('REWARD_EXCEEDS_TOTAL', 'El canje no puede ser mayor que el total de la venta.');
    }
    const redemptionCents = redemption?.value_cents ?? 0;

    // Promociones: se evalúan con los puntos base provisionales (sin descuentos de promoción).
    const saleCtx = buildSaleContext(ctx, actor.tenantId, membership.id, actor.stationId, data, fuelCents, dispensedAt);
    const provisional = computeEarn({ fuelType: data.fuelType ?? null, litersMl: data.litersMl, fuelCents, storeCents: data.storeCents, rewardCents: redemptionCents + data.walletSpendCents, dispensedAt }, cfg);
    const evaluation = promotions.evaluateForSale(ctx, actor.tenantId, saleCtx, provisional.totalPoints);
    const discountCents = evaluation.totalDiscountCents;

    // Dinero virtual: no puede exceder lo que queda por pagar.
    const total = fuelCents + data.storeCents;
    if (data.walletSpendCents > 0) {
      const spendable = wallet.spendableCents(ctx, actor.tenantId, membership.id, saleAmounts(fuelCents, data.storeCents, redemptionCents, discountCents));
      if (data.walletSpendCents > spendable) throw unprocessable('WALLET_INSUFFICIENT', `Dinero virtual utilizable en esta compra: $${(spendable / 100).toFixed(2)} (revisa compra mínima y ámbito de los abonos).`);
      if (data.walletSpendCents > total - redemptionCents - discountCents) throw unprocessable('WALLET_EXCEEDS_TOTAL', 'El dinero virtual no puede exceder lo que queda por pagar.');
    }
    const rewardCents = redemptionCents + data.walletSpendCents + discountCents;

    const earn = computeEarn({ fuelType: data.fuelType ?? null, litersMl: data.litersMl, fuelCents, storeCents: data.storeCents, rewardCents, dispensedAt }, cfg);

    // Tope de puntos para teléfonos no verificados.
    let points = earn.totalPoints;
    let capped = false;
    if (!customer.verified_at) {
      const fresh = getMembership(ctx, actor.tenantId, membership.id);
      const room = Math.max(0, cfg.unverifiedPointsCap - fresh.points_balance);
      if (points > room) { points = room; capped = true; }
    }

    const now = iso(ctx.now());
    const saleId = newId();
    run(ctx.db,
      `INSERT INTO sales (id, tenant_id, station_id, user_id, membership_id, pos_reference, pump_number, fuel_type, liters_ml, price_per_liter_cents,
        fuel_cents, store_cents, reward_cents, fuel_points, store_points, total_points, stamp_awarded, stamps_before, source, status, idempotency_key, dispensed_at, created_at,
        payment_method, wallet_spent_cents, discount_cents, promos_json, store_items_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      saleId, actor.tenantId, actor.stationId, actor.userId, membership.id, data.posReference, data.pumpNumber ?? null, data.fuelType ?? null,
      data.litersMl, data.pricePerLiterCents, fuelCents, data.storeCents, redemptionCents, earn.fuelPoints, earn.storePoints, points,
      earn.stamp ? 1 : 0, membership.stamps, data.source, 'confirmed', idempotencyKey, iso(dispensedAt), now,
      data.paymentMethod, data.walletSpendCents, discountCents, JSON.stringify(evaluation.applied.map((a) => ({ id: a.promotionId, name: a.promotionName, description: a.description }))), JSON.stringify(data.storeItems));

    if (points > 0) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        newId(), actor.tenantId, membership.id, 'earn', points, saleId, actor.userId,
        `${earn.fuelPoints} pts combustible + ${earn.storePoints} pts tienda${earn.multiplier > 1 ? ` × ${earn.multiplier} (${earn.multiplierLabel})` : ''}${capped ? ' · limitado por teléfono sin verificar' : ''}`, now);
      adjustBalance(ctx, membership.id, points);
    }
    if (redemption) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        newId(), actor.tenantId, membership.id, 'redeem', -redemption.points, saleId, actor.userId, `Canje de $${(redemption.value_cents / 100).toFixed(2)}`, now);
      adjustBalance(ctx, membership.id, -redemption.points);
      run(ctx.db, `UPDATE redemptions SET status = 'applied', sale_id = ? WHERE id = ?`, saleId, redemption.id);
    }
    let stampsNow = membership.stamps;
    let stampRewardEarned = false;
    if (earn.stamp) {
      stampsNow = membership.stamps + 1;
      if (stampsNow >= cfg.stampsForReward) { stampsNow = 0; stampRewardEarned = true; }
      run(ctx.db, 'UPDATE memberships SET stamps = ? WHERE id = ?', stampsNow, membership.id);
    }
    run(ctx.db, 'UPDATE memberships SET last_purchase_at = ? WHERE id = ?', iso(dispensedAt), membership.id);
    // "Carga, Rasca y Gana": la tarjeta se gana por combustible pagado, sin contar lo cubierto con puntos.
    const scratchCard = issueCardForSale(ctx, cfg, actor.tenantId, membership.id, saleId, fuelCents - Math.min(rewardCents, fuelCents), dispensedAt);
    // Beneficios de promociones y pago con dinero virtual.
    const delivered = promotions.deliverBenefits(ctx, { tenantId: actor.tenantId, membershipId: membership.id, saleId, stationId: actor.stationId, actorUserId: actor.userId, evaluation, fuelCents, at: dispensedAt });
    if (data.walletSpendCents > 0) wallet.spend(ctx, { tenantId: actor.tenantId, membershipId: membership.id, amountCents: data.walletSpendCents, saleId, stationId: actor.stationId, amounts: saleAmounts(fuelCents, data.storeCents, redemptionCents, discountCents) });
    audit(ctx, actor.tenantId, actor.userId, 'sale.register', 'sale', saleId, { posReference: data.posReference, points, rewardCents, litersMl: data.litersMl, scratch: !!scratchCard });

    const fresh = getMembership(ctx, actor.tenantId, membership.id);
    const response = {
      saleId,
      posReference: data.posReference,
      fuelCents,
      storeCents: data.storeCents,
      rewardCents: redemptionCents,
      discountCents,
      walletSpentCents: data.walletSpendCents,
      paymentMethod: data.paymentMethod,
      paidCents: Math.max(0, fuelCents + data.storeCents - rewardCents),
      points: { fuel: earn.fuelPoints, store: earn.storePoints, multiplier: earn.multiplier, multiplierLabel: earn.multiplierLabel, total: points, capped, promo: evaluation.totalPoints },
      promotions: { applied: delivered, skipped: evaluation.skipped, hints: evaluation.hints, walletEarnCents: evaluation.totalWalletCents },
      wallet: { availableCents: wallet.availableCents(ctx, actor.tenantId, membership.id) },
      eligibleLitersMl: earn.eligibleLitersMl,
      stamp: { awarded: earn.stamp, stamps: stampsNow, stampsForReward: cfg.stampsForReward, rewardEarned: stampRewardEarned },
      scratch: scratchCard ? { cardId: scratchCard.id, expiresAt: scratchCard.expires_at } : null,
      member: membershipSummary(ctx, fresh, customer),
    };
    run(ctx.db, 'INSERT INTO idempotency (tenant_id, key, response_json, created_at) VALUES (?,?,?,?)', actor.tenantId, idempotencyKey, JSON.stringify(response), now);
    if (points > 0 || evaluation.applied.length) {
      const extras = delivered.map((d) => d.description).join(', ');
      ctx.notifier.send(e164, 'utility', `${membership.first_name}, ganaste ${points + evaluation.totalPoints} puntos${data.litersMl ? ` por ${(data.litersMl / 1000).toFixed(1)} L` : ''}${extras ? ` y ${extras}` : ''}. Tienes ${fresh.points_balance} puntos (≈ $${(pointsToCents(fresh.points_balance, cfg) / 100).toFixed(2)}).`);
    }
    if (stampRewardEarned) ctx.notifier.send(e164, 'utility', `¡Completaste ${cfg.stampsForReward} cargas! Tu recompensa por sellos te espera en la estación.`);
    if (scratchCard) ctx.notifier.send(e164, 'utility', `🎉 Tu carga de más de $${(cfg.scratch.minFuelCents / 100).toFixed(0)} te dio una tarjeta Rasca y Gana. Ráscala en tu portal antes del ${scratchCard.expires_at.slice(0, 10)}.`);
    return response;
  });
}

const VOID_WINDOW_MINUTES = 30;

/** Anula una venta con asientos compensatorios. Después de 30 minutos requiere gerente. */
export function voidSale(ctx: Ctx, actor: Actor, saleId: string, reason: string) {
  return withTx(ctx.db, () => {
    const sale = one<SaleRow>(ctx.db, 'SELECT * FROM sales WHERE tenant_id = ? AND id = ?', actor.tenantId, saleId);
    if (!sale) throw notFound('SALE_NOT_FOUND', 'No encontramos esa venta.');
    if (sale.status === 'void') throw unprocessable('ALREADY_VOID', 'La venta ya está anulada.');
    const ageMin = (ctx.now().getTime() - new Date(sale.created_at).getTime()) / 60_000;
    if (ageMin > VOID_WINDOW_MINUTES && actor.role === 'attendant') {
      throw forbidden('MANAGER_REQUIRED', `Pasaron más de ${VOID_WINDOW_MINUTES} minutos; la anulación requiere NIP de gerente.`);
    }
    const now = iso(ctx.now());
    const entries = all<{ id: string; kind: string; points_delta: number }>(ctx.db,
      `SELECT id, kind, points_delta FROM ledger_entries WHERE sale_id = ? AND kind IN ('earn','redeem','adjust')`, saleId);
    let delta = 0;
    for (const e of entries) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, reverses_entry_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        newId(), actor.tenantId, sale.membership_id, 'reverse', -e.points_delta, saleId, e.id, actor.userId, `Anulación: ${reason}`, now);
      delta -= e.points_delta;
    }
    adjustBalance(ctx, sale.membership_id, delta);
    // Regresa los sellos al estado previo a esta venta (válido mientras sea la última carga con sello).
    if (sale.stamp_awarded) run(ctx.db, 'UPDATE memberships SET stamps = ? WHERE id = ?', sale.stamps_before, sale.membership_id);
    run(ctx.db, `UPDATE sales SET status = 'void' WHERE id = ?`, saleId);
    cancelCardsForSale(ctx, saleId);
    promotions.reverseForSale(ctx, actor.tenantId, saleId);
    wallet.reverseForSale(ctx, actor.tenantId, saleId, actor.userId);
    audit(ctx, actor.tenantId, actor.userId, 'sale.void', 'sale', saleId, { reason, delta });
    const m = getMembership(ctx, actor.tenantId, sale.membership_id);
    return { saleId, status: 'void' as const, pointsDelta: delta, balance: m.points_balance };
  });
}

/** Devolución parcial de tienda. El combustible no se devuelve. */
export function returnStore(ctx: Ctx, actor: Actor, saleId: string, amountCents: number, reason: string) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw badRequest('AMOUNT_INVALID', 'El importe debe ser un entero de centavos mayor que cero.');
  return withTx(ctx.db, () => {
    const sale = one<SaleRow>(ctx.db, 'SELECT * FROM sales WHERE tenant_id = ? AND id = ?', actor.tenantId, saleId);
    if (!sale) throw notFound('SALE_NOT_FOUND', 'No encontramos esa venta.');
    if (sale.status !== 'confirmed') throw unprocessable('SALE_NOT_CONFIRMED', 'Solo se devuelven ventas confirmadas.');
    const returnable = sale.store_cents - sale.returned_cents;
    if (amountCents > returnable) throw unprocessable('RETURN_EXCEEDS', `Solo quedan $${(returnable / 100).toFixed(2)} por devolver en tienda.`);
    const cfg = loadProgram(ctx, actor.tenantId);
    const pointsToRemove = sale.store_cents > 0 ? Math.floor((sale.store_points * amountCents) / sale.store_cents) : 0;
    const m = getMembership(ctx, actor.tenantId, sale.membership_id);
    const newBalance = m.points_balance - pointsToRemove;
    if (newBalance < cfg.minNegativeBalance) {
      throw unprocessable('NEGATIVE_LIMIT', `El saldo quedaría en ${newBalance}; el mínimo permitido es ${cfg.minNegativeBalance}.`);
    }
    const now = iso(ctx.now());
    if (pointsToRemove > 0) {
      run(ctx.db, 'INSERT INTO ledger_entries (id, tenant_id, membership_id, kind, points_delta, sale_id, actor_user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        newId(), actor.tenantId, sale.membership_id, 'adjust', -pointsToRemove, saleId, actor.userId, `Devolución de $${(amountCents / 100).toFixed(2)} en tienda: ${reason}`, now);
      adjustBalance(ctx, sale.membership_id, -pointsToRemove);
    }
    run(ctx.db, 'UPDATE sales SET returned_cents = returned_cents + ? WHERE id = ?', amountCents, saleId);
    audit(ctx, actor.tenantId, actor.userId, 'sale.return', 'sale', saleId, { amountCents, pointsToRemove });
    return { saleId, returnedCents: sale.returned_cents + amountCents, pointsDelta: -pointsToRemove, balance: newBalance };
  });
}

export function getSale(ctx: Ctx, tenantId: string, saleId: string): SaleRow | undefined {
  return one<SaleRow>(ctx.db, 'SELECT * FROM sales WHERE tenant_id = ? AND id = ?', tenantId, saleId);
}

export type { CustomerRow, MembershipRow };
