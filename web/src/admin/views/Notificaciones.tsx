import { useState } from 'react';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, errorText, fmtDate, fmtNum, type NotificationsResponse } from '../api';
import { Empty, ErrorBox, Head, Kpi, Loading, useLoad } from '../ui';

/** Etiquetas en español; se traducen al dibujar. */
const CHANNEL: Record<string, string> = { whatsapp_marketing: 'WhatsApp (marketing)', whatsapp_service: 'WhatsApp (servicio)', admin: 'Administración' };
const STATUS: Record<string, { label: string; tone: string }> = { sent: { label: 'Enviada', tone: 'ok' }, blocked_no_consent: { label: 'Sin consentimiento', tone: 'warn' }, failed: { label: 'Falló', tone: 'crit' }, pending: { label: 'Pendiente', tone: 'neutral' } };

export function Notificaciones() {
  const { t } = useT();
  const { token } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => adminApi<NotificationsResponse>('/notifications', token), [token]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');

  async function run() {
    setRunning(true); setResult(null);
    try { const r = await adminApi<{ created: number; skipped: number }>('/notifications/run', token, { body: {} }); setResult({ ok: true, text: t('Reglas ejecutadas: {created} notificaciones nuevas, {skipped} ya existían.', { created: r.created, skipped: r.skipped }) }); reload(); }
    catch (e) { setResult({ ok: false, text: errorText(e) }); } finally { setRunning(false); }
  }

  if (error) return <><Head title={t('Notificaciones')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Notificaciones')} /><Loading /></>;
  const items = data.items.filter((n) => (!kind || n.kind === kind) && (!status || n.status === status));
  const total = data.counts.reduce((a, c) => a + c.count, 0);

  return (
    <div className={`admin-main${loading ? ' dim' : ''}`}>
      <Head title={t('Notificaciones automáticas')} sub={t('Las de servicio llegan a todo miembro; las promocionales solo a quien autorizó publicidad. Cada regla evita duplicados.')}
        desc={t('Son los mensajes que el sistema manda solo por WhatsApp: dinero por vencer, premios nuevos, recordatorios. Aquí ves cuáles se enviaron y puedes ejecutarlos ahora.')}>
        <button className="btn primary" disabled={running} onClick={run}>{running ? t('Ejecutando…') : t('Ejecutar reglas ahora')}</button>
      </Head>
      {result && <div className={`alert ${result.ok ? 'ok' : 'error'}`}>{result.text}</div>}
      <section className="kpis" aria-label={t('Conteo por tipo')}>
        <Kpi hero label={t('Total')} value={fmtNum(total)} />
        {data.counts.map((c) => <Kpi key={c.kind} label={c.label} value={fmtNum(c.count)} />)}
      </section>
      <div className="card tbl">
        <div className="filters">
          <label className="field">{t('Tipo')}<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">{t('Todos')}</option>{data.counts.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}</select></label>
          <label className="field">{t('Estado')}<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('Todos')}</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}</select></label>
          <span className="muted small">{t('{shown} de {total} recientes', { shown: items.length, total: data.items.length })}</span>
        </div>
        {items.length === 0 ? <Empty icon="bell" title={t('Sin notificaciones por mostrar')} text={t('Ejecuta las reglas para generar las pendientes o cambia los filtros.')} action={<button className="btn sm primary" disabled={running} onClick={run}>{t('Ejecutar reglas ahora')}</button>} /> : (
          <table>
            <thead><tr><th>{t('Fecha')}</th><th>{t('Tipo')}</th><th>{t('Título')}</th><th>{t('Mensaje')}</th><th>{t('Canal')}</th><th>{t('Estado')}</th><th>{t('Cliente')}</th></tr></thead>
            <tbody>{items.map((n) => (
              <tr key={n.id}>
                <td className="small">{fmtDate(n.createdAt, true)}</td><td><span className="pill neutral">{n.kindLabel}</span></td><td><b>{n.title}</b></td><td className="small">{n.body}</td>
                <td className="small">{CHANNEL[n.channel] ? t(CHANNEL[n.channel]) : n.channel}</td><td><span className={`pill ${STATUS[n.status]?.tone ?? 'neutral'}`}>{STATUS[n.status] ? t(STATUS[n.status].label) : n.status}</span></td><td>{n.firstName ?? <span className="muted">{t('Administración')}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
