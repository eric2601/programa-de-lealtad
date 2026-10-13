import { useEffect, useState } from 'react';
import { api, ApiError, litros, pesos, type Session } from '../api';
import { Icon } from '../components/icons';
import { Alert, BarList, Kpi, Skeleton } from '../components/Visual';
import { getLocale, translate, useT } from '../i18n';

interface Summary {
  range: { from: string; to: string };
  totals: { sales: number; litersMl: number; fuelCents: number; storeCents: number; rewardCents: number; pointsIssued: number; pointsRedeemed: number; pointsIssuedValueCents: number };
  members: { total: number; active30: number; active90: number; liabilityPoints: number; liabilityCents: number };
  byStation: { code: string; name: string; sales: number; liters_ml: number; points: number; reward_cents: number }[];
  byAttendant: { name: string; station: string | null; sales: number; liters_ml: number; distinct_members: number }[];
  alerts: { kind: string; detail: string }[];
}

const compact = (n: number) => n.toLocaleString(getLocale(), { maximumFractionDigits: 0 });
const litrosK = (ml: number) => (ml >= 1_000_000 ? translate('{n} mil L', { n: (ml / 1_000_000).toLocaleString(getLocale(), { maximumFractionDigits: 1 }) }) : litros(ml));

export function Reportes({ session }: { session: Session }) {
  const { t } = useT();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Summary>('/reports/summary', { token: session.token }).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : translate('Sin conexión.')));
  }, [session.token]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Skeleton lines={4} />;
  const tot = data.totals;
  const activePct = data.members.total ? Math.round((data.members.active30 / data.members.total) * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
      <div className="row between"><h2 className="hero-title">{t('Últimos')} <em className="ac">{t('30 días')}</em></h2><span className="muted small">{session.tenant.name}</span></div>
      {data.alerts.length > 0 && (
        <Alert kind="warn">{data.alerts.length === 1 ? data.alerts[0].detail : t('{n} despachadores concentran muchas cargas en pocos números. Revisa las tarjetas marcadas en rojo abajo.', { n: data.alerts.length })}</Alert>
      )}

      <div className="stat-grid four">
        <Kpi icon="fuel" value={compact(tot.sales)} label={t('cargas identificadas')} tone="accent" big />
        <Kpi icon="oil" value={litrosK(tot.litersMl)} label={t('litros')} tone="accent" big />
        <Kpi icon="cash" value={pesos(tot.fuelCents + tot.storeCents)} label={t('venta identificada')} tone="ok" big sub={t('tienda {amt}', { amt: pesos(tot.storeCents) })} />
        <Kpi icon="tag" value={pesos(tot.rewardCents)} label={t('descuentos entregados')} tone="violet" big />
      </div>

      <div className="cols">
        <div className="card">
          <div className="section-title"><h3><Icon name="star" size={18} /> {t('Puntos')}</h3></div>
          <div className="stat-grid">
            <Kpi icon="plus" value={compact(tot.pointsIssued)} label={t('emitidos')} sub={pesos(tot.pointsIssuedValueCents)} tone="ok" />
            <Kpi icon="minus" value={compact(tot.pointsRedeemed)} label={t('canjeados')} tone="neutral" />
            <Kpi icon="bank" value={compact(data.members.liabilityPoints)} label={t('pendientes de usar')} sub={pesos(data.members.liabilityCents)} tone="warn" />
          </div>
          <BarList rows={[
            { label: t('Emitidos'), value: tot.pointsIssued, display: compact(tot.pointsIssued), tone: 'ok' },
            { label: t('Canjeados'), value: tot.pointsRedeemed, display: compact(tot.pointsRedeemed), tone: 'neutral' },
            { label: t('Pendientes'), value: data.members.liabilityPoints, display: compact(data.members.liabilityPoints), tone: 'warn' },
          ]} />
          <p className="chart-insight"><span className="chart-insight-dot" aria-hidden="true" />{tot.pointsIssued > 0
            ? t('De cada 100 puntos emitidos en el mes se han canjeado {pct}. Los {n} pendientes valen {amt} y son un compromiso con los clientes.', { pct: Math.round((tot.pointsRedeemed / tot.pointsIssued) * 100), n: compact(data.members.liabilityPoints), amt: pesos(data.members.liabilityCents) })
            : t('Todavía no se han emitido puntos en el periodo.')}</p>
        </div>
        <div className="card">
          <div className="section-title"><h3><Icon name="users" size={18} /> {t('Clientes')}</h3></div>
          <div className="stat-grid">
            <Kpi icon="idcard" value={compact(data.members.total)} label={t('registrados')} tone="accent" />
            <Kpi icon="fire" value={compact(data.members.active30)} label={t('activos 30 días')} sub={t('{pct} % del total', { pct: activePct })} tone="ok" />
            <Kpi icon="calendar" value={compact(data.members.active90)} label={t('activos 90 días')} tone="neutral" />
          </div>
          <BarList rows={[
            { label: t('Registrados'), value: data.members.total, display: compact(data.members.total), tone: 'accent' },
            { label: t('Activos 30 días'), value: data.members.active30, display: compact(data.members.active30), tone: 'ok' },
            { label: t('Activos 90 días'), value: data.members.active90, display: compact(data.members.active90), tone: 'neutral' },
          ]} />
          <p className="chart-insight"><span className="chart-insight-dot" aria-hidden="true" />{data.members.total > 0
            ? (data.members.active90 > data.members.active30
              ? t('{pct} de cada 100 clientes registrados cargaron en los últimos 30 días; {n} más lo hicieron hace entre uno y tres meses y vale la pena traerlos de regreso.', { pct: activePct, n: compact(data.members.active90 - data.members.active30) })
              : t('{pct} de cada 100 clientes registrados cargaron en los últimos 30 días.', { pct: activePct }))
            : t('Aún no hay clientes registrados.')}</p>
        </div>
      </div>

      <div className="card">
        <div className="section-title"><h3><Icon name="store" size={18} /> {t('Por estación')}</h3><p>{t('Litros identificados en cada estación.')}</p></div>
        <BarList rows={data.byStation.map((s) => ({ label: `${s.code} · ${s.name}`, value: s.liters_ml, display: t('{liters} · {n} cargas', { liters: litros(s.liters_ml), n: s.sales }), icon: 'fuel' as const }))} />
        <p className="chart-insight"><span className="chart-insight-dot" aria-hidden="true" />{(() => {
          const rows = [...data.byStation].sort((a, b) => b.liters_ml - a.liters_ml);
          const sum = rows.reduce((s, r) => s + r.liters_ml, 0) || 1;
          if (!rows.length || rows[0].liters_ml === 0) return t('Sin litros identificados en el periodo.');
          const top = rows[0]; const last = rows[rows.length - 1];
          return t('{top} identifica más litros ({topPct} % del grupo); {last} es la que menos, con {lastPct} %. Ahí conviene reforzar que los despachadores pidan el celular.', { top: top.name, topPct: Math.round((top.liters_ml / sum) * 100), last: last.name, lastPct: Math.round((last.liters_ml / sum) * 100) });
        })()}</p>
      </div>

      <div className="card">
        <div className="section-title"><h3><Icon name="user" size={18} /> {t('Despachadores')}</h3><p>{t('Verde: atiende a muchos clientes distintos. Rojo: pocas personas concentran sus cargas; conviene revisar tickets.')}</p></div>
        <div className="attendant-grid">
          {data.byAttendant.map((a, i) => {
            const ratio = a.sales ? a.distinct_members / a.sales : 1;
            const crit = ratio < 0.5 && a.sales >= 10;
            return (
              <div key={i} className={`attendant ${crit ? 'crit' : 'ok'}`}>
                <span className="avatar" aria-hidden="true">{a.name.charAt(0)}</span>
                <div className="grow">
                  <b>{a.name.replace(/\s*\([^)]*\)\s*$/, '')}</b>
                  <span className="muted small">{a.station ?? '—'} · {t('{n} cargas', { n: a.sales })} · {litros(a.liters_ml)}</span>
                  <div className="bar-track small" role="img" aria-label={t('{pct} % de números distintos', { pct: Math.round(ratio * 100) })}><div className="bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
                </div>
                <span className={`pill ${crit ? 'crit' : 'ok'}`}>{a.sales ? `${Math.round(ratio * 100)} %` : '—'}{crit ? ` ${t('· revisar')}` : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
