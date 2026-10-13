import { hashPin } from './auth.js';
import type { Ctx } from './context.js';
import { iso, newId } from './context.js';
import { one, run } from './db.js';
import { hashPhone, normalizeMxPhone } from './phone.js';
import { DEFAULT_PROGRAM } from './rules.js';
import { enroll } from './services/customers.js';
import { registerSale } from './services/sales.js';

export interface SeedResult {
  tenantId: string;
  stations: { centro: string; norte: string };
  users: { owner: string; manager: string; luis: string; marta: string };
}

/**
 * Datos de demostración: un grupo con dos estaciones, cuatro personas y dos clientes.
 * Los NIP y teléfonos son de ejemplo y no representan a nadie real.
 */
export function seedDemo(ctx: Ctx): SeedResult {
  const existing = one<{ id: string }>(ctx.db, `SELECT id FROM tenants WHERE id = 'demo'`);
  if (existing) {
    return {
      tenantId: 'demo',
      stations: { centro: 'st-centro', norte: 'st-norte' },
      users: { owner: 'u-owner', manager: 'u-manager', luis: 'u-luis', marta: 'u-marta' },
    };
  }
  const now = iso(ctx.now());
  run(ctx.db, 'INSERT INTO tenants (id, name, program_json, created_at) VALUES (?,?,?,?)', 'demo', 'Gasolineras Centro', JSON.stringify(DEFAULT_PROGRAM), now);
  run(ctx.db, 'INSERT INTO stations (id, tenant_id, code, name) VALUES (?,?,?,?)', 'st-centro', 'demo', 'EST-01', 'Estación Centro');
  run(ctx.db, 'INSERT INTO stations (id, tenant_id, code, name) VALUES (?,?,?,?)', 'st-norte', 'demo', 'EST-02', 'Estación Norte');

  const luisPhone = normalizeMxPhone('5512345678').e164;
  const users: Array<[string, string | null, string, string, string, string | null]> = [
    ['u-owner', null, 'Dueño del grupo', 'owner', '9999', null],
    ['u-manager', 'st-centro', 'Gerente Centro', 'manager', '1234', null],
    ['u-luis', 'st-centro', 'Luis (despachador)', 'attendant', '1111', hashPhone(luisPhone, ctx.salt)],
    ['u-marta', 'st-norte', 'Marta (despachadora)', 'attendant', '2222', null],
  ];
  for (const [id, station, name, role, pin, phoneHash] of users) {
    run(ctx.db, 'INSERT INTO users (id, tenant_id, station_id, name, role, pin_hash, phone_hash) VALUES (?,?,?,?,?,?,?)', id, 'demo', station, name, role, hashPin(pin, ctx.salt), phoneHash);
  }

  // Ana: verificada, con historial. Beto: sin verificar, tope de 200 puntos.
  enroll(ctx, 'demo', 'u-luis', 'st-centro', { phone: '55 4433 4317', firstName: 'Ana', marketingConsent: true, channel: 'whatsapp' });
  run(ctx.db, 'UPDATE customers SET verified_at = ? WHERE phone_hash = ?', now, hashPhone('+525544334317', ctx.salt));
  enroll(ctx, 'demo', 'u-marta', 'st-norte', { phone: '56 1112 2233', firstName: 'Beto', marketingConsent: false, channel: 'whatsapp' });

  const actorLuis = { userId: 'u-luis', tenantId: 'demo', stationId: 'st-centro', role: 'attendant' as const };
  const actorMarta = { userId: 'u-marta', tenantId: 'demo', stationId: 'st-norte', role: 'attendant' as const };
  const daysAgo = (d: number, h = 10) => { const x = new Date(ctx.now()); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const history: Array<[typeof actorLuis, string, number, string, number, number]> = [
    [actorLuis, 'T-118001', 40_000, 'regular', 2389, 0],
    [actorMarta, 'T-207310', 31_000, 'regular', 2389, 3500],
    [actorLuis, 'T-118120', 38_500, 'premium', 2599, 0],
    [actorLuis, 'T-118211', 35_200, 'regular', 2389, 5200],
    [actorLuis, 'T-118290', 42_000, 'regular', 2389, 0],
  ];
  history.forEach(([actor, ref, ml, fuel, price, store], i) => {
    registerSale(ctx, actor, `seed-ana-${ref}`, {
      phone: '5544334317', posReference: ref, pumpNumber: 4, fuelType: fuel as 'regular' | 'premium', litersMl: ml, pricePerLiterCents: price,
      storeCents: store, source: 'manual', dispensedAt: daysAgo(28 - i * 6),
    });
  });
  registerSale(ctx, actorMarta, 'seed-beto-1', { phone: '5611122233', posReference: 'T-207355', pumpNumber: 2, fuelType: 'regular', litersMl: 22_000, pricePerLiterCents: 2389, storeCents: 0, source: 'manual', dispensedAt: daysAgo(3, 9) });
  // Vehículos demo: un auto de Ana y la moto de Beto.
  const vehicleAt = (phone: string, plate: string, kind: 'auto' | 'moto') => run(ctx.db, 'INSERT INTO vehicles (id, customer_id, plate, kind, created_at) VALUES (?,?,?,?,?)', newId(), one<{ id: string }>(ctx.db, 'SELECT id FROM customers WHERE phone_e164 = ?', phone)!.id, plate, kind, now);
  vehicleAt('+525544334317', 'ABC-123-D', 'auto');
  vehicleAt('+525611122233', '4521B7', 'moto');

  return {
    tenantId: 'demo',
    stations: { centro: 'st-centro', norte: 'st-norte' },
    users: { owner: 'u-owner', manager: 'u-manager', luis: 'u-luis', marta: 'u-marta' },
  };
}
