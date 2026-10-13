/**
 * Material gráfico de promociones: diez carteles verticales (recortados de la lámina
 * `docs/arte-original/promos-sheet.png`) y un cartel cuadrado. Cada promoción se asocia a un cartel por
 * palabras clave de su nombre y tipo; si nada coincide se usa el cartel genérico (10).
 */
export interface PromoArt { file: string; title: string; caption: string }

export const POSTERS: PromoArt[] = [
  { file: '/promos/promo-01.webp', title: 'Carga $500 y recibe $50', caption: 'Dinero virtual para la próxima visita' },
  { file: '/promos/promo-02.webp', title: 'Carga $800 y obtén $80 en cupón', caption: 'Escalera de consumo' },
  { file: '/promos/promo-03.webp', title: 'Tu segunda carga tiene $50 de descuento', caption: 'Bienvenida a clientes nuevos' },
  { file: '/promos/promo-04.webp', title: 'Carga $600 y participa por grandes premios', caption: 'Sorteos y Rasca y Gana' },
  { file: '/promos/promo-05.webp', title: 'Paga con tarjeta y recibe un beneficio adicional', caption: 'Pago digital o tarjeta' },
  { file: '/promos/promo-06.webp', title: 'Acumula puntos por cada litro', caption: 'Programa de puntos' },
  { file: '/promos/promo-07.webp', title: 'Carga 40 litros y recibe $50 de saldo', caption: 'Por litros cargados' },
  { file: '/promos/promo-08.webp', title: 'Martes de combustible', caption: 'Promoción por horario o día' },
  { file: '/promos/promo-09.webp', title: 'Carga gasolina + compra en tienda', caption: 'Combustible más tienda' },
  { file: '/promos/promo-10.webp', title: 'Carga hoy y gana beneficios para tu próxima visita', caption: 'Regresos y metas personales' },
];

export const POSTER_SQUARE = '/promos/poster-carga-500.webp';

/** Promociones creadas a partir de los carteles: nombre exacto → número de cartel. */
export const POSTER_BY_NAME: Record<string, number> = {
  'carga $500 y recibe $50 para tu próxima visita': 1,
  'carga $800 y obtén $80 en cupón para tu próxima visita': 2,
  'tu segunda carga tiene $50 de descuento': 3,
  'carga $600 y participa por grandes premios': 4,
  'paga con tarjeta y recibe un beneficio adicional': 5,
  'acumula puntos por cada litro y canjéalos por grandes beneficios': 6,
  'carga 40 litros y recibe $50 de saldo': 7,
  'martes de combustible: $50 de beneficio en tu carga': 8,
  'carga gasolina y compra en tienda: descuento especial': 9,
  'promoción por tiempo limitado: carga hoy y gana beneficios para tu próxima visita': 10,
};

/** Cartel que corresponde a una promoción según su nombre y tipo. */
export function artFor(p: { name: string; type?: string | null }): PromoArt {
  const n = p.name.toLowerCase();
  const t = (p.type ?? '').toLowerCase();
  const pick = (i: number) => POSTERS[i - 1];
  const exact = POSTER_BY_NAME[n.trim()];
  if (exact) return pick(exact);
  if (n.includes('meta personal') || n.includes('regres') || n.includes('cadena') || n.includes('tercera carga') || n.includes('tiempo limitado') || n.includes('buen fin')) return pick(10);
  if (n.includes('escalera') || n.includes('$800')) return pick(2);
  if (n.includes('segunda carga') || n.includes('nuevos') || n.includes('bienvenida')) return pick(3);
  if (n.includes('martes') || n.includes('jueves') || t === 'horario') return pick(8);
  if (n.includes('tarjeta') || n.includes('digital') || n.includes('cashback') || t === 'cashback') return pick(5);
  if (n.includes('tienda') || n.includes('café') || n.includes('lavado') || n.includes('2x1') || n.includes('agua')) return pick(9);
  if (n.includes('litros') || n.includes('motos') || t === 'volumen' || t === 'flotillas') return pick(7);
  if (n.includes('$600') || n.includes('rasca') || n.includes('premio') || t === 'sorteo') return pick(4);
  if (n.includes('punto') || t === 'puntos' || t === 'puntos_dobles' || n.includes('extrañamos')) return pick(6);
  if (n.includes('$500') && !n.includes('regres') && !n.includes('cadena') && !n.includes('tercera')) return pick(1);
  return pick(10);
}
