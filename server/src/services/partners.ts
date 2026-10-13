import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { audit, iso, newId } from '../context.js';
import { all, one, run } from '../db.js';
import { notFound, unprocessable } from '../errors.js';

export const PARTNER_TYPES = ['cafeteria', 'restaurante', 'lavado', 'taller', 'refaccionaria', 'supermercado', 'banco', 'aseguradora', 'movilidad', 'comercio_local'] as const;
export const PARTNER_TYPE_LABELS: Record<typeof PARTNER_TYPES[number], string> = {
  cafeteria: 'Cafetería', restaurante: 'Restaurante', lavado: 'Lavado de autos', taller: 'Taller', refaccionaria: 'Refaccionaria',
  supermercado: 'Supermercado', banco: 'Banco', aseguradora: 'Aseguradora', movilidad: 'Empresa de movilidad', comercio_local: 'Comercio local',
};

export const partnerSchema = z.object({ name: z.string().trim().min(1), type: z.enum(PARTNER_TYPES), contact: z.string().default(''), active: z.boolean().default(true) });
export const benefitSchema = z.object({
  name: z.string().trim().min(1), description: z.string().default(''), valueCents: z.number().int().nonnegative().default(0),
  codePrefix: z.string().trim().min(1).max(6).default('AL'), inventoryInitial: z.number().int().positive().nullable().default(null),
  validFrom: z.string().nullable().default(null), validUntil: z.string().nullable().default(null), stationIds: z.array(z.string()).default([]),
});

export interface PartnerRow { id: string; tenant_id: string; name: string; type: string; contact: string; active: number; created_at: string }
export interface PartnerBenefitRow {
  id: string; tenant_id: string; partner_id: string; name: string; description: string; value_cents: number; code_prefix: string;
  inventory_initial: number | null; inventory_used: number; valid_from: string | null; valid_until: string | null; stations_json: string; created_at: string;
}

export function inventoryView(initial: number | null, used: number, exhaustedAt: string | null = null) {
  if (initial === null) return { initial: null, used, remaining: null, percentUsed: null, exhaustedAt: null, exhausted: false };
  const remaining = Math.max(0, initial - used);
  return { initial, used, remaining, percentUsed: initial ? Math.round((used / initial) * 1000) / 10 : 0, exhaustedAt, exhausted: remaining === 0 };
}

export function listPartners(ctx: Ctx, tenantId: string) {
  const partners = all<PartnerRow>(ctx.db, 'SELECT * FROM partners WHERE tenant_id = ? ORDER BY name', tenantId);
  return partners.map((p) => ({ ...toPartner(p), benefits: listBenefits(ctx, tenantId, p.id) }));
}

const toPartner = (p: PartnerRow) => ({ id: p.id, name: p.name, type: p.type, typeLabel: PARTNER_TYPE_LABELS[p.type as keyof typeof PARTNER_TYPE_LABELS] ?? p.type, contact: p.contact, active: !!p.active, createdAt: p.created_at });

export function listBenefits(ctx: Ctx, tenantId: string, partnerId: string) {
  return all<PartnerBenefitRow>(ctx.db, 'SELECT * FROM partner_benefits WHERE tenant_id = ? AND partner_id = ? ORDER BY created_at', tenantId, partnerId).map(toBenefit);
}

export function toBenefit(b: PartnerBenefitRow) {
  return {
    id: b.id, partnerId: b.partner_id, name: b.name, description: b.description, valueCents: b.value_cents, codePrefix: b.code_prefix,
    validFrom: b.valid_from, validUntil: b.valid_until, stationIds: JSON.parse(b.stations_json) as string[],
    inventory: inventoryView(b.inventory_initial, b.inventory_used),
    usesCount: b.inventory_used,
  };
}

export function createPartner(ctx: Ctx, tenantId: string, actorUserId: string | null, input: unknown) {
  const d = partnerSchema.parse(input);
  const id = newId();
  run(ctx.db, 'INSERT INTO partners (id, tenant_id, name, type, contact, active, created_at) VALUES (?,?,?,?,?,?,?)', id, tenantId, d.name, d.type, d.contact, d.active ? 1 : 0, iso(ctx.now()));
  audit(ctx, tenantId, actorUserId, 'partner.create', 'partner', id);
  return toPartner(one<PartnerRow>(ctx.db, 'SELECT * FROM partners WHERE id = ?', id)!);
}

export function createBenefit(ctx: Ctx, tenantId: string, actorUserId: string | null, partnerId: string, input: unknown) {
  const partner = one<PartnerRow>(ctx.db, 'SELECT * FROM partners WHERE tenant_id = ? AND id = ?', tenantId, partnerId);
  if (!partner) throw notFound('PARTNER_NOT_FOUND', 'No encontramos ese asociado.');
  const d = benefitSchema.parse(input);
  const id = newId();
  run(ctx.db, 'INSERT INTO partner_benefits (id, tenant_id, partner_id, name, description, value_cents, code_prefix, inventory_initial, inventory_used, valid_from, valid_until, stations_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, tenantId, partnerId, d.name, d.description, d.valueCents, d.codePrefix.toUpperCase(), d.inventoryInitial, 0, d.validFrom, d.validUntil, JSON.stringify(d.stationIds), iso(ctx.now()));
  audit(ctx, tenantId, actorUserId, 'partner.benefit.create', 'partner_benefit', id);
  return toBenefit(one<PartnerBenefitRow>(ctx.db, 'SELECT * FROM partner_benefits WHERE id = ?', id)!);
}

export function couponCode(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(0, alphabet.length)];
  return `${prefix}-${s}`;
}

/**
 * Emite un cupón de asociado para un cliente descontando existencias. Se usa desde el motor de
 * promociones (beneficio partner_coupon) dentro de la transacción de la venta.
 */
export function issuePartnerCoupon(ctx: Ctx, tenantId: string, benefitId: string, membershipId: string, saleId: string | null, promotionId: string | null, days: number) {
  const b = one<PartnerBenefitRow>(ctx.db, 'SELECT * FROM partner_benefits WHERE tenant_id = ? AND id = ?', tenantId, benefitId);
  if (!b) throw notFound('PARTNER_BENEFIT_NOT_FOUND', 'El beneficio del asociado no existe.');
  if (b.inventory_initial !== null && b.inventory_used >= b.inventory_initial) throw unprocessable('PARTNER_BENEFIT_EXHAUSTED', 'El beneficio del asociado se agotó.');
  const now = ctx.now();
  const id = newId();
  const code = couponCode(b.code_prefix);
  run(ctx.db, 'INSERT INTO coupons (id, tenant_id, membership_id, code, kind, value_cents, status, valid_from, valid_until, max_uses, uses, label, promotion_id, partner_benefit_id, sale_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, tenantId, membershipId, code, 'partner', b.value_cents, 'issued', iso(now), iso(new Date(now.getTime() + days * 86_400_000)), 1, 0, b.name, promotionId, benefitId, saleId);
  run(ctx.db, 'UPDATE partner_benefits SET inventory_used = inventory_used + 1 WHERE id = ?', b.id);
  return { couponId: id, code, label: b.name, valueCents: b.value_cents, partnerId: b.partner_id };
}
