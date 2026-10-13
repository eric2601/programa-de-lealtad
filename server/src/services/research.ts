import { z } from 'zod';
import type { Ctx } from '../context.js';
import { audit, iso, newId } from '../context.js';
import { all, one, run } from '../db.js';
import { notFound } from '../errors.js';

/** Tipos de campaña que se registran en la investigación (sección 1). */
export const RESEARCH_TYPES = [
  'precio', 'descuento_litro', 'tarjeta_bancaria', 'cashback', 'puntos', 'temporada', 'verano', 'regreso_clases', 'buen_fin', 'navidad',
  'semana_santa', 'vacaciones', 'flotillas', 'taxis_plataformas', 'combustible_tienda', 'combustible_lavado', 'aliados',
] as const;
export const RESEARCH_TYPE_LABELS: Record<typeof RESEARCH_TYPES[number], string> = {
  precio: 'Promoción por precio', descuento_litro: 'Descuento por litro', tarjeta_bancaria: 'Tarjetas bancarias', cashback: 'Cashback', puntos: 'Programa de puntos',
  temporada: 'Temporada', verano: 'Verano', regreso_clases: 'Regreso a clases', buen_fin: 'Buen Fin', navidad: 'Navideña', semana_santa: 'Semana Santa',
  vacaciones: 'Vacaciones', flotillas: 'Flotillas', taxis_plataformas: 'Taxis y plataformas', combustible_tienda: 'Combustible + tienda',
  combustible_lavado: 'Combustible + lavado', aliados: 'Aliados comerciales',
};

export const researchSchema = z.object({
  competitor: z.string().trim().min(1), name: z.string().trim().min(1), type: z.enum(RESEARCH_TYPES), benefit: z.string().trim().min(1),
  startDate: z.string().nullable().default(null), endDate: z.string().nullable().default(null),
  region: z.string().nullable().default(null), state: z.string().nullable().default(null), city: z.string().nullable().default(null), station: z.string().nullable().default(null),
  audience: z.string().nullable().default(null), validityText: z.string().nullable().default(null),
  resultRating: z.number().int().min(1).max(5).nullable().default(null), resultNotes: z.string().nullable().default(null),
  estimatedCostCents: z.number().int().nonnegative().nullable().default(null), sourceUrl: z.string().nullable().default(null), verified: z.boolean().default(false),
});

const toView = (r: Record<string, unknown>) => ({
  id: r.id, competitor: r.competitor, name: r.name, type: r.type, typeLabel: RESEARCH_TYPE_LABELS[r.type as keyof typeof RESEARCH_TYPE_LABELS] ?? r.type, benefit: r.benefit,
  startDate: r.start_date, endDate: r.end_date, region: r.region, state: r.state, city: r.city, station: r.station, audience: r.audience, validityText: r.validity_text,
  resultRating: r.result_rating, resultNotes: r.result_notes, estimatedCostCents: r.estimated_cost_cents, sourceUrl: r.source_url, verified: !!r.verified, createdAt: r.created_at,
});

export function list(ctx: Ctx, tenantId: string, filter: { type?: string; state?: string; competitor?: string } = {}) {
  const where = ['tenant_id = ?']; const params: unknown[] = [tenantId];
  if (filter.type) { where.push('type = ?'); params.push(filter.type); }
  if (filter.state) { where.push('state = ?'); params.push(filter.state); }
  if (filter.competitor) { where.push('competitor = ?'); params.push(filter.competitor); }
  return all<Record<string, unknown>>(ctx.db, `SELECT * FROM research_campaigns WHERE ${where.join(' AND ')} ORDER BY COALESCE(start_date, created_at) DESC`, ...params).map(toView);
}

export function create(ctx: Ctx, tenantId: string, actorUserId: string | null, input: unknown) {
  const d = researchSchema.parse(input);
  const id = newId();
  run(ctx.db,
    `INSERT INTO research_campaigns (id, tenant_id, competitor, name, type, benefit, start_date, end_date, region, state, city, station, audience, validity_text, result_rating, result_notes, estimated_cost_cents, source_url, verified, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, tenantId, d.competitor, d.name, d.type, d.benefit, d.startDate, d.endDate, d.region, d.state, d.city, d.station, d.audience, d.validityText, d.resultRating, d.resultNotes, d.estimatedCostCents, d.sourceUrl, d.verified ? 1 : 0, iso(ctx.now()));
  audit(ctx, tenantId, actorUserId, 'research.create', 'research', id);
  return toView(one<Record<string, unknown>>(ctx.db, 'SELECT * FROM research_campaigns WHERE id = ?', id)!);
}

export function remove(ctx: Ctx, tenantId: string, actorUserId: string | null, id: string): void {
  const r = one(ctx.db, 'SELECT id FROM research_campaigns WHERE tenant_id = ? AND id = ?', tenantId, id);
  if (!r) throw notFound('RESEARCH_NOT_FOUND', 'No encontramos ese registro.');
  run(ctx.db, 'DELETE FROM research_campaigns WHERE id = ?', id);
  audit(ctx, tenantId, actorUserId, 'research.delete', 'research', id);
}

/** Comparativa: qué tipos y competidores muestran mejores resultados registrados. */
export function summary(ctx: Ctx, tenantId: string) {
  const byType = all<{ type: string; n: number; rating: number | null; cost: number | null; verified: number }>(ctx.db,
    `SELECT type, COUNT(*) AS n, AVG(result_rating) AS rating, AVG(estimated_cost_cents) AS cost, SUM(verified) AS verified FROM research_campaigns WHERE tenant_id = ? GROUP BY type ORDER BY rating DESC, n DESC`, tenantId);
  const byCompetitor = all<{ competitor: string; n: number; rating: number | null }>(ctx.db,
    `SELECT competitor, COUNT(*) AS n, AVG(result_rating) AS rating FROM research_campaigns WHERE tenant_id = ? GROUP BY competitor ORDER BY n DESC`, tenantId);
  const byState = all<{ state: string; n: number }>(ctx.db, `SELECT state, COUNT(*) AS n FROM research_campaigns WHERE tenant_id = ? AND state IS NOT NULL GROUP BY state ORDER BY n DESC`, tenantId);
  const best = byType.filter((t) => t.rating !== null).slice(0, 3).map((t) => RESEARCH_TYPE_LABELS[t.type as keyof typeof RESEARCH_TYPE_LABELS] ?? t.type);
  return {
    byType: byType.map((t) => ({ type: t.type, label: RESEARCH_TYPE_LABELS[t.type as keyof typeof RESEARCH_TYPE_LABELS] ?? t.type, count: t.n, avgRating: t.rating === null ? null : Math.round(t.rating * 10) / 10, avgCostCents: t.cost === null ? null : Math.round(t.cost), verified: t.verified })),
    byCompetitor: byCompetitor.map((c) => ({ competitor: c.competitor, count: c.n, avgRating: c.rating === null ? null : Math.round(c.rating * 10) / 10 })),
    byState,
    insight: best.length ? `Con la evidencia registrada, los tipos con mejor resultado son: ${best.join(', ')}. Las calificaciones son del equipo, no de la competencia; conviene validarlas con el piloto.` : 'Registra campañas con calificación de resultado para obtener comparativas.',
  };
}
