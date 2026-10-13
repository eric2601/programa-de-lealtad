import { useState } from 'react';
import { pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, fmtNum, type SegmentCount, type SegmentMember } from '../api';
import { HBarChart, fmtInt, fmtMoney } from '../charts';
import { Empty, ErrorBox, Head, Loading, useLoad } from '../ui';

export function Segmentos() {
  const { t, locale } = useT();
  const { token, catalog } = useAdmin();
  const { data, error, reload } = useLoad(() => adminApi<SegmentCount[]>('/segments', token), [token]);
  const [key, setKey] = useState<string | null>(null);
  const members = useLoad(() => (key ? adminApi<SegmentMember[]>(`/segments/${encodeURIComponent(key)}/members`, token) : Promise.resolve(null)), [token, key]);
  const segLabel = (k: string) => catalog.segments.find((s) => s.key === k)?.label ?? k;
  const ctLabel = (k: string) => catalog.customerTypes.find((s) => s.key === k)?.label ?? k;

  if (error) return <><Head title={t('Segmentos')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Segmentos')} /><Loading text={t('Calculando segmentos…')} /></>;
  const behavioral = data.filter((s) => !s.key.includes(':'));
  const geo = data.filter((s) => s.key.includes(':'));
  const current = key ? data.find((s) => s.key === key) : null;

  const card = (s: SegmentCount) => (
    <button key={s.key} className={`kpi seg-card${key === s.key ? ' on' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => setKey(key === s.key ? null : s.key)}>
      <span className="label">{s.label}</span>
      <span className="value">{fmtNum(s.members)} <span className="muted" style={{ fontSize: '.8rem', fontWeight: 500 }}>{t('clientes')}</span></span>
      <span className="sub">{t('ticket prom.')} <b className="mono" style={{ color: 'var(--ink)' }}>{pesos(s.avgTicketCents)}</b> · {t('{n} visitas/30 d', { n: s.avgVisits30.toLocaleString(locale) })}</span>
    </button>
  );

  return (
    <div className="admin-main">
      <Head title={t('Segmentos')} sub={t('Calculados con reglas fijas a partir del comportamiento: nuevos, frecuentes, inactivos, VIP, consumo y tipo de cliente. Toca un segmento para ver sus miembros.')}
        desc={t('Un segmento es un grupo de clientes parecidos (por ejemplo, “frecuentes” o “inactivos”). Sirve para dirigir promociones solo a quien te interesa.')} />
      <section className="kpis" aria-label={t('Segmentos por comportamiento')}>{behavioral.map(card)}</section>
      {geo.length > 0 && <><h3>{t('Por estación, ciudad y estado de origen')}</h3><section className="kpis" aria-label={t('Segmentos geográficos')}>{geo.map(card)}</section></>}
      <div className="grid-2">
        <HBarChart title={t('¿Cuántos clientes hay en cada grupo?')} sub={t('un cliente puede estar en varios grupos')} items={behavioral.map((s) => ({ label: s.label, value: s.members }))} fmt={fmtInt} seriesName={t('Clientes')} max={12} />
        <HBarChart title={t('¿Qué grupo gasta más por visita?')} sub={t('gasto promedio por carga, en pesos')} items={[...behavioral].sort((a, b) => b.avgTicketCents - a.avgTicketCents).map((s) => ({ label: s.label, value: s.avgTicketCents }))} fmt={fmtMoney} seriesName={t('Gasto por visita')} max={12} />
      </div>
      {current && (
        <div className="card tbl">
          <div className="row between"><h3>{t('Miembros de “{name}”', { name: current.label })}</h3><span className="muted small">{t('hasta 200 registros')}</span></div>
          {members.error && <ErrorBox text={members.error} onRetry={members.reload} />}
          {members.loading && <Loading text={t('Buscando miembros…')} />}
          {members.data && members.data.length === 0 && <Empty icon="users" title={t('Este segmento está vacío por ahora')} text={t('Se llena solo conforme los clientes cargan.')} />}
          {members.data && members.data.length > 0 && (
            <div className="tbl-scroll"><table>
              <thead><tr><th>{t('Cliente')}</th><th>{t('Tipo')}</th><th>{t('Estación')}</th><th className="num">{t('Puntos')}</th><th className="num">{t('Visitas 30 d')}</th><th className="num">{t('Ticket prom.')}</th><th>{t('Segmentos')}</th></tr></thead>
              <tbody>{members.data.map((m) => <tr key={m.membershipId}><td>{m.firstName}</td><td>{ctLabel(m.customerType)}</td><td>{m.station ?? '—'}</td><td className="num">{fmtNum(m.points)}</td><td className="num">{m.visits30}</td><td className="num">{pesos(m.avgTicketCents)}</td><td><div className="badge-row">{m.segments.map((s) => <span key={s} className="pill neutral">{segLabel(s)}</span>)}</div></td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
