import { useState } from 'react';
import { litros, pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, describeBenefit, fmtDate, fmtNum, fmtPct, fmtRoi, type PromotionDetail as Detail, type PromotionImpact } from '../api';
import { BarChart, describeTrend, fmtInt, fmtMoney } from '../charts';
import { CopyButton, ErrorBox, Head, InventoryBar, Loading, StatusPill, Term, useLoad, vigencia } from '../ui';
import { artFor } from '../../promoArt';

/** Nombres de formato publicitario en español; se traducen al dibujar. */
const AD_LABELS: Record<string, string> = {
  app: 'App', web: 'Sitio web', banner: 'Banner', pantalla_estacion: 'Pantalla de estación', pantalla_surtidor: 'Pantalla de surtidor', ticket: 'Ticket', whatsapp: 'WhatsApp',
  sms: 'SMS', email: 'Correo electrónico', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', push: 'Notificación push', qr: 'Código QR', cartel: 'Cartel',
};
type Tab = 'resumen' | 'impacto' | 'publicidad';
const TAB_LABELS: Record<Tab, string> = { resumen: 'Resumen', impacto: 'Impacto', publicidad: 'Publicidad' };

export function PromoDetail({ id, onBack, onEdit, onStatus, busy }: { id: string; onBack: () => void; onEdit: (p: Detail) => void; onStatus: (id: string, status: 'active' | 'paused' | 'ended') => Promise<void>; busy: boolean }) {
  const { t, locale } = useT();
  const { token, go } = useAdmin();
  const [tab, setTab] = useState<Tab>('resumen');
  const [tick, setTick] = useState(0);
  const { data: p, error, reload } = useLoad(() => adminApi<Detail>(`/promotions/${id}`, token), [token, id, tick]);
  const impact = useLoad(() => adminApi<PromotionImpact>(`/promotions/${id}/impact`, token), [token, id]);

  if (error) return <><Head title={t('Promoción')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!p) return <><Head title={t('Promoción')} /><Loading /></>;
  const act = async (s: 'active' | 'paused' | 'ended') => { await onStatus(p.id, s); setTick((x) => x + 1); };
  const im = impact.data;
  const ticketInsight = (i: PromotionImpact): string => {
    if (i.avgTicketBeforeCents <= 0) return t('No hay periodo anterior con qué comparar.');
    if (i.avgTicketDuringCents >= i.avgTicketBeforeCents) return t('Cada visita dejó {amount} más que antes ({pct}).', { amount: fmtMoney(i.avgTicketDuringCents - i.avgTicketBeforeCents), pct: fmtPct(i.avgTicketChangePct) });
    return t('Cada visita dejó {amount} menos que antes ({pct}); la promoción no está subiendo el gasto.', { amount: fmtMoney(i.avgTicketBeforeCents - i.avgTicketDuringCents), pct: fmtPct(i.avgTicketChangePct) });
  };

  return (
    <div className="admin-main">
      <Head title={p.name} sub={`${p.typeLabel} · ${p.objectiveLabel}`}>
        <StatusPill status={p.status} />
        {p.endsSoon && <span className="pill warn">{t('Vence pronto')}</span>}
        {(p.status === 'draft' || p.status === 'paused') && <button className="btn sm" disabled={busy} onClick={() => act('active')}>{t('Activar')}</button>}
        {p.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => act('paused')}>{t('Pausar')}</button>}
        {p.status !== 'ended' && <button className="btn sm danger" disabled={busy} onClick={() => { if (confirm(t('¿Terminar la promoción?'))) act('ended'); }}>{t('Terminar')}</button>}
        <button className="btn sm primary" onClick={() => onEdit(p)}>{t('Editar')}</button>
        <button className="btn sm" onClick={onBack}>← {t('Promociones')}</button>
      </Head>

      <div className="poster-row">
        <a href={artFor(p).file} target="_blank" rel="noreferrer" title={t('Abrir cartel en tamaño completo')}><img className="poster-preview" src={artFor(p).file} alt={artFor(p).title} /></a>
        <div style={{ display: 'grid', gap: '.6rem', alignContent: 'start' }}>
          <div className="promo-banner"><strong>{p.condition}</strong></div>
          <div className="muted small">{t('Cartel sugerido:')} <b>{artFor(p).title}</b> · {artFor(p).caption}. {t('Ábrelo para imprimirlo o compartirlo por WhatsApp.')}</div>
        </div>
      </div>

      <div className="subtabs" role="tablist">
        {(['resumen', 'impacto', 'publicidad'] as Tab[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(TAB_LABELS[k])}</button>)}
      </div>

      {tab === 'resumen' && (
        <>
          <div className="grid-2">
            <div className="card">
              <h3>{t('Reglas')}</h3>
              <div className="meta small" style={{ display: 'grid', gap: '.3rem' }}>
                <div><span className="muted">{t('Vigencia:')}</span> {vigencia(p.rules.startsAt, p.rules.endsAt)}</div>
                <div><span className="muted">{t('Beneficio:')}</span> {describeBenefit(p.benefit)}</div>
                <div><span className="muted">{t('Prioridad:')}</span> {p.priority} · <span className="muted">{t('Acumulable:')}</span> {p.stackable ? t('sí') : t('no')}</div>
                {p.stationNames.length > 0 && <div><span className="muted">{t('Estaciones:')}</span> {p.stationNames.join(', ')}</div>}
                {p.campaignId && <div><span className="muted">{t('Campaña:')}</span> <button className="link" onClick={() => go('campanas', p.campaignId)}>{t('ver campaña')}</button></div>}
                {p.excludes.length > 0 && <div><span className="muted">{t('Excluye:')}</span> {t('{n} promociones', { n: p.excludes.length })}</div>}
              </div>
              {p.rulesSummary.length > 0 ? <ul className="restr">{p.rulesSummary.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="muted small" style={{ margin: 0 }}>{t('Sin condiciones adicionales: aplica a cualquier carga.')}</p>}
              <h3>{t('Límites')}</h3>
              <div className="badge-row">
                <span className="pill neutral">{t('Totales:')} {p.limits.maxUses ?? '∞'}</span><span className="pill neutral">{t('Por cliente:')} {p.limits.maxPerCustomer ?? '∞'}</span>
                <span className="pill neutral">{t('Por día:')} {p.limits.maxPerDay ?? '∞'}</span><span className="pill neutral">{t('Por mes:')} {p.limits.maxPerMonth ?? '∞'}</span>
                <span className="pill neutral">{t('Descuento máx.:')} {p.limits.maxDiscountCents ? pesos(p.limits.maxDiscountCents) : t('sin tope')}</span>
              </div>
            </div>
            <div className="card">
              <h3>{t('Existencias')}</h3>
              {p.inventory.initial === null ? <p className="muted small" style={{ margin: 0 }}>{t('Sin límite de existencias. {n} beneficios entregados.', { n: fmtNum(p.inventoryUsed) })}</p> : (
                <>
                  <InventoryBar inv={p.inventory} />
                  <div className="kpis">
                    <div className="kpi"><span className="label">{t('Iniciales')}</span><span className="value">{fmtNum(p.inventory.initial)}</span></div>
                    <div className="kpi"><span className="label">{t('Disponibles')}</span><span className="value">{fmtNum(p.inventory.remaining ?? 0)}</span></div>
                    <div className="kpi"><span className="label">{t('Utilizadas')}</span><span className="value">{fmtNum(p.inventory.used)}</span><span className="sub">{t('{pct} % utilizado', { pct: p.inventory.percentUsed ?? 0 })}</span></div>
                    <div className="kpi"><span className="label">{t('Fecha de agotamiento')}</span><span className="value" style={{ fontSize: '1.05rem' }}>{p.inventory.exhaustedAt ? fmtDate(p.inventory.exhaustedAt, true) : t('Aún disponible')}</span></div>
                  </div>
                </>
              )}
              <h3>{t('Uso')}</h3>
              <div className="badge-row"><span className="pill">{t('{n} usos', { n: fmtNum(p.usage.uses) })}</span><span className="pill">{t('{n} clientes', { n: fmtNum(p.usage.members) })}</span><span className="pill">{t('costo {amount}', { amount: pesos(p.usage.costCents) })}</span></div>
              <BarChart title={t('¿Cuántas veces se usó cada día?')} data={p.usageByDay.map((d) => ({ label: d.day, values: [d.uses] }))} series={[{ name: t('Usos') }]} fmt={fmtInt} height={150} insight={describeTrend(p.usageByDay.map((d) => ({ label: d.day, values: [d.uses] })), fmtInt, 'usos')} />
            </div>
          </div>
          <div className="grid-2">
            <div className="card">
              <h3>{t('Restricciones')}</h3>
              <ul className="restr">{p.restrictions.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            <div className="card">
              <div className="row between"><h3>{t('Términos y condiciones')}</h3><CopyButton text={p.terms} /></div>
              <div className="terms">{p.terms}</div>
            </div>
          </div>
          {p.recentUsages.length > 0 && (
            <div className="card tbl">
              <h3>{t('Últimos usos')}</h3>
              <table>
                <thead><tr><th>{t('Fecha')}</th><th>{t('Cliente')}</th><th>{t('Estación')}</th><th>{t('Ticket')}</th><th className="num">{t('Combustible')}</th><th className="num">{t('Tienda')}</th><th className="num">{t('Costo')}</th></tr></thead>
                <tbody>{p.recentUsages.map((u, i) => <tr key={i}><td>{fmtDate(u.created_at, true)}</td><td>{u.first_name}</td><td>{u.station}</td><td className="mono small">{u.pos_reference}</td><td className="num">{pesos(u.fuel_cents)}</td><td className="num">{pesos(u.store_cents)}</td><td className="num">{pesos(u.cost_cents)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'impacto' && (
        <div className="card">
          <div className="row between"><h3>{t('Impacto sobre el ticket promedio')}</h3><span className="muted small">{t('Periodo antes de la misma duración que la vigencia')}</span></div>
          {impact.error && <ErrorBox text={impact.error} onRetry={impact.reload} />}
          {!im && !impact.error && <Loading text={t('Calculando impacto…')} />}
          {im && (
            <>
              <div className="kpis">
                <div className="kpi"><span className="label">{t('Ticket antes')}</span><span className="value">{pesos(im.avgTicketBeforeCents)}</span></div>
                <div className="kpi hero"><span className="label">{t('Ticket durante')}</span><span className="value">{pesos(im.avgTicketDuringCents)}</span><span className="sub">{t('incremento {pct}', { pct: fmtPct(im.avgTicketChangePct) })}</span></div>
                <div className="kpi"><span className="label">{t('Litros por carga')}</span><span className="value">{litros(im.avgLitersDuringMl)}</span><span className="sub">{t('antes {amount}', { amount: litros(im.avgLitersBeforeMl) })}</span></div>
                <div className="kpi"><span className="label">{t('Frecuencia (transacciones/día)')}</span><span className="value">{im.txPerDayDuring.toLocaleString(locale)}</span><span className="sub">{t('antes {amount}', { amount: im.txPerDayBefore.toLocaleString(locale) })}</span></div>
                <div className="kpi"><span className="label"><Term k="participantes">{t('Participantes')}</Term></span><span className="value">{fmtNum(im.participants)}</span></div>
                <div className="kpi"><span className="label">{t('Beneficios entregados')}</span><span className="value">{fmtNum(im.benefitsDelivered)}</span></div>
                <div className="kpi"><span className="label"><Term k="costo">{t('Costo')}</Term></span><span className="value">{pesos(im.costCents)}</span></div>
                <div className="kpi"><span className="label"><Term k="lift">{t('Incremento de ventas (lift)')}</Term></span><span className="value">{im.salesIncreaseCents < 0 ? '−' : '+'}{pesos(Math.abs(im.salesIncreaseCents))}</span><span className="sub">{t('normalizado por día')}</span></div>
                <div className="kpi"><span className="label"><Term k="margen">{t('Margen incremental')}</Term></span><span className="value">{pesos(im.incrementalMarginCents)}</span></div>
                <div className="kpi"><span className="label"><Term k="roi">{t('ROI')}</Term></span><span className="value">{fmtRoi(im.roi)}</span><span className="sub">{t('(margen − costo) ÷ costo')}</span></div>
              </div>
              <BarChart title={t('¿Subió el gasto por visita con la promoción?')} sub={t('ticket promedio antes y durante, en pesos')} data={[{ label: t('Antes'), title: t('Antes de la promoción'), values: [im.avgTicketBeforeCents] }, { label: t('Durante'), title: t('Durante la promoción'), values: [im.avgTicketDuringCents] }]} series={[{ name: t('Gasto por visita') }]} fmt={fmtMoney} height={160} labelLast markBest={false} insight={ticketInsight(im)} />
              <p className="muted small" style={{ margin: 0 }}>{t('La comparación no aísla estacionalidad ni competencia; para atribución causal se recomienda un grupo de control.')}</p>
            </>
          )}
        </div>
      )}

      {tab === 'publicidad' && (
        <>
          <div className="card">
            <h3>{t('Piezas base')}</h3>
            <div className="form-grid">
              <div><span className="muted small">{t('Título')}</span><div><b>{p.ads.title}</b></div></div>
              <div><span className="muted small">{t('Subtítulo')}</span><div>{p.ads.subtitle}</div></div>
              <div><span className="muted small">{t('Llamado a la acción')}</span><div>{p.ads.cta}</div></div>
              <div><span className="muted small">{t('Vigencia')}</span><div>{p.ads.validity}</div></div>
              <div className="span-2"><span className="muted small">{t('Descripción')}</span><div>{p.ads.description}</div></div>
            </div>
          </div>
          <div className="ads">
            {Object.entries(p.ads.formats).map(([k, text]) => (
              <div key={k} className="ad">
                <div className="ad-head"><b>{AD_LABELS[k] ? t(AD_LABELS[k]) : k}</b><CopyButton text={text} /></div>
                <pre>{text}</pre>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
