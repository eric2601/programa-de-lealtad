import type { Benefit, PromoRules } from '../promo/types.js';

/**
 * Promociones demo por tipo de vehículo (el tipo sale de la placa). Sirven de ejemplo para el panel:
 * cada una muestra una mecánica distinta.
 */
export const VEHICLE_PROMOS: Array<{ name: string; type: string; objective: string; rules: PromoRules; benefit: Benefit; limits?: Record<string, number>; priority?: number; stackable?: boolean }> = [
  {
    name: 'Motos: carga desde 4 litros y gana 20 puntos extra',
    type: 'puntos', objective: 'frecuencia',
    rules: { vehicleKinds: ['moto'], minLitersMl: 4_000 },
    benefit: { type: 'points', points: 20 },
    limits: { maxPerDay: 1 }, priority: 50,
  },
  {
    name: 'Taxis y autos de servicio público: puntos dobles de lunes a viernes',
    type: 'puntos_dobles', objective: 'litros',
    rules: { vehicleKinds: ['auto_publico'], daysOfWeek: [1, 2, 3, 4, 5] },
    benefit: { type: 'points_multiplier', multiplier: 2 },
    limits: { maxPerDay: 2 }, priority: 50,
  },
  {
    name: 'Camiones y autobuses: 30 centavos menos por litro de diésel desde 80 litros',
    type: 'descuento_litro', objective: 'litros',
    rules: { vehicleKinds: ['camion', 'autobus', 'camion_publico', 'autobus_publico'], fuelTypes: ['diesel'], minLitersMl: 80_000 },
    benefit: { type: 'discount_per_liter', centsPerLiter: 30 },
    limits: { maxDiscountCents: 10_000, maxPerDay: 2 }, priority: 55,
  },
  {
    name: 'Ambulancias y bomberos: 5% de descuento en cada carga',
    type: 'descuento_porcentaje', objective: 'litros',
    rules: { vehicleKinds: ['emergencia'] },
    benefit: { type: 'discount_percent', percent: 5 },
    limits: { maxDiscountCents: 15_000 }, priority: 60,
  },
  {
    name: 'Vehículos ecológicos: $25 de dinero virtual al cargar',
    type: 'dinero_virtual', objective: 'frecuencia',
    rules: { vehicleKinds: ['ecologico'] },
    benefit: { type: 'virtual_money', amountCents: 2_500, walletExpiresDays: 30 },
    limits: { maxPerMonth: 2 }, priority: 40,
  },
];
