import type { FuelType } from '../rules.js';
import { conditionSentence } from './terms.js';
import { OBJECTIVE_LABELS, type Benefit, type CustomerType, type Objective, type PromoLimits, type PromoRules, type PromoType, type Segment } from './types.js';

export interface GeneratorInput {
  objective: Objective;
  fuelTypes?: FuelType[];
  location?: { stationIds?: string[]; states?: string[]; cities?: string[] };
  customerTypes?: CustomerType[];
  segments?: Segment[];
  consumption?: { minAmountCents?: number; minLitersMl?: number; visits?: number; monthlyCents?: number; lifetimeCents?: number };
  /** Margen de la estación por litro en centavos, para estimar costo relativo. Por defecto 200. */
  marginCentsPerLiter?: number;
}

export interface Proposal {
  key: string;
  name: string;
  type: PromoType;
  objective: Objective;
  rules: PromoRules;
  benefit: Benefit;
  limits: PromoLimits;
  stackable: boolean;
  priority: number;
  inventoryInitial: number | null;
  rationale: string;
  kpi: string;
  /** Costo estimado por beneficio entregado, en centavos. */
  estimatedCostCents: number;
  condition: string;
  risk: string;
}

const base = (i: GeneratorInput): PromoRules => ({
  ...(i.fuelTypes?.length ? { fuelTypes: i.fuelTypes } : {}),
  ...(i.location?.stationIds?.length ? { stationIds: i.location.stationIds } : {}),
  ...(i.location?.states?.length ? { states: i.location.states } : {}),
  ...(i.location?.cities?.length ? { cities: i.location.cities } : {}),
  ...(i.customerTypes?.length ? { customerTypes: i.customerTypes } : {}),
  ...(i.segments?.length ? { segments: i.segments } : {}),
});

/**
 * Propone promociones a partir del objetivo comercial (sección 2). Cada propuesta declara
 * OBJETIVO → CONDICIÓN → BENEFICIO → RESTRICCIONES → COSTO → INDICADOR, y es un borrador que
 * el administrador ajusta antes de activar.
 */
