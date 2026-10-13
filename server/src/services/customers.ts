import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { audit, iso, loadProgram, newId } from '../context.js';
import { all, one, run, withTx } from '../db.js';
import { badRequest, conflict, forbidden, notFound, tooMany, unprocessable } from '../errors.js';
import { hashPhone, maskPhone, normalizeMxPhone } from '../phone.js';
import { normalizePlate, plateKind, VEHICLE_KIND_LABELS, type VehicleKind } from '../plate.js';
import { pointsToCents } from '../rules.js';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, SEGMENT_LABELS } from '../promo/types.js';
import { cardsForMembership, pendingCount } from './scratch.js';
import * as promotions from './promotions.js';
import * as wallet from './wallet.js';
import { segmentsOf } from './segments.js';
import { forMember as notificationsFor } from './notifications.js';

export interface CustomerRow { id: string; phone_e164: string; phone_hash: string; verified_at: string | null }
export interface MembershipRow {
  id: string; tenant_id: string; customer_id: string; first_name: string;
  points_balance: number; stamps: number; last_purchase_at: string | null; created_at: string;
  customer_type: string; birthday: string | null; home_station_id: string | null;
}

export const hashCode = (code: string, salt: string) => createHash('sha256').update(`${salt}:${code}`).digest('hex');
export const codeMatches = (code: string, hash: string, salt: string) => {
  const a = Buffer.from(hashCode(code, salt));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Identifica al cliente por teléfono o, si el texto trae letras, por la placa de uno de sus vehículos. */
export function findCustomerByPhone(ctx: Ctx, phoneInput: string): { customer: CustomerRow | undefined; e164: string } {
  if (/[A-Za-z]/.test(phoneInput ?? '')) return findCustomerByPlate(ctx, phoneInput);
  const { e164 } = normalizeMxPhone(phoneInput);
  const customer = one<CustomerRow>(ctx.db, 'SELECT * FROM customers WHERE phone_hash = ?', hashPhone(e164, ctx.salt));
  return { customer, e164 };
}

export function findCustomerByPlate(ctx: Ctx, plateInput: string): { customer: CustomerRow | undefined; e164: string } {
  const plate = normalizePlate(plateInput);
  const customer = one<CustomerRow>(ctx.db, 'SELECT c.* FROM vehicles v JOIN customers c ON c.id = v.customer_id WHERE v.plate = ?', plate);
  return { customer, e164: customer?.phone_e164 ?? '' };
}

export interface VehicleRow { id: string; plate: string; kind: VehicleKind; kindLabel: string; created_at: string }
const withLabel = (v: Omit<VehicleRow, 'kindLabel'>): VehicleRow => ({ ...v, kindLabel: VEHICLE_KIND_LABELS[v.kind] ?? v.kind });
export const MAX_VEHICLES = 5;

export function listVehicles(ctx: Ctx, customerId: string): VehicleRow[] {
  return all<Omit<VehicleRow, 'kindLabel'>>(ctx.db, 'SELECT id, plate, kind, created_at FROM vehicles WHERE customer_id = ? ORDER BY created_at', customerId).map(withLabel);
}

/** Agrega un vehículo. El tipo (auto o moto) se deduce del formato de la placa. */
export function addVehicle(ctx: Ctx, customer: CustomerRow, plateInput: string): VehicleRow {
  const plate = normalizePlate(plateInput);
  const kind = plateKind(plate);
  const existing = one<{ customer_id: string }>(ctx.db, 'SELECT customer_id FROM vehicles WHERE plate = ?', plate);
  if (existing?.customer_id === customer.id) throw conflict('PLATE_ALREADY_YOURS', 'Esa placa ya está en tu cuenta.');
  if (existing) throw conflict('PLATE_TAKEN', 'Esa placa ya está registrada con otro número.');
  if (listVehicles(ctx, customer.id).length >= MAX_VEHICLES) throw unprocessable('VEHICLE_LIMIT', `Puedes registrar hasta ${MAX_VEHICLES} vehículos.`);
  const row = withLabel({ id: newId(), plate, kind, created_at: iso(ctx.now()) });
  run(ctx.db, 'INSERT INTO vehicles (id, customer_id, plate, kind, created_at) VALUES (?,?,?,?,?)', row.id, customer.id, plate, kind, row.created_at);
  audit(ctx, 'platform', null, 'vehicle.added', 'customer', customer.id);
  return row;
}

export function removeVehicle(ctx: Ctx, customer: CustomerRow, vehicleId: string): void {
  const v = one<{ id: string }>(ctx.db, 'SELECT id FROM vehicles WHERE id = ? AND customer_id = ?', vehicleId, customer.id);
  if (!v) throw notFound('VEHICLE_NOT_FOUND', 'Vehículo no encontrado.');
  run(ctx.db, 'DELETE FROM vehicles WHERE id = ?', vehicleId);
  audit(ctx, 'platform', null, 'vehicle.removed', 'customer', customer.id);
}

export function findMembership(ctx: Ctx, tenantId: string, customerId: string): MembershipRow | undefined {
  return one<MembershipRow>(ctx.db, 'SELECT * FROM memberships WHERE tenant_id = ? AND customer_id = ?', tenantId, customerId);
}

export function getMembership(ctx: Ctx, tenantId: string, membershipId: string): MembershipRow {
  const m = one<MembershipRow>(ctx.db, 'SELECT * FROM memberships WHERE tenant_id = ? AND id = ?', tenantId, membershipId);
  if (!m) throw notFound('MEMBER_NOT_FOUND', 'No encontramos esa membresía en este grupo.');
  return m;
}

/** Puntos apartados por canjes pendientes o confirmados que aún no se aplican. */
export function heldPoints(ctx: Ctx, tenantId: string, membershipId: string): number {
  const row = one<{ held: number | null }>(
    ctx.db,
    `SELECT SUM(points) AS held FROM redemptions
     WHERE tenant_id = ? AND membership_id = ? AND status IN ('pending','confirmed') AND expires_at > ?`,
    tenantId, membershipId, iso(ctx.now()),
  );
  return row?.held ?? 0;
}

export function membershipSummary(ctx: Ctx, m: MembershipRow, customer: CustomerRow) {
  const cfg = loadProgram(ctx, m.tenant_id);
  const held = heldPoints(ctx, m.tenant_id, m.id);
  const available = m.points_balance - held;
  const nextRewardPoints = Math.max(0, cfg.redemption.minPoints - available);
  return {
    membershipId: m.id,
    firstName: m.first_name,
    maskedPhone: maskPhone(customer.phone_e164),
    verified: !!customer.verified_at,
    points: m.points_balance,
    heldPoints: held,
    availablePoints: available,
    valueCents: pointsToCents(m.points_balance, cfg),
    stamps: m.stamps,
    stampsForReward: cfg.stampsForReward,
    canRedeem: !!customer.verified_at && available >= cfg.redemption.minPoints,
    redemption: { minPoints: cfg.redemption.minPoints, stepPoints: cfg.redemption.stepPoints, pointValueCents: cfg.pointValueCents },
    nextReward: nextRewardPoints > 0 ? { pointsMissing: nextRewardPoints } : null,
    lastPurchaseAt: m.last_purchase_at,
    scratchPending: pendingCount(ctx, m.id),
    customerType: m.customer_type,
    customerTypeLabel: CUSTOMER_TYPE_LABELS[m.customer_type as keyof typeof CUSTOMER_TYPE_LABELS] ?? m.customer_type,
    walletAvailableCents: wallet.availableCents(ctx, m.tenant_id, m.id),
    segments: segmentsOf(ctx, m.tenant_id, m.id).segments,
  };
}

// ---- Consulta en isla con límite por persona ------------------------------------------

const lookupWindow = new Map<string, number[]>();
export const LOOKUPS_PER_HOUR = 60;

export function resetLookupLimits(): void {
  lookupWindow.clear();
}

function checkLookupRate(ctx: Ctx, userId: string): void {
  const now = ctx.now().getTime();
  const recent = (lookupWindow.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LOOKUPS_PER_HOUR) {
    audit(ctx, 'platform', userId, 'lookup.rate_limited', 'user', userId);
    throw tooMany('LOOKUP_RATE_LIMITED', 'Demasiadas consultas en una hora. Avisa a tu gerente si necesitas más.');
  }
  recent.push(now);
  lookupWindow.set(userId, recent);
}

/**
 * Identifica una membresía por teléfono dentro del grupo. La respuesta para "no existe" y para
 * "existe pero en otro grupo" es idéntica, para no filtrar información entre grupos.
 */
export function lookup(ctx: Ctx, tenantId: string, userId: string, phoneInput: string) {
  checkLookupRate(ctx, userId);
  // Si trae letras es una placa; si no, un teléfono.
  const { customer, e164 } = findCustomerByPhone(ctx, phoneInput);
  const blocked = isEmployeePhone(ctx, tenantId, e164);
  if (blocked) return { found: false as const, blocked: true as const };
  if (!customer) return { found: false as const, blocked: false as const };
  const m = findMembership(ctx, tenantId, customer.id);
  if (!m) return { found: false as const, blocked: false as const };
  const coupons = promotions.couponsFor(ctx, tenantId, m.id).filter((c) => c.status === 'issued');
  return { found: true as const, blocked: false as const, member: membershipSummary(ctx, m, customer), coupons, vehicles: listVehicles(ctx, customer.id) };
}

export function isEmployeePhone(ctx: Ctx, tenantId: string, e164: string): boolean {
  const row = one(ctx.db, 'SELECT 1 AS x FROM users WHERE tenant_id = ? AND phone_hash = ? AND active = 1', tenantId, hashPhone(e164, ctx.salt));
  return !!row;
}

// ---- Alta breve ------------------------------------------------------------------------

export const enrollSchema = z.object({
  phone: z.string().min(10),
  firstName: z.string().trim().min(1).max(40),
  marketingConsent: z.boolean().default(false),
  channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
  customerType: z.enum(CUSTOMER_TYPES).default('particular'),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Placa con la que llegó el cliente: queda asociada a su número al registrarlo. */
  plate: z.string().trim().max(12).optional(),
});

export function enroll(ctx: Ctx, tenantId: string, userId: string | null, stationId: string | null, input: z.input<typeof enrollSchema>) {
  const data = enrollSchema.parse(input);
  const { e164 } = normalizeMxPhone(data.phone);
  if (isEmployeePhone(ctx, tenantId, e164)) {
    throw forbidden('EMPLOYEE_BLOCKED', 'Los teléfonos de empleados del grupo no pueden participar en el programa.');
  }
  const now = iso(ctx.now());
  return withTx(ctx.db, () => {
    let customer = one<CustomerRow>(ctx.db, 'SELECT * FROM customers WHERE phone_hash = ?', hashPhone(e164, ctx.salt));
    if (!customer) {
      const id = newId();
      run(ctx.db, 'INSERT INTO customers (id, phone_e164, phone_hash, verified_at, created_at) VALUES (?,?,?,?,?)', id, e164, hashPhone(e164, ctx.salt), null, now);
      customer = one<CustomerRow>(ctx.db, 'SELECT * FROM customers WHERE id = ?', id)!;
    }
    if (findMembership(ctx, tenantId, customer.id)) {
      throw conflict('ALREADY_MEMBER', 'Ese teléfono ya participa en este programa.');
    }
    const membershipId = newId();
    run(ctx.db, 'INSERT INTO memberships (id, tenant_id, customer_id, first_name, created_at, customer_type, birthday, home_station_id) VALUES (?,?,?,?,?,?,?,?)',
      membershipId, tenantId, customer.id, data.firstName, now, data.customerType, data.birthday ?? null, stationId);
    const evidence = JSON.stringify({ userId, stationId, at: now, source: userId ? 'isla' : 'portal' });
    run(ctx.db, 'INSERT INTO consents (id, tenant_id, membership_id, purpose, channel, granted, evidence, created_at) VALUES (?,?,?,?,?,?,?,?)',
      newId(), tenantId, membershipId, 'program', data.channel, 1, evidence, now);
    run(ctx.db, 'INSERT INTO consents (id, tenant_id, membership_id, purpose, channel, granted, evidence, created_at) VALUES (?,?,?,?,?,?,?,?)',
      newId(), tenantId, membershipId, 'marketing', data.channel, data.marketingConsent ? 1 : 0, evidence, now);
    audit(ctx, tenantId, userId, 'membership.enroll', 'membership', membershipId, { marketing: data.marketingConsent });
    if (data.plate) {
      // Si la placa ya es suya no pasa nada; si es de otro número, se cancela todo el alta.
      const owned = listVehicles(ctx, customer.id).some((v) => v.plate === normalizePlate(data.plate!));
      if (!owned) addVehicle(ctx, customer, data.plate);
    }
    const m = getMembership(ctx, tenantId, membershipId);
    return membershipSummary(ctx, m, customer);
  });
}

// ---- Verificación de posesión del teléfono ----------------------------------------------

const OTP_MINUTES = 3;
const OTP_MAX_ATTEMPTS = 3;
const OTP_PER_15_MIN = 3;

export function startOtp(ctx: Ctx, phoneInput: string, purpose: 'verify' | 'portal'): { challengeId: string; expiresAt: string; devCode?: string } {
  if (purpose === 'portal' && /[A-Za-z]/.test(phoneInput)) throw badRequest('PHONE_INVALID', 'El teléfono debe tener 10 dígitos (por ejemplo 55 4433 4317).');
  const { customer, e164 } = findCustomerByPhone(ctx, phoneInput);
  if (!customer) throw notFound('CUSTOMER_NOT_FOUND', 'Ese teléfono no está registrado en ningún programa.');
  const now = ctx.now();
  const since = iso(new Date(now.getTime() - 15 * 60_000));
  const recent = one<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM otp_challenges WHERE customer_id = ? AND created_at > ?', customer.id, since);
  if ((recent?.n ?? 0) >= OTP_PER_15_MIN) throw tooMany('OTP_RATE_LIMITED', 'Ya enviamos varios códigos. Espera 15 minutos e inténtalo de nuevo.');
  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  const id = newId();
  const expiresAt = iso(new Date(now.getTime() + OTP_MINUTES * 60_000));
  run(ctx.db, 'INSERT INTO otp_challenges (id, customer_id, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)', id, customer.id, purpose, hashCode(code, ctx.salt), expiresAt, iso(now));
  const text = purpose === 'verify'
    ? `Tu código para confirmar tu teléfono es ${code}. Vence en ${OTP_MINUTES} minutos. No lo compartas.`
    : `Tu código para entrar a tu portal de puntos es ${code}. Vence en ${OTP_MINUTES} minutos.`;
  ctx.notifier.send(e164, 'auth', text);
  return { challengeId: id, expiresAt, ...(ctx.devMode ? { devCode: code } : {}) };
}

interface OtpRow { id: string; customer_id: string; purpose: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null }

export function confirmOtp(ctx: Ctx, challengeId: string, code: string): { customerId: string; purpose: 'verify' | 'portal'; portalToken?: string } {
  const row = one<OtpRow>(ctx.db, 'SELECT * FROM otp_challenges WHERE id = ?', challengeId);
  if (!row || row.consumed_at) throw notFound('OTP_NOT_FOUND', 'Ese código ya no es válido. Pide uno nuevo.');
  const now = ctx.now();
  if (row.expires_at <= iso(now)) throw unprocessable('OTP_EXPIRED', 'El código venció. Pide uno nuevo.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw unprocessable('OTP_LOCKED', 'Demasiados intentos. Pide un código nuevo.');
  if (!codeMatches(code, row.code_hash, ctx.salt)) {
    run(ctx.db, 'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', row.id);
    throw unprocessable('OTP_WRONG', 'El código no coincide.');
  }
  return withTx(ctx.db, () => {
    run(ctx.db, 'UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', iso(now), row.id);
    if (row.purpose === 'verify') {
      run(ctx.db, 'UPDATE customers SET verified_at = COALESCE(verified_at, ?) WHERE id = ?', iso(now), row.customer_id);
      return { customerId: row.customer_id, purpose: 'verify' as const };
    }
    run(ctx.db, 'UPDATE customers SET verified_at = COALESCE(verified_at, ?) WHERE id = ?', iso(now), row.customer_id);
    const token = randomBytes(24).toString('hex');
    const expiresAt = iso(new Date(now.getTime() + 30 * 24 * 3_600_000));
    run(ctx.db, 'INSERT INTO portal_sessions (token, customer_id, expires_at) VALUES (?,?,?)', token, row.customer_id, expiresAt);
    return { customerId: row.customer_id, purpose: 'portal' as const, portalToken: token };
  });
}

export function customerFromPortalToken(ctx: Ctx, token: string): CustomerRow | undefined {
  const s = one<{ customer_id: string; expires_at: string }>(ctx.db, 'SELECT * FROM portal_sessions WHERE token = ?', token);
  if (!s || s.expires_at <= iso(ctx.now())) return undefined;
  return one<CustomerRow>(ctx.db, 'SELECT * FROM customers WHERE id = ?', s.customer_id);
}

/** Vista del portal: todas las membresías del cliente, cada una con su propio grupo. */
export function portalView(ctx: Ctx, customer: CustomerRow) {
  const memberships = all<MembershipRow & { tenant_name: string }>(
    ctx.db,
    'SELECT m.*, t.name AS tenant_name FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.customer_id = ? ORDER BY m.created_at',
    customer.id,
  );
  return {
    phone: maskPhone(customer.phone_e164),
    verified: !!customer.verified_at,
    vehicles: listVehicles(ctx, customer.id),
    memberships: memberships.map((m) => {
      const summary = membershipSummary(ctx, m, customer);
      const entries = all(
        ctx.db,
        `SELECT l.kind, l.points_delta, l.note, l.created_at, s.pos_reference, s.fuel_type, s.liters_ml, s.store_cents, st.name AS station
         FROM ledger_entries l LEFT JOIN sales s ON s.id = l.sale_id LEFT JOIN stations st ON st.id = s.station_id
         WHERE l.membership_id = ? ORDER BY l.created_at DESC LIMIT 30`,
        m.id,
      );
      const consents = all(ctx.db, 'SELECT purpose, channel, granted, created_at FROM consents WHERE membership_id = ? ORDER BY created_at', m.id);
      const { segments, stats } = segmentsOf(ctx, m.tenant_id, m.id);
      const homeStation = m.home_station_id ? one<{ name: string; city: string | null }>(ctx.db, 'SELECT name, city FROM stations WHERE id = ?', m.home_station_id) : undefined;
      return {
        tenantName: m.tenant_name, ...summary, entries, consents,
        scratchCards: cardsForMembership(ctx, m.id),
        wallet: wallet.summary(ctx, m.tenant_id, m.id),
        coupons: promotions.couponsFor(ctx, m.tenant_id, m.id),
        promotions: promotions.availableForMember(ctx, m.tenant_id, m.id, segments, { ...stats, vehicleKinds: listVehicles(ctx, customer.id).map((v) => v.kind), avgTicketCents: stats.avgTicketCents, recentVisits: stats.recentVisits, visits30: stats.visits30 }),
        segmentLabels: segments.map((s) => SEGMENT_LABELS[s]),
        homeStation: homeStation ? `${homeStation.name}${homeStation.city ? ` · ${homeStation.city}` : ''}` : null,
        stats: { visitsThisMonth: stats.visitsThisMonth, monthlyCents: stats.monthlyCents, visits30: stats.visits30, avgTicketCents: stats.avgTicketCents },
        notifications: notificationsFor(ctx, m.tenant_id, m.id),
      };
    }),
  };
}

export function setMarketingConsent(ctx: Ctx, customer: CustomerRow, membershipId: string, granted: boolean, channel: string): void {
  const m = one<MembershipRow>(ctx.db, 'SELECT * FROM memberships WHERE id = ? AND customer_id = ?', membershipId, customer.id);
  if (!m) throw notFound('MEMBER_NOT_FOUND', 'Membresía no encontrada.');
  const now = iso(ctx.now());
  run(ctx.db, 'INSERT INTO consents (id, tenant_id, membership_id, purpose, channel, granted, evidence, created_at) VALUES (?,?,?,?,?,?,?,?)',
    newId(), m.tenant_id, m.id, 'marketing', channel, granted ? 1 : 0, JSON.stringify({ source: 'portal', at: now }), now);
  audit(ctx, m.tenant_id, null, granted ? 'consent.marketing.granted' : 'consent.marketing.revoked', 'membership', m.id);
}
