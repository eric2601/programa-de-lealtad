import { hashPin } from '../auth.js';
import { VEHICLE_PROMOS } from './vehiclePromos.js';
import type { Ctx } from '../context.js';
import { iso, newId } from '../context.js';
import { all, one, run } from '../db.js';
import { hashPhone } from '../phone.js';
import type { Benefit, PromoRules } from '../promo/types.js';
import { enroll } from '../services/customers.js';
import { run_ as runNotifications } from '../services/notifications.js';
import { createBenefit, createPartner } from '../services/partners.js';
import { createCampaign, createPromotion } from '../services/promotions.js';
import { create as createResearch } from '../services/research.js';
import { registerSale } from '../services/sales.js';
import { revealCard, type ScratchCardRow } from '../services/scratch.js';

/**
 * Datos de demostración realistas para México: un grupo gasolinero del Bajío con seis
 * estaciones, 240 clientes de distintos tipos, 100 días de cargas generadas con un generador
 * determinista y varias campañas activas, terminadas y programadas. Todo pasa por los mismos
 * servicios que usa la operación real, así los usos, el dinero virtual y las existencias son
 * consistentes con el libro de puntos.
 */
export function seedRich(ctx: Ctx): { customers: number; sales: number } | null {
  const meta = one<{ meta_json: string }>(ctx.db, `SELECT meta_json FROM tenants WHERE id = 'demo'`);
  if (!meta || (JSON.parse(meta.meta_json) as { rich?: boolean }).rich) return null;
  const rnd = mulberry32(20260911);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const now = ctx.now();
  const at = (d: Date) => ({ ...ctx, now: () => d }) as Ctx;
  const daysAgo = (n: number, h = 10, m = 0) => { const x = new Date(now); x.setDate(x.getDate() - n); x.setHours(h, m, 0, 0); return x; };
  const dayOf = (d: Date, h: number, m: number) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

  // ---- Grupo y estaciones ----
  run(ctx.db, `UPDATE tenants SET name = 'Gasolineras del Bajío' WHERE id = 'demo'`);
  const stations: Array<[id: string, code: string, name: string, state: string, city: string, municipality: string, region: string]> = [
    ['st-centro', 'EST-01', 'León Centro', 'Guanajuato', 'León', 'León', 'Bajío'],
    ['st-norte', 'EST-02', 'León Norte', 'Guanajuato', 'León', 'León', 'Bajío'],
    ['st-irapuato', 'EST-03', 'Irapuato Boulevard', 'Guanajuato', 'Irapuato', 'Irapuato', 'Bajío'],
    ['st-celaya', 'EST-04', 'Celaya Panamericana', 'Guanajuato', 'Celaya', 'Celaya', 'Bajío'],
    ['st-qro', 'EST-05', 'Querétaro 5 de Febrero', 'Querétaro', 'Querétaro', 'Querétaro', 'Bajío'],
    ['st-gdl', 'EST-06', 'Guadalajara López Mateos', 'Jalisco', 'Guadalajara', 'Zapopan', 'Occidente'],
  ];
  for (const [id, code, name, state, city, municipality, region] of stations) {
    const exists = one(ctx.db, 'SELECT 1 AS x FROM stations WHERE id = ?', id);
    if (exists) run(ctx.db, 'UPDATE stations SET name = ?, state = ?, city = ?, municipality = ?, region = ? WHERE id = ?', name, state, city, municipality, region, id);
    else run(ctx.db, 'INSERT INTO stations (id, tenant_id, code, name, state, city, municipality, region) VALUES (?,?,?,?,?,?,?,?)', id, 'demo', code, name, state, city, municipality, region);
  }
  run(ctx.db, `UPDATE users SET station_id = NULL, name = 'Gerente de grupo' WHERE id = 'u-manager'`);
  const attendants: Array<[string, string, string, string]> = [
    ['u-irapuato', 'st-irapuato', 'Karla (despachadora)', '3333'], ['u-celaya', 'st-celaya', 'Jorge (despachador)', '4444'],
    ['u-qro', 'st-qro', 'Diana (despachadora)', '5555'], ['u-gdl', 'st-gdl', 'Ramón (despachador)', '6666'],
  ];
  for (const [id, st, name, pin] of attendants) {
    if (!one(ctx.db, 'SELECT 1 AS x FROM users WHERE id = ?', id)) run(ctx.db, 'INSERT INTO users (id, tenant_id, station_id, name, role, pin_hash) VALUES (?,?,?,?,?,?)', id, 'demo', st, name, 'attendant', hashPin(pin, ctx.salt));
  }
  const attendantByStation: Record<string, string> = { 'st-centro': 'u-luis', 'st-norte': 'u-marta', 'st-irapuato': 'u-irapuato', 'st-celaya': 'u-celaya', 'st-qro': 'u-qro', 'st-gdl': 'u-gdl' };
  const stationIds = stations.map((s) => s[0]);

  // ---- Asociados ----
  const cafe = createPartner(ctx, 'demo', null, { name: 'Café La Isla', type: 'cafeteria', contact: 'alianzas@cafelaisla.mx' });
  const cafeBenefit = createBenefit(ctx, 'demo', null, cafe.id, { name: 'Café americano gratis', description: 'Un café americano de 12 oz en cualquier sucursal de Café La Isla dentro de la estación.', valueCents: 3_500, codePrefix: 'CAFE', inventoryInitial: 500 });
  const spa = createPartner(ctx, 'demo', null, { name: 'AutoSpa Bajío', type: 'lavado', contact: '477 555 0142' });
  const spaBenefit = createBenefit(ctx, 'demo', null, spa.id, { name: '$20 de descuento en lavado', description: 'Lavado exterior o completo en AutoSpa Bajío.', valueCents: 2_000, codePrefix: 'SPA', inventoryInitial: 300, stationIds: ['st-centro', 'st-norte', 'st-irapuato'] });
  const taller = createPartner(ctx, 'demo', null, { name: 'Servicio Automotriz Ruiz', type: 'taller', contact: 'taller.ruiz@ejemplo.mx' });
  createBenefit(ctx, 'demo', null, taller.id, { name: '15% en cambio de aceite', valueCents: 12_000, codePrefix: 'RUIZ', inventoryInitial: 200 });
  createPartner(ctx, 'demo', null, { name: 'Banco Regional del Bajío', type: 'banco', contact: 'convenios@ejemplo.mx' });
  createPartner(ctx, 'demo', null, { name: 'Refaccionaria El Volante', type: 'refaccionaria' });

  // ---- Campañas y promociones ----
  // Las de tipo de vehículo también se usan para agregarlas a una base existente (scripts/vehicle-promos).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const promoAt = (start: Date) => at(start < now ? start : now);
  type P = { name: string; type: string; objective: string; rules: PromoRules; benefit: Benefit; limits?: Record<string, number | null>; stackable?: boolean; priority?: number; inventoryInitial?: number | null; partnerId?: string | null; status?: string };
  // Las campañas ya terminadas se crean activas para que las cargas históricas las usen; al final se cierran.
  const toEnd: string[] = [];
  const campaign = (name: string, description: string, objective: string, status: string, start: Date, end: Date, budget: number | null, promos: P[]) => {
    const effective = status === 'ended' ? 'active' : status;
    const c = createCampaign(promoAt(start), 'demo', null, { name, description, objective, status: effective, startsAt: iso(start), endsAt: iso(end), budgetCents: budget });
    if (status === 'ended') toEnd.push(String(c.id));
    const created = promos.map((p) => createPromotion(promoAt(start), 'demo', null, {
      campaignId: c.id, name: p.name, type: p.type, objective: p.objective, status: p.status ?? (effective === 'active' ? 'active' : 'draft'),
      priority: p.priority ?? 0, stackable: p.stackable ?? true, rules: { startsAt: iso(start), endsAt: iso(end), ...p.rules }, benefit: p.benefit, limits: p.limits ?? {},
      inventoryInitial: p.inventoryInitial ?? null, partnerId: p.partnerId ?? null,
    }));
    return { campaign: c, promotions: created };
  };

  campaign('Mes del Cliente', 'Cinco promociones combinadas para subir el ticket y la frecuencia durante el mes.', 'ticket_promedio', 'active', monthStart, monthEnd, 250_000_00, [
    { name: 'Carga $500 o más → 50 puntos', type: 'puntos', objective: 'ticket_promedio', rules: { minFuelCents: 50_000 }, benefit: { type: 'points', points: 50 }, limits: { maxPerDay: 1 }, priority: 30 },
    { name: 'Carga $700 o más → $30 de dinero virtual', type: 'dinero_virtual', objective: 'ticket_promedio', rules: { minFuelCents: 70_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 30 }, limits: { maxPerDay: 1 }, priority: 40 },
    { name: 'Carga Premium → puntos dobles', type: 'puntos_dobles', objective: 'premium', rules: { fuelTypes: ['premium'], minLitersMl: 15_000 }, benefit: { type: 'points_multiplier', multiplier: 2 }, limits: { maxPerDay: 1 }, priority: 20 },
    { name: 'Carga 30 litros o más → cupón de café', type: 'asociados', objective: 'tienda', rules: { minLitersMl: 30_000 }, benefit: { type: 'partner_coupon', partnerBenefitId: cafeBenefit.id, label: 'Café americano gratis en Café La Isla', amountCents: 3_500, couponDays: 7 }, limits: { maxPerDay: 1 }, priority: 25, inventoryInitial: 500, partnerId: cafe.id },
    { name: '5 cargas en el mes → bono de $100', type: 'frecuencia', objective: 'frecuencia', rules: { minLitersMl: 15_000, visitsInPeriod: { count: 5, period: 'month' } }, benefit: { type: 'virtual_money', amountCents: 10_000, walletExpiresDays: 30 }, limits: { maxPerMonth: 1 }, priority: 50 },
  ]);
  campaign('Martes y jueves de Regular', 'Mueve cargas de Regular a las horas valle de la tarde.', 'litros', 'active', new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59), 80_000_00, [
    { name: 'Regular martes y jueves de 14:00 a 18:00 → $30 de dinero virtual', type: 'horario', objective: 'litros', rules: { fuelTypes: ['regular'], daysOfWeek: [2, 4], hourFrom: 14, hourTo: 18, minFuelCents: 70_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 21 }, limits: { maxPerDay: 1 }, stackable: false, priority: 60, inventoryInitial: 800 },
  ]);
  campaign('Taxis, plataformas y flotillas', 'Beneficios para quien carga todos los días.', 'litros', 'active', daysAgo(70), new Date(now.getFullYear(), 11, 31, 23, 59, 59), null, [
    { name: '150 litros al mes → $50 de dinero virtual', type: 'volumen', objective: 'litros', rules: { customerTypes: ['taxi', 'plataforma'], minMonthlyCents: 350_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 }, limits: { maxPerMonth: 1 }, priority: 45 },
    { name: 'Motos: 12 cargas al mes → $40', type: 'frecuencia', objective: 'frecuencia', rules: { customerTypes: ['moto'], minLitersMl: 5_000, visitsInPeriod: { count: 12, period: 'month' } }, benefit: { type: 'virtual_money', amountCents: 4_000, walletExpiresDays: 30 }, limits: { maxPerMonth: 1 }, priority: 45 },
    { name: 'Flotillas: 2% de cashback pagando con cuenta de flotilla', type: 'flotillas', objective: 'pagos_digitales', rules: { customerTypes: ['flotilla'], paymentMethods: ['flotilla'], minFuelCents: 40_000 }, benefit: { type: 'cashback_percent', percent: 2, walletExpiresDays: 45 }, limits: { maxDiscountCents: 2_500, maxPerDay: 1 }, priority: 35 },
  ]);
  campaign('Por tipo de vehículo', 'Beneficios según la placa registrada: motos, servicio público, carga pesada, emergencia y ecológicos.', 'litros', 'active', daysAgo(20), new Date(now.getFullYear(), 11, 31, 23, 59, 59), null, VEHICLE_PROMOS),
  campaign('Combustible + lavado AutoSpa', 'Alianza con AutoSpa para llenar el lavado entre semana.', 'servicios', 'active', daysAgo(27), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59), 60_000_00, [
    { name: 'Carga $600 o más → $20 de descuento en lavado', type: 'asociados', objective: 'servicios', rules: { minFuelCents: 60_000, stationIds: ['st-centro', 'st-norte', 'st-irapuato'], daysOfWeek: [1, 2, 3, 4] }, benefit: { type: 'partner_coupon', partnerBenefitId: spaBenefit.id, label: '$20 de descuento en lavado AutoSpa', amountCents: 2_000, couponDays: 14 }, limits: { maxPerDay: 1 }, priority: 28, inventoryInitial: 300, partnerId: spa.id },
  ]);
  campaign('Paga digital', 'Menos efectivo en la isla: cashback por pago con tarjeta o digital.', 'pagos_digitales', 'active', monthStart, new Date(now.getFullYear(), 11, 31, 23, 59, 59), null, [
    { name: 'Pago digital o tarjeta → 2% de cashback', type: 'cashback', objective: 'pagos_digitales', rules: { paymentMethods: ['digital', 'tarjeta'], minFuelCents: 30_000 }, benefit: { type: 'cashback_percent', percent: 2, walletExpiresDays: 30 }, limits: { maxPerDay: 1, maxDiscountCents: 3_000 }, priority: 15 },
  ]);
  campaign('Bienvenida y reactivación', 'Automáticas: segunda carga de nuevos y regreso de inactivos.', 'clientes_nuevos', 'active', daysAgo(100), new Date(now.getFullYear(), 11, 31, 23, 59, 59), null, [
    { name: 'Nuevos: puntos dobles en tu segunda carga', type: 'puntos_dobles', objective: 'clientes_nuevos', rules: { segments: ['nuevo'], minLitersMl: 15_000 }, benefit: { type: 'points_multiplier', multiplier: 2 }, limits: { maxPerCustomer: 1 }, priority: 55 },
    { name: 'Te extrañamos: 100 puntos extra', type: 'puntos', objective: 'recuperar_inactivos', rules: { segments: ['inactivo'], minLitersMl: 15_000 }, benefit: { type: 'points', points: 100 }, limits: { maxPerCustomer: 1 }, stackable: false, priority: 70 },
  ]);
  campaign('Regreso a clases 2026', 'Ticket alto y tienda en la temporada de útiles.', 'ticket_promedio', 'ended', daysAgo(32), daysAgo(5, 23, 59), 90_000_00, [
    { name: 'Carga $600 o más → $25 de dinero virtual', type: 'dinero_virtual', objective: 'ticket_promedio', rules: { minFuelCents: 60_000 }, benefit: { type: 'virtual_money', amountCents: 2_500, walletExpiresDays: 30 }, limits: { maxPerDay: 1 }, priority: 40 },
    { name: '2x1 en agua con tu carga', type: '2x1', objective: 'tienda', rules: { minFuelCents: 30_000, requiresStore: true }, benefit: { type: 'two_for_one', label: 'agua 600 ml', amountCents: 1_500 }, limits: { maxPerDay: 1 }, priority: 10, inventoryInitial: 1_000 },
  ]);
  campaign('Verano 2026', 'Escalonada de vacaciones: entre más cargas, más ganas.', 'ticket_promedio', 'ended', daysAgo(72), daysAgo(33, 23, 59), 120_000_00, [
    { name: 'Escalonada de verano', type: 'escalonada', objective: 'ticket_promedio', rules: { tiers: [
      { minAmountCents: 40_000, benefit: { type: 'points', points: 10 } }, { minAmountCents: 50_000, benefit: { type: 'points', points: 20 } },
      { minAmountCents: 60_000, benefit: { type: 'virtual_money', amountCents: 2_000, walletExpiresDays: 30 } }, { minAmountCents: 70_000, benefit: { type: 'virtual_money', amountCents: 3_500, walletExpiresDays: 30 } },
      { minAmountCents: 80_000, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 } },
    ] }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 }, limits: { maxPerDay: 1 }, priority: 40 },
  ]);
  // Diez promociones para vender más: el beneficio se entrega para REGRESAR, no como descuento inmediato.
  const regresa = campaign('Regresa y gana: 10 promociones', 'Mecánicas orientadas a la segunda visita: dinero virtual con compra mínima siguiente, cadenas de regreso, beneficios divididos, escalera y meta personal.', 'frecuencia', 'active', monthStart, new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59), 200_000_00, [
    { name: '1. Carga $500 → $30 para regresar', type: 'dinero_virtual', objective: 'frecuencia', rules: { minFuelCents: 50_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000, singleUse: true }, limits: { maxPerDay: 1 }, stackable: false, priority: 30, status: 'draft' },
    { name: '2. Carga $600 → $50 para tu próxima visita', type: 'dinero_virtual', objective: 'ticket_promedio', rules: { minFuelCents: 60_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 10, minNextPurchaseCents: 50_000, singleUse: true }, limits: { maxPerDay: 1 }, stackable: false, priority: 31, status: 'draft' },
    { name: '3a. Carga $400 → $20 para tu próxima visita', type: 'dinero_virtual', objective: 'frecuencia', rules: { minFuelCents: 40_000, segments: ['bajo_consumo', 'nuevo'] }, benefit: { type: 'virtual_money', amountCents: 2_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000, singleUse: true }, limits: { maxPerDay: 1 }, priority: 22 },
    { name: '3b. Regresa en 5 días con $400 → otros $30', type: 'frecuencia', objective: 'frecuencia', rules: { minFuelCents: 40_000, returnWithinDays: { days: 5, minPrevFuelCents: 40_000 }, segments: ['bajo_consumo', 'nuevo'] }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000, singleUse: true }, limits: { maxPerDay: 1 }, priority: 23 },
    { name: '4. Carga $500 → desbloquea $100 en beneficios', type: 'combinada', objective: 'tienda', rules: { minFuelCents: 50_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 14, scope: 'fuel', minNextPurchaseCents: 40_000 }, limits: { maxPerDay: 1 }, priority: 24, status: 'draft' },
    { name: '5. Cadena de regresos: $30, $40 y $60', type: 'frecuencia', objective: 'frecuencia', rules: { returnStreak: { withinDays: 7, rewardsCents: [3_000, 4_000, 6_000], minFuelCents: 50_000 } }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000 }, limits: { maxPerDay: 1 }, priority: 42 },
    { name: '6. Carga $500 + $100 en tienda → $50', type: 'combinada', objective: 'tienda', rules: { minFuelCents: 50_000, minStoreCents: 10_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 14, minNextPurchaseCents: 40_000 }, limits: { maxPerDay: 1 }, priority: 26 },
    { name: '7. Carga $500 + café → $50 para regresar', type: 'combinada', objective: 'tienda', rules: { minFuelCents: 50_000, requiresItems: ['cafe'] }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 14, minNextPurchaseCents: 40_000 }, limits: { maxPerDay: 1 }, priority: 27 },
    { name: '8. Tu tercera carga de $500 tiene premio', type: 'frecuencia', objective: 'frecuencia', rules: { visitsInPeriod: { count: 3, period: 'month', qualifyingMinFuelCents: 50_000 } }, benefit: { type: 'virtual_money', amountCents: 10_000, walletExpiresDays: 14, minNextPurchaseCents: 40_000 }, limits: { maxPerMonth: 1 }, priority: 45 },
    { name: '9. Escalera de consumo', type: 'escalonada', objective: 'ticket_promedio', rules: { tiers: [
      { minAmountCents: 40_000, benefit: { type: 'virtual_money', amountCents: 2_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000, singleUse: true } },
      { minAmountCents: 50_000, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 7, minNextPurchaseCents: 40_000, singleUse: true } },
      { minAmountCents: 60_000, benefit: { type: 'virtual_money', amountCents: 4_500, walletExpiresDays: 7, minNextPurchaseCents: 50_000, singleUse: true } },
      { minAmountCents: 70_000, benefit: { type: 'virtual_money', amountCents: 6_000, walletExpiresDays: 7, minNextPurchaseCents: 50_000, singleUse: true } },
      { minAmountCents: 80_000, benefit: { type: 'virtual_money', amountCents: 8_000, walletExpiresDays: 7, minNextPurchaseCents: 60_000, singleUse: true } },
    ] }, benefit: { type: 'virtual_money', amountCents: 8_000, walletExpiresDays: 7 }, limits: { maxPerDay: 1 }, stackable: true, priority: 35 },
    { name: '10. Tu meta personal', type: 'volumen', objective: 'ticket_promedio', rules: { personalized: { upliftPercent: 10, roundToCents: 5_000, minTargetCents: 40_000, maxTargetCents: 150_000, benefitTable: [{ targetCents: 50_000, amountCents: 3_000 }, { targetCents: 60_000, amountCents: 4_000 }, { targetCents: 70_000, amountCents: 6_000 }, { targetCents: 80_000, amountCents: 8_000 }, { targetCents: 150_000, amountCents: 10_000 }], minNextPurchasePercent: 90, validDays: 7 } }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 7, singleUse: true }, limits: { maxPerDay: 1 }, stackable: true, priority: 65 },
  ]);
  // La promoción 4 reparte $100: $30 combustible (beneficio principal), $30 tienda, café y lavado.
  const p4 = regresa.promotions.find((p) => p.name.startsWith('4.'));
  const p9 = regresa.promotions.find((p) => p.name.startsWith('9.'));
  const p10 = regresa.promotions.find((p) => p.name.startsWith('10.'));
  if (p4) run(ctx.db, 'UPDATE promotions SET benefits_json = ? WHERE id = ?', JSON.stringify([
    { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 14, scope: 'store', label: '$30 para tienda' },
    { type: 'coupon', label: 'Café americano ($20)', amountCents: 2_000, couponDays: 14 },
    { type: 'coupon', label: '$20 en lavado AutoSpa', amountCents: 2_000, couponDays: 14 },
  ]), p4.id);
  // La escalera y la meta personal son alternativas: no se apilan entre sí.
  if (p9 && p10) { run(ctx.db, 'UPDATE promotions SET excludes_json = ? WHERE id = ?', JSON.stringify([p10.id]), p9.id); run(ctx.db, 'UPDATE promotions SET excludes_json = ? WHERE id = ?', JSON.stringify([p9.id]), p10.id); }

  // Diez promociones que corresponden a los carteles de public/promos (una por cartel, mismo orden).
  campaign('Carteles de temporada', 'Las diez promociones del material impreso de septiembre: una por cartel, con su mecánica real en el motor.', 'ticket_promedio', 'active', monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59), 120_000_00, [
    { name: 'Carga $500 y recibe $50 para tu próxima visita', type: 'dinero_virtual', objective: 'frecuencia', rules: { minFuelCents: 50_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30, minNextPurchaseCents: 30_000, singleUse: true }, limits: { maxPerDay: 1 }, stackable: false, priority: 52 },
    { name: 'Carga $800 y obtén $80 en cupón para tu próxima visita', type: 'cupon', objective: 'ticket_promedio', rules: { minFuelCents: 80_000 }, benefit: { type: 'coupon', label: '$80 para tu próxima visita', amountCents: 8_000, couponDays: 30 }, limits: { maxPerDay: 1 }, stackable: false, priority: 53 },
    { name: 'Tu segunda carga tiene $50 de descuento', type: 'descuento_fijo', objective: 'clientes_nuevos', rules: { segments: ['nuevo'], minFuelCents: 30_000 }, benefit: { type: 'discount_fixed', amountCents: 5_000 }, limits: { maxPerCustomer: 1 }, stackable: false, priority: 58 },
    { name: 'Carga $600 y participa por grandes premios', type: 'sorteo', objective: 'frecuencia', rules: { minFuelCents: 60_000 }, benefit: { type: 'scratch' }, limits: { maxPerDay: 1 }, stackable: true, priority: 40 },
    { name: 'Paga con tarjeta y recibe un beneficio adicional', type: 'cashback', objective: 'pagos_digitales', rules: { paymentMethods: ['tarjeta', 'digital'], minFuelCents: 30_000 }, benefit: { type: 'cashback_percent', percent: 2 }, limits: { maxPerDay: 1, maxDiscountCents: 5_000 }, stackable: true, priority: 30 },
    { name: 'Acumula puntos por cada litro y canjéalos por grandes beneficios', type: 'puntos_dobles', objective: 'litros', rules: { minLitersMl: 20_000 }, benefit: { type: 'points_multiplier', multiplier: 2 }, limits: { maxPerDay: 1 }, stackable: true, priority: 20 },
    { name: 'Carga 40 litros y recibe $50 de saldo', type: 'dinero_virtual', objective: 'litros', rules: { minLitersMl: 40_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 }, limits: { maxPerDay: 1 }, stackable: false, priority: 51 },
    { name: 'Martes de combustible: $50 de beneficio en tu carga', type: 'horario', objective: 'frecuencia', rules: { daysOfWeek: [2], minFuelCents: 50_000 }, benefit: { type: 'discount_fixed', amountCents: 5_000 }, limits: { maxPerDay: 1 }, stackable: false, priority: 57 },
    { name: 'Carga gasolina y compra en tienda: descuento especial', type: 'combinada', objective: 'tienda', rules: { minFuelCents: 30_000, minStoreCents: 5_000 }, benefit: { type: 'discount_percent', percent: 10 }, limits: { maxPerDay: 1, maxDiscountCents: 6_000 }, stackable: true, priority: 33 },
    { name: 'Promoción por tiempo limitado: carga hoy y gana beneficios para tu próxima visita', type: 'temporada', objective: 'frecuencia', rules: { minFuelCents: 40_000 }, benefit: { type: 'virtual_money', amountCents: 3_000, walletExpiresDays: 15, minNextPurchaseCents: 30_000, singleUse: true }, limits: { maxPerDay: 1 }, stackable: false, priority: 50 },
  ]);

  campaign('Buen Fin 2026', 'Programada: puntos triples y dinero virtual diferido a diciembre.', 'ticket_promedio', 'scheduled', new Date(now.getFullYear(), 10, 13), new Date(now.getFullYear(), 10, 16, 23, 59, 59), 150_000_00, [
    { name: 'Buen Fin: puntos triples', type: 'temporada', objective: 'ticket_promedio', rules: { minLitersMl: 20_000 }, benefit: { type: 'points_multiplier', multiplier: 3 }, limits: { maxPerDay: 1 }, priority: 80, status: 'draft' },
    { name: 'Carga $800 o más → $50 de dinero virtual para diciembre', type: 'dinero_virtual', objective: 'ticket_promedio', rules: { minFuelCents: 80_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 45 }, limits: { maxPerDay: 1 }, priority: 75, status: 'draft' },
  ]);

  // ---- Investigación de campañas ----
  const research: Array<Parameters<typeof createResearch>[3]> = [
    { competitor: 'BP', name: 'BPme Rewards: puntos por litro', type: 'puntos', benefit: 'Puntos por cada litro; 10 puntos = $1; canje en isla', region: 'Nacional', state: null, city: null, station: null, audience: 'Automovilista', validityText: 'Permanente', resultRating: 4, resultNotes: 'Relanzado tras la salida de PAYBACK en 2023. Registro por teléfono.', estimatedCostCents: 10, sourceUrl: 'https://www.bpmerewards.com.mx/', verified: true, startDate: '2023-08-01', endDate: null },
    { competitor: 'OXXO Gas', name: 'Spin Premia: 1 punto por cada 2 litros', type: 'puntos', benefit: 'Puntos canjeables en OXXO y socios FEMSA', region: 'Nacional', state: null, city: null, station: null, audience: 'Automovilista', validityText: 'Permanente', resultRating: 5, resultNotes: '28.1 millones de usuarios activos de Spin Premia al 4T 2025 (todo el ecosistema).', estimatedCostCents: 5, sourceUrl: 'https://oxxogas.com/articulo/spin-premia-oxxogas', verified: true, startDate: '2023-05-01', endDate: null },
    { competitor: 'Repsol (España)', name: 'Waylet: 5 a 40 céntimos por litro', type: 'descuento_litro', benefit: 'Descuento directo por litro según servicios contratados', region: 'Internacional', state: null, city: null, station: null, audience: 'Automovilista con app', validityText: 'Permanente', resultRating: 5, resultNotes: '10 millones de usuarios en feb 2026. Referencia de cómo comunicar centavos por litro.', estimatedCostCents: 40, sourceUrl: 'https://www.repsol.com/es/sala-prensa/notas-prensa/2026/repsol-alcanza-diez-millones-usuarios-waylet/index.cshtml', verified: true, startDate: '2019-01-01', endDate: null },
    { competitor: 'Exxon Mobil (EE. UU.)', name: 'Rewards+: 3 pts por galón, 6 en Premium', type: 'puntos', benefit: '100 puntos = 1 USD; teléfono y NIP en la bomba', region: 'Internacional', state: null, city: null, station: null, audience: 'Automovilista', validityText: 'Permanente', resultRating: 4, resultNotes: 'Premium paga doble: mismo principio que nuestra promoción de Premium.', estimatedCostCents: 8, sourceUrl: 'https://www.exxon.com/en/rewards-program', verified: true, startDate: '2019-11-05', endDate: null },
    { competitor: 'G500', name: 'Descuento con tarjeta bancaria', type: 'tarjeta_bancaria', benefit: '5% de bonificación pagando con tarjeta del banco aliado', region: 'Bajío', state: 'Guanajuato', city: 'León', station: null, audience: 'Tarjetahabientes', validityText: 'Fines de semana de julio', resultRating: 3, resultNotes: 'Dato ilustrativo para la demo; verificar con la fuente antes de citar.', estimatedCostCents: 1_800, sourceUrl: null, verified: false, startDate: '2026-07-04', endDate: '2026-07-27' },
    { competitor: 'Pemex (franquicia local)', name: 'Regreso a clases: mochila con carga de $800', type: 'regreso_clases', benefit: 'Mochila escolar por carga mayor a $800', region: 'Bajío', state: 'Guanajuato', city: 'Irapuato', station: 'Blvd. Díaz Ordaz', audience: 'Familias', validityText: 'Del 10 al 31 de agosto', resultRating: 2, resultNotes: 'Dato ilustrativo. Existencias agotadas en 9 días; sin registro de clientes.', estimatedCostCents: 9_000, sourceUrl: null, verified: false, startDate: '2026-08-10', endDate: '2026-08-31' },
    { competitor: 'Petro Seven', name: 'Buen Fin: cashback 5% con app', type: 'buen_fin', benefit: '5% de cashback en la app durante el Buen Fin', region: 'Norte', state: 'Nuevo León', city: 'Monterrey', station: null, audience: 'Usuarios de app', validityText: 'Buen Fin 2025', resultRating: 3, resultNotes: 'Dato ilustrativo para la demo.', estimatedCostCents: 3_500, sourceUrl: null, verified: false, startDate: '2025-11-14', endDate: '2025-11-17' },
    { competitor: 'Hidrosina', name: 'Carga y lava: lavado a mitad de precio', type: 'combustible_lavado', benefit: 'Lavado con 50% de descuento con carga mayor a $500', region: 'Centro', state: 'Ciudad de México', city: 'Ciudad de México', station: null, audience: 'Automovilista', validityText: 'Lunes a jueves', resultRating: 4, resultNotes: 'Dato ilustrativo. Modelo parecido a nuestra alianza con AutoSpa.', estimatedCostCents: 3_000, sourceUrl: null, verified: false, startDate: '2026-05-01', endDate: '2026-06-30' },
    { competitor: 'Arco', name: 'Verano: sorteo de viajes', type: 'verano', benefit: 'Boleto para sorteo por cada carga de $400', region: 'Noroeste', state: 'Baja California', city: 'Tijuana', station: null, audience: 'Automovilista', validityText: 'Julio y agosto', resultRating: 2, resultNotes: 'Dato ilustrativo. Sorteos requieren aviso ante PROFECO.', estimatedCostCents: 500, sourceUrl: null, verified: false, startDate: '2026-07-01', endDate: '2026-08-31' },
    { competitor: 'Cadena regional', name: 'Taxis: $0.50 por litro entre semana', type: 'taxis_plataformas', benefit: 'Descuento por litro para taxis registrados', region: 'Bajío', state: 'Querétaro', city: 'Querétaro', station: null, audience: 'Taxis', validityText: 'Lunes a viernes', resultRating: 4, resultNotes: 'Dato ilustrativo. Alta concentración de litros en pocos clientes; buen resultado en frecuencia.', estimatedCostCents: 1_750, sourceUrl: null, verified: false, startDate: '2026-03-01', endDate: '2026-06-30' },
    { competitor: 'Cadena regional', name: 'Flotillas: estado de cuenta con 1% de bonificación', type: 'flotillas', benefit: '1% de bonificación mensual a cuentas empresariales', region: 'Occidente', state: 'Jalisco', city: 'Guadalajara', station: null, audience: 'Flotillas', validityText: 'Permanente', resultRating: 3, resultNotes: 'Dato ilustrativo.', estimatedCostCents: 1_000, sourceUrl: null, verified: false, startDate: '2026-01-01', endDate: null },
    { competitor: 'Total', name: 'Café aliado: americano gratis con 30 litros', type: 'combustible_tienda', benefit: 'Café gratis en la tienda con carga de 30 L', region: 'Centro', state: 'Estado de México', city: 'Toluca', station: null, audience: 'Automovilista', validityText: 'Permanente', resultRating: 4, resultNotes: 'Dato ilustrativo. Sube la visita a tienda; costo real bajo.', estimatedCostCents: 1_200, sourceUrl: null, verified: false, startDate: '2026-02-01', endDate: null },
    { competitor: 'Costco', name: 'Precio de socio en gasolina', type: 'precio', benefit: 'Precio por litro menor para socios', region: 'Nacional', state: null, city: null, station: null, audience: 'Socios', validityText: 'Permanente', resultRating: 5, resultNotes: 'Dato ilustrativo. Modelo de precio exclusivo, difícil de replicar sin membresía.', estimatedCostCents: 100, sourceUrl: null, verified: false, startDate: null, endDate: null },
    { competitor: 'Cadena regional', name: 'Navidad: puntos dobles en diciembre', type: 'navidad', benefit: 'Puntos dobles del 15 al 31 de diciembre', region: 'Bajío', state: 'Guanajuato', city: null, station: null, audience: 'Miembros', validityText: 'Diciembre 2025', resultRating: 3, resultNotes: 'Dato ilustrativo.', estimatedCostCents: 700, sourceUrl: null, verified: false, startDate: '2025-12-15', endDate: '2025-12-31' },
    { competitor: 'Cadena regional', name: 'Semana Santa: kit de viaje con carga de $700', type: 'semana_santa', benefit: 'Kit de viaje (agua, toallitas, cargador) por carga mayor a $700', region: 'Bajío', state: 'Guanajuato', city: 'León', station: null, audience: 'Viajeros', validityText: 'Semana Santa 2026', resultRating: 3, resultNotes: 'Dato ilustrativo.', estimatedCostCents: 6_000, sourceUrl: null, verified: false, startDate: '2026-03-29', endDate: '2026-04-05' },
    { competitor: 'Shell (España)', name: 'ClubSmart: 1 punto por litro, 2 en V-Power', type: 'puntos', benefit: 'Puntos por litro y catálogo de premios', region: 'Internacional', state: null, city: null, station: null, audience: 'Automovilista', validityText: 'Permanente', resultRating: 3, resultNotes: 'Catálogo de regalos físicos: demasiada logística para un grupo mediano.', estimatedCostCents: 10, sourceUrl: 'https://clubsmart.disagrupo.es/Home/FAQ', verified: true, startDate: null, endDate: null },
  ];
  for (const r of research) createResearch(ctx, 'demo', null, r);

  // ---- Clientes ----
  const NAMES = ['Ana', 'Beto', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Hilda', 'Iván', 'Julieta', 'Karla', 'Luis', 'Mariana', 'Norberto', 'Olivia', 'Pablo', 'Quetzal', 'Rocío', 'Sergio', 'Tania', 'Ulises', 'Valeria', 'Ximena', 'Yolanda', 'Zaid', 'Adrián', 'Brenda', 'César', 'Diego', 'Elena', 'Fabián', 'Gloria', 'Héctor', 'Irene', 'Jaime', 'Lorena', 'Mauricio', 'Nadia', 'Óscar', 'Paola', 'Raúl', 'Sofía', 'Tomás', 'Vanessa', 'Yahir'];
  type Kind = 'particular' | 'taxi' | 'moto' | 'plataforma' | 'flotilla';
  const kinds: Kind[] = [...Array(70).fill('particular'), ...Array(10).fill('taxi'), ...Array(8).fill('plataforma'), ...Array(7).fill('moto'), ...Array(5).fill('flotilla')];
  const customers: Array<{ phone: string; kind: Kind; station: string; verified: boolean; freq: number; liters: number; store: number; premium: boolean; lift: number; created: Date }> = [];
  const existingPhones = new Set(['5544334317', '5611122233', '5512345678']);
  for (let i = 0; i < 240; i++) {
    let phone = '';
    do { phone = `${pick(['55', '56', '33', '44', '47', '46', '41', '81'])}${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`; } while (existingPhones.has(phone) || !/^[2-9]/.test(phone));
    existingPhones.add(phone);
    const kind = pick(kinds);
    const station = pick(stationIds);
    const created = daysAgo(Math.floor(between(20, 200)), 9);
    const birthday = rnd() < 0.4 ? `${1970 + Math.floor(rnd() * 35)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}` : null;
    enroll(at(created), 'demo', attendantByStation[station], station, { phone, firstName: pick(NAMES), marketingConsent: rnd() < 0.65, customerType: kind, birthday });
    const verified = rnd() < 0.8;
    if (verified) run(ctx.db, 'UPDATE customers SET verified_at = ? WHERE phone_hash = ?', iso(created), hashPhone(`+52${phone}`, ctx.salt));
    const profile = { particular: { freq: between(2, 5), liters: between(28, 42), store: 0.28 }, taxi: { freq: between(14, 22), liters: between(18, 30), store: 0.15 }, plataforma: { freq: between(10, 18), liters: between(20, 32), store: 0.2 }, moto: { freq: between(12, 22), liters: between(5, 9), store: 0.3 }, flotilla: { freq: between(8, 16), liters: between(38, 60), store: 0.05 } }[kind];
    customers.push({ phone, kind, station, verified, freq: profile.freq, liters: profile.liters, store: profile.store, premium: rnd() < 0.18, lift: rnd() < 0.7 ? 1.18 : 1.0, created });
  }
  run(ctx.db, `UPDATE memberships SET home_station_id = COALESCE(home_station_id, 'st-centro') WHERE tenant_id = 'demo'`);
  // Ana (cliente de demostración) lleva meses en el programa y carga en el mes actual.
  run(ctx.db, `UPDATE memberships SET created_at = ?, birthday = '1990-09-14' WHERE tenant_id = 'demo' AND first_name = 'Ana' AND customer_id = (SELECT id FROM customers WHERE phone_e164 = '+525544334317')`, iso(daysAgo(140)));
  for (const [d, liters, store, pay] of [[13, 36.5, 5_200, 'tarjeta'], [7, 32.0, 0, 'digital'], [2, 41.2, 6_800, 'tarjeta']] as Array<[number, number, number, 'tarjeta' | 'digital']>) {
    const when = daysAgo(d, 15, 20);
    try { registerSale(at(when), { userId: 'u-luis', tenantId: 'demo', stationId: 'st-centro', role: 'attendant' }, `seed-ana-extra-${d}`, { phone: '5544334317', posReference: `T-1189${d}`, pumpNumber: 4, fuelType: 'regular', litersMl: Math.round(liters * 1000), pricePerLiterCents: 2389, storeCents: store, paymentMethod: pay, source: 'manual', dispensedAt: iso(when) }); } catch { /* topes */ }
  }

  // ---- Cargas de los últimos 100 días ----
  const prices = { regular: 2389, premium: 2599, diesel: 2549 };
  const clasesStart = daysAgo(32), clasesEnd = daysAgo(5, 23, 59);
  let salesCount = 0, folio = 300_000;
  for (let d = 100; d >= 0; d--) {
    const day = daysAgo(d, 0);
    if (day > now) break;
    for (const c of customers) {
      if (day < c.created) continue;
      const inMonth = day >= monthStart && c.lift > 1;
      const pDay = (c.freq / 30) * (inMonth ? 1.15 : 1);
      if (rnd() > pDay) continue;
      const hour = Math.floor(between(6, 22)); const minute = Math.floor(rnd() * 60);
      const when = dayOf(day, hour, minute);
      if (when > now) continue;
      let liters = c.liters * between(0.75, 1.25);
      if (when >= monthStart) liters *= c.lift;
      else if (when >= clasesStart && when <= clasesEnd) liters *= (c.lift > 1 ? 1.08 : 1);
      const fuelType = c.kind === 'flotilla' && rnd() < 0.5 ? 'diesel' : c.premium && rnd() < 0.7 ? 'premium' : 'regular';
      const litersMl = Math.round(liters * 1000);
      const storeCents = rnd() < c.store ? Math.round(between(2_500, 12_000) / 100) * 100 : 0;
      const storeItems = storeCents > 0 ? (rnd() < 0.5 ? ['cafe'] : rnd() < 0.5 ? ['agua'] : []) : [];
      const station = rnd() < 0.8 ? c.station : pick(stationIds);
      const paymentMethod = c.kind === 'flotilla' ? (rnd() < 0.8 ? 'flotilla' : 'tarjeta') : pick(['efectivo', 'efectivo', 'efectivo', 'tarjeta', 'tarjeta', 'digital'] as const);
      const actor = { userId: attendantByStation[station], tenantId: 'demo', stationId: station, role: 'attendant' as const };
      const c2 = at(when);
      let walletSpendCents = 0;
      if (rnd() < 0.2) {
        const m = one<{ id: string }>(ctx.db, `SELECT m.id FROM memberships m JOIN customers cu ON cu.id = m.customer_id WHERE m.tenant_id = 'demo' AND cu.phone_e164 = ?`, `+52${c.phone}`);
        if (m) {
          const fuelCents = Math.round((litersMl * prices[fuelType]) / 1000);
          const avail = one<{ s: number | null }>(ctx.db, `SELECT SUM(remaining_cents) AS s FROM wallet_movements WHERE membership_id = ? AND kind='earn' AND status IN ('active','partial') AND (expires_at IS NULL OR expires_at > ?) AND min_purchase_cents <= ? AND scope != 'store'`, m.id, iso(when), fuelCents + storeCents)?.s ?? 0;
          if (avail >= 2_000) walletSpendCents = Math.min(avail, Math.round(between(2_000, 6_000) / 100) * 100, fuelCents);
        }
      }
      try {
        registerSale(c2, actor, `seed-${folio}`, { phone: c.phone, posReference: `T-${folio++}`, pumpNumber: 1 + Math.floor(rnd() * 8), fuelType, litersMl, pricePerLiterCents: prices[fuelType], storeCents, storeItems, paymentMethod, walletSpendCents, source: 'manual', dispensedAt: iso(when) });
        salesCount++;
      } catch { /* topes diarios u otras reglas: se omite la carga */ }
    }
  }

  // ---- Cierre de campañas terminadas ----
  for (const id of toEnd) {
    run(ctx.db, `UPDATE campaigns SET status = 'ended' WHERE id = ?`, id);
    run(ctx.db, `UPDATE promotions SET status = 'ended' WHERE campaign_id = ?`, id);
  }

  // ---- Rasca y Gana: la mayoría de los clientes ya rascó sus tarjetas anteriores ----
  const cards = all<ScratchCardRow>(ctx.db, `SELECT * FROM scratch_cards WHERE tenant_id = 'demo' AND status = 'available' AND created_at < ?`, iso(daysAgo(1)));
  for (const card of cards) {
    if (rnd() < 0.65) { try { revealCard(at(new Date(new Date(card.created_at).getTime() + 3_600_000 * between(1, 48))), card.id, { tenantId: 'demo' }); } catch { /* vencidas */ } }
  }

  // ---- Existencias del café: dejar la lectura de la sección 8 (usados / restantes) ----
  runNotifications(ctx, 'demo', { maxPerKind: 60 });
  run(ctx.db, `UPDATE tenants SET meta_json = ? WHERE id = 'demo'`, JSON.stringify({ rich: true, seededAt: iso(now) }));
  return { customers: customers.length, sales: salesCount };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { newId };