export function generateProposals(i: GeneratorInput): Proposal[] {
  const min = i.consumption?.minAmountCents ?? 50_000;
  const liters = i.consumption?.minLitersMl ?? 30_000;
  const visits = i.consumption?.visits ?? 5;
  const monthly = i.consumption?.monthlyCents ?? 150_000;
  const out: Proposal[] = [];
  const add = (p: Omit<Proposal, 'condition' | 'objective' | 'key'> & { key?: string }) => {
    out.push({ ...p, key: p.key ?? `${i.objective}-${out.length + 1}`, objective: i.objective, condition: conditionSentence(p.rules, p.rules.tiers?.length ? p.rules.tiers[p.rules.tiers.length - 1].benefit : p.benefit) });
  };
  const fuelLabel = i.fuelTypes?.length ? i.fuelTypes.join('/') : 'cualquier combustible';

  switch (i.objective) {
    case 'ticket_promedio':
      add({
        name: 'Entre más cargas, más ganas', type: 'escalonada',
        rules: { ...base(i), tiers: [
          { minAmountCents: 40_000, benefit: { type: 'points', points: 10 } },
          { minAmountCents: 50_000, benefit: { type: 'points', points: 20 } },
          { minAmountCents: 60_000, benefit: { type: 'virtual_money', amountCents: 2_000, walletExpiresDays: 30 } },
          { minAmountCents: 70_000, benefit: { type: 'virtual_money', amountCents: 3_500, walletExpiresDays: 30 } },
          { minAmountCents: 80_000, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 } },
        ] },
        benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 },
        limits: { maxPerDay: 1 }, stackable: true, priority: 50, inventoryInitial: null,
        rationale: 'La barra de progreso muestra cuánto falta para el siguiente escalón; el cliente redondea la carga hacia arriba.',
        kpi: 'Ticket promedio antes y durante; % de cargas ≥ $600.', estimatedCostCents: 2_800,
        risk: 'Regalar dinero virtual a quien ya cargaba $800: medir contra grupo de control y capar el escalón alto.',
      });
      add({
        name: `Carga ${(min / 100).toFixed(0)} y llévate dinero virtual`, type: 'dinero_virtual',
        rules: { ...base(i), minFuelCents: min }, benefit: { type: 'virtual_money', amountCents: Math.round(min * 0.04), walletExpiresDays: 21 },
        limits: { maxPerDay: 1, maxPerMonth: 4 }, stackable: false, priority: 40, inventoryInitial: null,
        rationale: 'Umbral único fácil de comunicar en la pantalla del surtidor; el dinero virtual regresa al cliente a la estación.',
        kpi: 'Ticket promedio y tasa de uso del dinero virtual a 21 días.', estimatedCostCents: Math.round(min * 0.04),
        risk: 'Costo alto si el umbral queda por debajo del ticket actual; fijarlo 15 % arriba del promedio.',
      });
      break;
    case 'litros':
      add({
        name: `${liters / 1000} litros o más: puntos extra`, type: 'volumen',
        rules: { ...base(i), minLitersMl: liters }, benefit: { type: 'points', points: Math.round(liters / 1000) },
        limits: { maxPerDay: 1 }, stackable: true, priority: 30, inventoryInitial: null,
        rationale: 'Premia el tanque lleno con un punto extra por litro a partir del umbral.', kpi: 'Litros promedio por carga.', estimatedCostCents: Math.round(liters / 1000) * 10,
        risk: 'Bajo; el tope diario evita cargas divididas.',
      });
      add({
        name: `Meta mensual: ${(monthly / 100).toLocaleString('es-MX')} en cargas`, type: 'frecuencia',
        rules: { ...base(i), minMonthlyCents: monthly }, benefit: { type: 'virtual_money', amountCents: Math.round(monthly * 0.02), walletExpiresDays: 30 },
        limits: { maxPerMonth: 1 }, stackable: true, priority: 35, inventoryInitial: null,
        rationale: 'Concentra el tanque completo en la red; solo paga a quien alcanza la meta.', kpi: '% de miembros que cruzan la meta; litros por cliente al mes.', estimatedCostCents: Math.round(monthly * 0.02),
        risk: 'Litros falsos del despachador: tope diario y conciliación por turno.',
      });
      break;
    case 'frecuencia':
      add({
        name: `${visits} cargas en el mes y bono`, type: 'frecuencia',
        rules: { ...base(i), minLitersMl: 15_000, visitsInPeriod: { count: visits, period: 'month' } }, benefit: { type: 'virtual_money', amountCents: 10_000, walletExpiresDays: 30 },
        limits: { maxPerMonth: 1 }, stackable: true, priority: 45, inventoryInitial: null,
        rationale: 'Fija un ritmo de visita; el contador visible en el portal empuja las últimas cargas.', kpi: 'Mediana de días entre cargas; % con 5 cargas al mes.', estimatedCostCents: 10_000,
        risk: 'Cargas pequeñas para sumar visitas: mínimo de 15 L por carga.',
      });
      add({
        name: 'Regresa en 7 días', type: 'frecuencia',
        rules: { ...base(i), visitsInPeriod: { count: 2, period: 'week' } }, benefit: { type: 'points', points: 20 },
        limits: { maxPerMonth: 4 }, stackable: true, priority: 20, inventoryInitial: null,
        rationale: 'Acorta el intervalo entre visitas con un premio pequeño.', kpi: 'Días entre cargas.', estimatedCostCents: 200, risk: 'Bajo.',
      });
      break;
    case 'clientes_nuevos':
      add({
        name: 'Bienvenida: puntos dobles en tu segunda carga', type: 'puntos_dobles',
        rules: { ...base(i), segments: ['nuevo'], minLitersMl: 15_000 }, benefit: { type: 'points_multiplier', multiplier: 2 },
        limits: { maxPerCustomer: 1 }, stackable: true, priority: 60, inventoryInitial: null,
        rationale: 'Convierte el alta en hábito; solo se paga si regresa.', kpi: '% de registrados con segunda carga a 30 días.', estimatedCostCents: 350, risk: 'Alta con números ajenos: verificación del teléfono.',
      });
      add({
        name: 'Refiere y gana', type: 'referidos',
        rules: { ...base(i), segments: ['nuevo'], minFuelCents: 30_000 }, benefit: { type: 'virtual_money', amountCents: 5_000, walletExpiresDays: 30 },
        limits: { maxPerCustomer: 1, maxPerMonth: 5 }, stackable: false, priority: 55, inventoryInitial: 1_000,
        rationale: 'Premio a referente y referido solo cuando el nuevo completa una carga pagada.', kpi: 'Costo por cliente nuevo activo a 90 días.', estimatedCostCents: 10_000, risk: 'Autoreferidos: verificación y límite mensual.',
      });
      break;
    case 'recuperar_inactivos':
      add({
        name: 'Te extrañamos: 100 puntos extra', type: 'puntos',
        rules: { ...base(i), segments: ['inactivo'], minLitersMl: 15_000 }, benefit: { type: 'points', points: 100 },
        limits: { maxPerCustomer: 1 }, stackable: false, priority: 70, inventoryInitial: null,
        rationale: 'Mensaje de reactivación con grupo de control del 15 % para medir el efecto real.', kpi: '% de inactivos que cargan en 14 días frente a control.', estimatedCostCents: 1_000 + 80,
        risk: 'Clientes que esperan el cupón: no repetir antes de 90 días.',
      });
      break;
    case 'premium':
      add({
        name: 'Premium paga doble', type: 'puntos_dobles',
        rules: { ...base(i), fuelTypes: ['premium'], minLitersMl: 20_000 }, benefit: { type: 'points_multiplier', multiplier: 2 },
        limits: { maxPerDay: 1 }, stackable: true, priority: 40, inventoryInitial: null,
        rationale: 'Premium tiene mejor margen; el multiplicador cuesta 10 centavos por litro adicionales.', kpi: 'Mezcla Premium sobre litros totales.', estimatedCostCents: 700,
        risk: 'Registrar Regular como Premium en modo autónomo: cruzar con inventario por turno.',
      });
      break;
    case 'diesel':
      add({
        name: 'Diésel por volumen', type: 'volumen',
        rules: { ...base(i), fuelTypes: ['diesel'], minLitersMl: 100_000 }, benefit: { type: 'discount_per_liter', centsPerLiter: 15 },
        limits: { maxPerDay: 2, maxDiscountCents: 6_000 }, stackable: false, priority: 35, inventoryInitial: null,
        rationale: 'El transportista compara centavos por litro; descuento directo con tope.', kpi: 'Litros de diésel por cuenta al mes.', estimatedCostCents: 1_500, risk: 'Margen de diésel más bajo: tope por transacción.',
      });
      break;
    case 'tienda':
      add({
        name: 'Carga y café', type: 'cupon',
        rules: { ...base(i), minLitersMl: 30_000 }, benefit: { type: 'coupon', label: 'Café americano gratis', amountCents: 3_500, couponDays: 7 },
        limits: { maxPerDay: 1 }, stackable: true, priority: 30, inventoryInitial: 500,
        rationale: 'Lleva al cliente a la tienda, donde el margen es 30 a 60 %.', kpi: '% de cargas con compra en tienda.', estimatedCostCents: 1_400, risk: 'Bajo; inventario limitado.',
      });
      add({
        name: '2x1 en agua con tu carga', type: '2x1',
        rules: { ...base(i), minFuelCents: 30_000, requiresStore: true }, benefit: { type: 'two_for_one', label: 'agua 600 ml', amountCents: 1_500 },
        limits: { maxPerDay: 1 }, stackable: true, priority: 25, inventoryInitial: 1_000,
        rationale: 'Producto de alta rotación y bajo costo.', kpi: 'Ticket de tienda por visita.', estimatedCostCents: 600, risk: 'Bajo.',
      });
      break;
    case 'servicios':
      add({
        name: 'Combustible + lavado', type: 'asociados',
        rules: { ...base(i), minFuelCents: 60_000 }, benefit: { type: 'coupon', label: '$20 de descuento en lavado', amountCents: 2_000, couponDays: 14 },
        limits: { maxPerDay: 1 }, stackable: true, priority: 30, inventoryInitial: 300,
        rationale: 'El lavado tiene capacidad ociosa entre semana; el cupón la llena.', kpi: 'Lavados por semana y ticket combinado.', estimatedCostCents: 800, risk: 'Bajo.',
      });
      break;
    case 'fidelizar':
      add({
        name: 'VIP: puntos ×1.5 permanentes', type: 'puntos_dobles',
        rules: { ...base(i), segments: ['vip'] }, benefit: { type: 'points_multiplier', multiplier: 1.5 },
        limits: {}, stackable: true, priority: 10, inventoryInitial: null,
        rationale: 'Reconoce al 15 % que más carga sin regalar a todos.', kpi: 'Retención a 6 meses del segmento VIP.', estimatedCostCents: 200, risk: 'Bajo.',
      });
      add({
        name: 'Cumpleaños: lavado gratis', type: 'cupon',
        rules: { ...base(i) }, benefit: { type: 'coupon', label: 'Lavado básico gratis', amountCents: 6_000, couponDays: 15 },
        limits: { maxPerCustomer: 1 }, stackable: true, priority: 15, inventoryInitial: null,
        rationale: 'Se emite automáticamente por la notificación de cumpleaños.', kpi: 'Tasa de canje.', estimatedCostCents: 2_000, risk: 'Fecha falsa: se fija una vez.',
      });
      break;
    case 'pagos_digitales':
      add({
        name: 'Paga digital y recibe cashback', type: 'cashback',
        rules: { ...base(i), paymentMethods: ['digital', 'tarjeta'], minFuelCents: 30_000 }, benefit: { type: 'cashback_percent', percent: 2, walletExpiresDays: 30 },
        limits: { maxPerDay: 1, maxDiscountCents: 3_000 }, stackable: true, priority: 30, inventoryInitial: null,
        rationale: 'Reduce manejo de efectivo; el cashback vuelve como dinero virtual.', kpi: '% de transacciones digitales.', estimatedCostCents: 1_200, risk: 'Tope por transacción para diésel.',
      });
      break;
  }
  return out;
}

export function objectiveLabel(o: Objective): string { return OBJECTIVE_LABELS[o]; }
