import { useState, type FormEvent } from 'react';
import { pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, errorText, fmtDate, toCents, type ResearchInput, type ResearchResponse } from '../api';
import { HBarChart } from '../charts';
import { Empty, ErrorBox, Field, Head, Loading, Stars, useLoad } from '../ui';

const EMPTY: ResearchInput = { competitor: '', name: '', type: 'precio', benefit: '', startDate: null, endDate: null, region: null, state: null, city: null, station: null, audience: null, validityText: null, resultRating: null, resultNotes: null, estimatedCostCents: null, sourceUrl: null, verified: false };
const nz = (s: string) => (s.trim() === '' ? null : s.trim());

export function Investigacion() {
  const { t, locale } = useT();
  const { token, catalog } = useAdmin();
  const [type, setType] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [state, setState] = useState('');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const qs = new URLSearchParams(); if (type) qs.set('type', type); if (competitor) qs.set('competitor', competitor); if (state) qs.set('state', state);
  const { data, error, loading, reload } = useLoad(() => adminApi<ResearchResponse>(`/research${qs.toString() ? `?${qs}` : ''}`, token), [token, type, competitor, state]);

  async function remove(id: string, name: string) {
    if (!confirm(t('¿Eliminar el registro "{name}"?', { name }))) return;
    setActionError(null);
    try { await adminApi(`/research/${id}`, token, { method: 'DELETE' }); reload(); } catch (e) { setActionError(errorText(e)); }
  }

  if (error) return <><Head title={t('Investigación de mercado')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Investigación de mercado')} /><Loading /></>;
  const s = data.summary;

  return (
    <div className={`admin-main${loading ? ' dim' : ''}`}>
      <Head title={t('Competencia')} sub={t('Campañas de la competencia registradas por el equipo, con calificación de resultado para comparar tipos y competidores.')}
        desc={t('Anota lo que hacen otras gasolineras (precio, puntos, regalos…) y califica de 1 a 5 qué tan bien les funcionó. Con el tiempo verás qué tipo de promoción da mejores resultados en tu zona.')}>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? t('Cerrar formulario') : t('Registrar campaña')}</button>
      </Head>
      {actionError && <div className="alert error">{actionError}</div>}
      {adding && <ResearchForm onDone={() => { setAdding(false); reload(); }} />}

      <div className="grid-2">
        <HBarChart title={t('Resultado promedio por tipo')} sub={t('calificación 1–5 del equipo')} items={s.byType.filter((x) => x.avgRating !== null).map((x) => ({ label: x.label, value: x.avgRating ?? 0, sub: t('{n} registros · {v} verificados', { n: x.count, v: x.verified }) }))} fmt={(v) => v.toLocaleString(locale, { maximumFractionDigits: 1 })} seriesName={t('Calificación')} max={12} />
        <div className="admin-main">
          <HBarChart title={t('Registros por tipo')} items={s.byType.map((x) => ({ label: x.label, value: x.count }))} seriesName={t('Registros')} max={12} />
          <div className="card">
            <h3>{t('Por competidor')}</h3>
            {s.byCompetitor.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{t('Sin registros.')}</p> : <table><thead><tr><th>{t('Competidor')}</th><th className="num">{t('Registros')}</th><th>{t('Resultado')}</th></tr></thead><tbody>{s.byCompetitor.map((c) => <tr key={c.competitor}><td><button className="link" onClick={() => setCompetitor(c.competitor === competitor ? '' : c.competitor)}>{c.competitor}</button></td><td className="num">{c.count}</td><td><Stars n={c.avgRating === null ? null : Math.round(c.avgRating)} /> {c.avgRating !== null && <span className="muted small">{c.avgRating}</span>}</td></tr>)}</tbody></table>}
          </div>
        </div>
      </div>
      <div className="alert info">{s.insight}</div>

      <div className="card tbl">
        <div className="filters">
          <label className="field">{t('Tipo')}<select value={type} onChange={(e) => setType(e.target.value)}><option value="">{t('Todos')}</option>{catalog.researchTypes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label className="field">{t('Competidor')}<select value={competitor} onChange={(e) => setCompetitor(e.target.value)}><option value="">{t('Todos')}</option>{s.byCompetitor.map((c) => <option key={c.competitor} value={c.competitor}>{c.competitor}</option>)}</select></label>
          <label className="field">{t('Entidad federativa')}<select value={state} onChange={(e) => setState(e.target.value)}><option value="">{t('Todos')}</option>{s.byState.map((c) => <option key={c.state} value={c.state}>{c.state}</option>)}</select></label>
          <span className="muted small">{t('{n} registros', { n: data.items.length })}</span>
        </div>
        <table>
          <thead><tr><th>{t('Competidor')}</th><th>{t('Campaña')}</th><th>{t('Tipo')}</th><th>{t('Beneficio')}</th><th>{t('Fechas')}</th><th>{t('Región / estado / ciudad')}</th><th>{t('Público')}</th><th>{t('Resultado')}</th><th className="num">{t('Costo est.')}</th><th></th></tr></thead>
          <tbody>{data.items.map((r) => (
            <tr key={r.id}>
              <td>{r.competitor}</td>
              <td><b>{r.name}</b>{r.verified && <> <span className="pill ok">{t('Verificada')}</span></>}{r.sourceUrl && <div><a className="link small" href={r.sourceUrl} target="_blank" rel="noreferrer">{t('fuente')}</a></div>}</td>
              <td>{r.typeLabel}</td><td className="small">{r.benefit}</td>
              <td className="small">{r.startDate || r.endDate ? `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` : r.validityText ?? '—'}</td>
              <td className="small">{[r.region, r.state, r.city].filter(Boolean).join(' / ') || '—'}{r.station && <div className="muted">{r.station}</div>}</td>
              <td className="small">{r.audience ?? '—'}</td>
              <td><Stars n={r.resultRating} />{r.resultNotes && <div className="muted small">{r.resultNotes}</div>}</td>
              <td className="num">{r.estimatedCostCents === null ? '—' : pesos(r.estimatedCostCents)}</td>
              <td><button className="btn sm danger" onClick={() => remove(r.id, r.name)}>{t('Eliminar')}</button></td>
            </tr>
          ))}</tbody>
        </table>
        {data.items.length === 0 && <Empty icon="search" title={t('Sin registros con esos filtros')} text={t('Registra una campaña de la competencia o cambia los filtros.')} action={<button className="btn sm primary" onClick={() => setAdding(true)}>{t('Registrar campaña')}</button>} />}
      </div>
    </div>
  );
}

function ResearchForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const { token, catalog } = useAdmin();
  const [f, setF] = useState({ ...EMPTY, type: catalog.researchTypes[0]?.key ?? 'precio', cost: '', rating: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    const { cost, rating, ...rest } = f;
    const body: ResearchInput = { ...rest, estimatedCostCents: toCents(cost), resultRating: rating ? Number(rating) : null };
    try { await adminApi('/research', token, { body }); onDone(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  }
  const text = (key: keyof ResearchInput, label: string, placeholder?: string) => (
    <Field label={label}><input value={(f[key] as string | null) ?? ''} onChange={(e) => set({ [key]: nz(e.target.value) } as Partial<typeof f>)} placeholder={placeholder} /></Field>
  );
  return (
    <form className="card accent" onSubmit={submit}>
      <h3>{t('Registrar campaña de la competencia')}</h3>
      <div className="form-grid">
        <Field label={t('Competidor')}><input required value={f.competitor} onChange={(e) => set({ competitor: e.target.value })} placeholder={t('Marca o grupo')} /></Field>
        <Field label={t('Nombre de la campaña')}><input required value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t('Tipo')}><select value={f.type} onChange={(e) => set({ type: e.target.value })}>{catalog.researchTypes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
        <Field label={t('Beneficio ofrecido')}><input required value={f.benefit} onChange={(e) => set({ benefit: e.target.value })} placeholder={t('$1 por litro los martes')} /></Field>
        <Field label={t('Fecha inicial')}><input type="date" value={f.startDate ?? ''} onChange={(e) => set({ startDate: nz(e.target.value) })} /></Field>
        <Field label={t('Fecha final')}><input type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: nz(e.target.value) })} /></Field>
        {text('region', t('Región'))}{text('state', t('Entidad federativa'))}{text('city', t('Ciudad'))}{text('station', t('Estación'))}
        {text('audience', t('Público objetivo'), t('Taxis, flotillas, público general'))}{text('validityText', t('Vigencia (texto)'), t('Todo el verano'))}
        <Field label={t('Resultado (1–5)')}><select value={f.rating} onChange={(e) => set({ rating: e.target.value })}><option value="">{t('Sin calificar')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select></Field>
        <Field label={t('Costo estimado (MXN)')} className="num"><input inputMode="decimal" value={f.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>
        {text('sourceUrl', t('Fuente (URL)'), 'https://')}
        <div className="field" style={{ justifyContent: 'end' }}><span>{t('Verificación')}</span><label className="switch"><input type="checkbox" checked={f.verified} onChange={(e) => set({ verified: e.target.checked })} />{t('Verificada en campo')}</label></div>
        <Field label={t('Notas del resultado')} className="span-all"><textarea value={f.resultNotes ?? ''} onChange={(e) => set({ resultNotes: nz(e.target.value) })} /></Field>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row"><button className="btn primary" disabled={saving}>{saving ? t('Guardando…') : t('Guardar registro')}</button></div>
    </form>
  );
}
