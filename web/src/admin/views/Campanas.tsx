import { useEffect, useState, type FormEvent } from 'react';
import { litros, pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, errorText, fmtDate, fmtNum, fmtPct, fmtRoi, fromLocalInput, toCents, toLocalInput, type Campaign, type CampaignEvaluation, type CampaignInput, type CampaignStatus, type PeriodMetrics } from '../api';
import { Empty, ErrorBox, Field, Head, InventoryBar, Loading, StatusPill, Term, useLoad } from '../ui';

export function Campanas() {
  const { t } = useT();
  const { token, takeFocus } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => adminApi<Campaign[]>('/campaigns', token), [token]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => { const f = takeFocus(); if (f) setOpen(f); }, [takeFocus]);

  async function setStatus(id: string, status: CampaignStatus) {
    setBusy(id); setActionError(null);
    try { await adminApi(`/campaigns/${id}`, token, { method: 'PATCH', body: { status } }); reload(); }
    catch (e) { setActionError(errorText(e)); } finally { setBusy(null); }
  }

  if (error) return <><Head title={t('Campañas')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Campañas')} /><Loading /></>;
  const list = filter ? data.filter((c) => c.status === filter) : data;
  const current = open ? data.find((c) => c.id === open) : null;

  if (current) return <CampaignDetail campaign={current} onBack={() => setOpen(null)} onStatus={(s) => setStatus(current.id, s)} busy={busy === current.id} />;

  return (
    <div className={`admin-main${loading ? ' dim' : ''}`}>
      <Head title={t('Campañas')} sub={t('Una campaña agrupa promociones con un objetivo, una vigencia y un presupuesto.')}
        desc={t('Por ejemplo: “Verano 2026” con tres promociones para subir el ticket promedio. Al terminar, la evaluación te dice si funcionó comparando antes, durante y después.')}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Filtrar por estado')}>
          <option value="">{t('Todos los estados')}</option><option value="draft">{t('Borrador')}</option><option value="scheduled">{t('Programada')}</option><option value="active">{t('Activa')}</option><option value="paused">{t('Pausada')}</option><option value="ended">{t('Terminada')}</option>
        </select>
        <button className="btn primary" onClick={() => setCreating((v) => !v)}>{creating ? t('Cerrar formulario') : t('Nueva campaña')}</button>
      </Head>
      {actionError && <div className="alert error">{actionError}</div>}
      {creating && <CampaignForm onDone={() => { setCreating(false); reload(); }} />}
      {list.length === 0 && (data.length === 0
        ? <Empty icon="megaphone" title={t('Todavía no hay campañas')} text={t('Crea la primera para agrupar tus promociones y medir si funcionan.')} action={<button className="btn sm primary" onClick={() => setCreating(true)}>{t('Nueva campaña')}</button>} />
        : <Empty icon="search" title={t('No hay campañas con ese estado')} text={t('Prueba con otro filtro.')} />)}
      <div className="list">
        {list.map((c) => (
          <div key={c.id} className="item">
            <div className="row between">
              <div className="row"><span className="title">{c.name}</span><StatusPill status={c.status} kind="campaign" /></div>
              <div className="actions">
                {(c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused') && <button className="btn sm" disabled={busy === c.id} onClick={() => setStatus(c.id, 'active')}>{t('Activar')}</button>}
                {c.status === 'active' && <button className="btn sm" disabled={busy === c.id} onClick={() => setStatus(c.id, 'paused')}>{t('Pausar')}</button>}
                {c.status !== 'ended' && <button className="btn sm danger" disabled={busy === c.id} onClick={() => { if (confirm(t('¿Terminar la campaña "{name}"? Sus promociones activas también terminan.', { name: c.name }))) setStatus(c.id, 'ended'); }}>{t('Terminar')}</button>}
                <button className="btn sm primary" onClick={() => setOpen(c.id)}>{t('Detalle y evaluación')}</button>
              </div>
            </div>
            {c.description && <p className="muted small" style={{ margin: 0 }}>{c.description}</p>}
            <div className="meta">
              <span>{t('Objetivo:')} <b style={{ fontFamily: 'var(--sans)' }}>{c.objectiveLabel}</b></span>
              <span>{t('Vigencia:')} <b>{fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}</b></span>
              <span>{t('Promociones:')} <b>{c.promotions.length}</b></span>
              <span>{t('Usos:')} <b>{fmtNum(c.usage.uses)}</b></span>
              <span>{t('Costo:')} <b>{pesos(c.usage.costCents)}</b></span>
              {c.budgetCents !== null && <span>{t('Presupuesto:')} <b>{pesos(c.budgetCents)}</b></span>}
              <span>{t('Clientes:')} <b>{fmtNum(c.usage.members)}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const { token, catalog } = useAdmin();
  const [f, setF] = useState({ name: '', description: '', objective: catalog.objectives[0]?.key ?? 'ticket_promedio', status: 'draft' as CampaignStatus, startsAt: toLocalInput(new Date().toISOString()), endsAt: toLocalInput(new Date(Date.now() + 30 * 86_400_000).toISOString()), budget: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    const body: CampaignInput = { name: f.name, description: f.description, objective: f.objective, status: f.status, startsAt: fromLocalInput(f.startsAt) ?? new Date().toISOString(), endsAt: fromLocalInput(f.endsAt) ?? new Date().toISOString(), budgetCents: toCents(f.budget) };
    try { await adminApi('/campaigns', token, { body }); onDone(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  }
  return (
    <form className="card accent" onSubmit={submit}>
      <h3>{t('Nueva campaña')}</h3>
      <div className="form-grid">
        <Field label={t('Nombre')} className="span-2"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Verano 2026')} /></Field>
        <Field label={t('Objetivo')}><select value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })}>{catalog.objectives.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
        <Field label={t('Estado inicial')}><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CampaignStatus })}><option value="draft">{t('Borrador')}</option><option value="scheduled">{t('Programada')}</option><option value="active">{t('Activa')}</option></select></Field>
        <Field label={t('Fecha inicial')}><input type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label={t('Fecha final')}><input type="datetime-local" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label={t('Presupuesto (MXN)')} className="num"><input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder={t('Opcional')} /></Field>
        <Field label={t('Descripción')} className="span-all"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row"><button className="btn primary" disabled={saving}>{saving ? t('Guardando…') : t('Crear campaña')}</button></div>
    </form>
  );
}

const VERDICT_TONE: Record<string, string> = { funciono: 'ok', parcial: 'warn', sin_impacto: 'neutral', perdidas: 'crit', sin_datos: 'violet' };

function CampaignDetail({ campaign: c, onBack, onStatus, busy }: { campaign: Campaign; onBack: () => void; onStatus: (s: CampaignStatus) => void; busy: boolean }) {
  const { t } = useT();
  const { token, go } = useAdmin();
  const { data: ev, error, reload } = useLoad(() => adminApi<CampaignEvaluation>(`/campaigns/${c.id}/evaluation`, token), [token, c.id, c.status]);
  return (
    <div className="admin-main">
      <Head title={c.name} sub={`${c.objectiveLabel} · ${fmtDate(c.startsAt, true)} → ${fmtDate(c.endsAt, true)}`}>
        <StatusPill status={c.status} kind="campaign" />
        {(c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused') && <button className="btn sm" disabled={busy} onClick={() => onStatus('active')}>{t('Activar')}</button>}
        {c.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => onStatus('paused')}>{t('Pausar')}</button>}
        {c.status !== 'ended' && <button className="btn sm danger" disabled={busy} onClick={() => { if (confirm(t('¿Terminar la campaña?'))) onStatus('ended'); }}>{t('Terminar')}</button>}
        <button className="btn sm" onClick={onBack}>← {t('Campañas')}</button>
      </Head>
      {c.description && <p className="muted" style={{ margin: 0 }}>{c.description}</p>}

      <div className="card tbl">
        <div className="row between"><h3>{t('Promociones de la campaña ({n})', { n: c.promotions.length })}</h3><button className="btn sm" onClick={() => go('promociones', `new:${c.id}`)}>{t('Agregar promoción')}</button></div>
        {c.promotions.length === 0 ? <p className="muted small">{t('Sin promociones. Agrega una desde Promociones o el Generador.')}</p> : (
          <table>
            <thead><tr><th>{t('Promoción')}</th><th>{t('Tipo')}</th><th>{t('Condición')}</th><th>{t('Estado')}</th><th>{t('Existencias')}</th><th className="num">{t('Prioridad')}</th></tr></thead>
            <tbody>{c.promotions.map((p) => (
              <tr key={p.id}>
                <td><button className="link" onClick={() => go('promociones', p.id)}>{p.name}</button>{p.stackable && <> <span className="pill neutral">{t('acumulable')}</span></>}</td>
                <td>{p.typeLabel}</td><td className="small">{p.condition}</td><td><StatusPill status={p.status} /></td>
                <td><InventoryBar inv={p.inventory} compact /></td><td className="num">{p.priority}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row between"><h3>{t('Evaluación: antes · durante · después')}</h3>{ev && <span className="muted small">{t('Comparación por periodos de la misma duración')}</span>}</div>
        {error && <ErrorBox text={error} onRetry={reload} />}
        {!ev && !error && <Loading text={t('Calculando evaluación…')} />}
        {ev && <Evaluation ev={ev} />}
      </div>
    </div>
  );
}

function Evaluation({ ev }: { ev: CampaignEvaluation }) {
  const { t, locale } = useT();
  const { before, during, after } = ev.periods;
  const row = (label: string, f: (p: PeriodMetrics) => string, variation?: string) => (
    <>
      <div>{label}{variation && <> <span className="pill neutral">{variation}</span></>}</div>
      <div className="n">{f(before)}</div><div className="n during">{f(during)}</div><div className="n">{after ? f(after) : <span className="muted">—</span>}</div>
    </>
  );
  const e = ev.economics;
  const subStyle = { fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 };
  return (
    <>
      <div className={`verdict ${ev.verdict}`}>
        <div className="row"><span className={`pill ${VERDICT_TONE[ev.verdict]}`}>{t('Veredicto')}</span><span className="big">{ev.verdictLabel}</span></div>
        <div><b>{t('Recomendación:')}</b> {ev.recommendation}</div>
        <div className="muted small">{ev.explanation}</div>
      </div>
      <div className="abc">
        <div className="h">{t('Indicador')}</div><div className="h n">{t('Antes')}<br /><span className="muted" style={subStyle}>{t('{n} días', { n: before.days })}</span></div><div className="h n during">{t('Durante')}<br /><span className="muted" style={subStyle}>{t('{n} días', { n: during.days })}</span></div><div className="h n">{t('Después')}<br /><span className="muted" style={subStyle}>{after ? t('{n} días', { n: after.days }) : t('aún no termina')}</span></div>
        {row(t('Ticket promedio'), (p) => pesos(p.avgTicketCents), fmtPct(ev.variation.avgTicketPct))}
        {row(t('Litros promedio por carga'), (p) => litros(p.avgLitersMl), fmtPct(ev.variation.avgLitersPct))}
        {row(t('Transacciones por día'), (p) => p.txPerDay.toLocaleString(locale), fmtPct(ev.variation.transactionsPerDayPct))}
        {row(t('Transacciones'), (p) => fmtNum(p.transactions))}
        {row(t('Clientes nuevos'), (p) => fmtNum(p.newCustomers), `${ev.variation.newCustomers >= 0 ? '+' : ''}${ev.variation.newCustomers}`)}
        {row(t('Clientes recurrentes'), (p) => fmtNum(p.recurringCustomers), `${ev.variation.recurringCustomers >= 0 ? '+' : ''}${ev.variation.recurringCustomers}`)}
        {row(t('Participantes en promociones'), (p) => fmtNum(p.participants))}
        {row(t('Beneficios entregados'), (p) => fmtNum(p.benefitsDelivered))}
        {row(t('Costo de beneficios'), (p) => pesos(p.benefitsCostCents))}
        {row(t('Ingresos'), (p) => pesos(p.salesCents))}
        {row(t('Dinero virtual emitido'), (p) => pesos(p.walletIssuedCents))}
      </div>
      <div className="kpis">
        <div className="kpi"><span className="label">{t('Costo de beneficios')}</span><span className="value">{pesos(e.benefitsCostCents)}</span><span className="sub">{t('{n} beneficios', { n: fmtNum(e.benefitsDelivered) })}{e.budgetUsedPct !== null && ` · ${t('{pct} % del presupuesto', { pct: e.budgetUsedPct })}`}</span></div>
        <div className="kpi"><span className="label">{t('Ingresos durante')}</span><span className="value">{pesos(e.revenueCents)}</span><span className="sub">{t('antes {amount}', { amount: pesos(e.revenueBeforeCents) })}</span></div>
        <div className="kpi"><span className="label"><Term k="margen">{t('Margen incremental estimado')}</Term></span><span className="value">{pesos(e.incrementalMarginCents)}</span><span className="sub">{t('litros y tienda vs periodo anterior')}</span></div>
        <div className="kpi"><span className="label"><Term k="roi">{t('ROI')}</Term></span><span className="value">{fmtRoi(e.roi)}</span><span className="sub">{t('(margen incremental − costo) ÷ costo')}</span></div>
      </div>
      {ev.promotions.length > 0 && (
        <div className="tbl"><table>
          <thead><tr><th>{t('Promoción')}</th><th>{t('Tipo')}</th><th>{t('Estado')}</th><th className="num">{t('Usos')}</th><th className="num">{t('Clientes')}</th><th className="num">{t('Costo')}</th></tr></thead>
          <tbody>{ev.promotions.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.typeLabel}</td><td><StatusPill status={p.status} /></td><td className="num">{fmtNum(p.uses)}</td><td className="num">{fmtNum(p.members)}</td><td className="num">{pesos(p.cost)}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="muted small" style={{ margin: 0 }}>{ev.note}</p>
    </>
  );
}
