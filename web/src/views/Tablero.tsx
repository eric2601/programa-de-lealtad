import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, litros, pesos, PAYMENT_METHOD_LABELS, type PaymentMethod, type Session, type StationDto, type TodayDashboard } from '../api';
import { Icon, type IconName } from '../components/icons';
import { Picto, type PictoName } from '../components/Picto';
import { NumberTicker, Sparkline, Spotlight, Stagger } from '../components/Motion';
import { Alert, BarList, Ico, Kpi, Skeleton } from '../components/Visual';
import { getLocale, useT } from '../i18n';

// Etiquetas traducidas al dibujar con t(FUEL_LABEL[k]).
const FUEL_LABEL: Record<string, string> = { regular: 'Regular', premium: 'Premium', diesel: 'Diésel', store_only: 'Solo tienda' };
const ALERT_ICON: Record<TodayDashboard['alerts'][number]['kind'], PictoName> = { wallet_expiring: 'coins', promo_ending: 'bell', promo_exhausted: 'tag', concentration: 'userStar', scratch_pending: 'gift' };
const REFRESH_MS = 60_000;
const fmtInt = (v: number) => Math.round(v).toLocaleString(getLocale());
const hora = (iso: string) => new Date(iso).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
const diaSemana = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { weekday: 'long' });

function Delta({ value, label }: { value: number | null; label?: string }) {
  const { t, locale } = useT();
  if (value === null) return <span className="delta flat">{t('sin comparación')}</span>;
  const dir = value > 2 ? 'up' : value < -2 ? 'down' : 'flat';
  return <span className={`delta ${dir}`} title={label ?? t('vs. semana pasada')}><Icon name={dir === 'flat' ? 'minus' : 'arrowRight'} size={11} style={{ transform: dir === 'up' ? 'rotate(-45deg)' : dir === 'down' ? 'rotate(45deg)' : undefined }} />{value > 0 ? '+' : ''}{value.toLocaleString(locale, { maximumFractionDigits: 0 })} %</span>;
}

/** Tarjeta de indicador principal: etiqueta, cifra animada, variación y minigráfica. */
function Metric({ icon, label, value, format, unit, delta, spark, tone, className = '' }: { icon: PictoName; label: string; value: number; format?: (v: number) => string; unit?: string; delta?: number | null; spark?: number[]; tone?: 'ok'; className?: string }) {
  return (
    <Spotlight className={`card metric ${tone ?? ''} ${className}`}>
      <div className="m-label"><span>{label}</span><Picto name={icon} size={26} /></div>
      <div className="m-value"><NumberTicker value={value} format={format} />{unit && <small>{unit}</small>}</div>
      <div className="m-foot">{delta !== undefined ? <Delta value={delta} /> : <span />}{spark && spark.length > 1 && <Sparkline values={spark} width={110} height={34} tone={tone === 'ok' ? 'var(--ok)' : 'var(--accent)'} />}</div>
    </Spotlight>
  );
}

/** Dashboard de operación: lo que está pasando hoy en la estación, con actualización automática cada minuto. */
export function Tablero({ session }: { session: Session }) {
  const { t, locale } = useT();
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [stations, setStations] = useState<StationDto[]>([]);
  const [station, setStation] = useState<string>(session.station.id);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await api<TodayDashboard>(`/dashboard?station=${encodeURIComponent(station)}`, { token: session.token });
      setData(d); setError(null); setUpdatedAt(new Date());
    } catch (e) { setError(e instanceof ApiError ? e.message : t('Sin conexión. Se reintenta en un minuto.')); }
    finally { setRefreshing(false); }
  }, [station, session.token, t]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), REFRESH_MS); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { api<StationDto[]>('/admin/stations', { token: session.token }).then(setStations).catch(() => { /* el selector queda con la estación de la sesión */ }); }, [session.token]);

  const selector = (
    <div className="row">
      <label className="field" style={{ minWidth: 220 }}>
        <span className="sr-only">{t('Estación')}</span>
        <select value={station} onChange={(e) => setStation(e.target.value)} aria-label={t('Estación')}>
          {stations.length === 0 && <option value={session.station.id}>{session.station.name}</option>}
          {stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          <option value="all">{t('Todo el grupo')}</option>
        </select>
      </label>
      <button className="btn" onClick={() => void load()} disabled={refreshing} aria-label={t('Actualizar ahora')}><Icon name="repeat" size={16} /> {refreshing ? t('Actualizando…') : t('Actualizar')}</button>
    </div>
  );

  if (error && !data) return <div className="dash"><div className="row between"><h2 className="hero-title">{t('Hoy')}</h2>{selector}</div><Alert kind="error">{error}</Alert></div>;
  if (!data) return <div className="dash"><div className="row between"><h2 className="hero-title">{t('Hoy')}</h2>{selector}</div><Skeleton lines={5} /></div>;

  const td = data.today;
  const lw = data.lastWeek;
  const quiet = td.sales === 0;
  const stationName = station === 'all' ? session.tenant.name : (stations.find((s) => s.id === station)?.name ?? session.station.name);
  const activeHours = data.hours.filter((h) => h.hour >= 5 && h.hour <= 23);
  const maxHour = Math.max(1, ...activeHours.map((h) => Math.max(h.sales, h.lastWeekSales)));
  const cum = (key: 'sales' | 'litersMl' | 'salesCents') => { let acc = 0; return activeHours.filter((h) => h.hour <= data.localHour).map((h) => (acc += h[key])); };
  const fuelRows = Object.entries(data.fuelMix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const payRows = Object.entries(data.payMix).sort((a, b) => b[1] - a[1]);
  const lastWeekDay = diaSemana(new Date(new Date(data.dayStart).getTime() - 7 * 86_400_000).toISOString());
  const hh = (h: number) => String(h).padStart(2, '0');

  return (
    <Stagger className={`dash${refreshing ? ' dim' : ''}`}>
      <div className="row between">
        <div className="step-title">
          <h2 className="hero-title">{t('Hoy en')} <em className="ac">{stationName}</em></h2>
          <p>{t('{date} · corte a las {time}', { date: fechaLarga(data.at), time: hora(data.at) })}{updatedAt && <> {t('· actualizado {time}', { time: hora(updatedAt.toISOString()) })}</>}</p>
        </div>
        {selector}
      </div>
      {error && <Alert kind="warn">{error}</Alert>}

      <div className="bento">
        <Metric className="b-3" icon="pump" label={t('Cargas identificadas')} value={td.sales} delta={lw.salesChangePct} spark={cum('sales')} />
        <Metric className="b-3" icon="carFuel" label={t('Litros')} value={td.litersMl / 1000} format={(v) => v.toLocaleString(locale, { maximumFractionDigits: 0 })} unit="L" delta={lw.litersChangePct} spark={cum('litersMl')} />
        <Metric className="b-3" icon="coins" label={t('Venta identificada')} value={td.salesCents / 100} format={(v) => `$${v.toLocaleString(locale, { maximumFractionDigits: 0 })}`} delta={lw.salesCentsChangePct} spark={cum('salesCents')} tone="ok" />
        <Metric className="b-3" icon="userStar" label={t('Clientes distintos')} value={td.customers} delta={lw.customersChangePct} spark={undefined} />

        {quiet && <div className="b-12"><Alert kind="info">{t('Todavía no hay cargas identificadas hoy en esta estación. La semana pasada a esta hora llevaba {soFar} y cerró con {full}.', { soFar: lw.soFar.sales, full: lw.full.sales })}</Alert></div>}

        <Spotlight className="card b-8 chart-card">
          <div className="row between">
            <div className="section-title"><h3><Icon name="clock" size={18} /> {t('Cargas por hora')}</h3><p>{t('Barras: hoy. Línea punteada: {day} pasado.', { day: lastWeekDay })}</p></div>
            <span className="pill neutral">{t('{full} la semana pasada · {soFar} a esta hora', { full: lw.full.sales, soFar: lw.soFar.sales })}</span>
          </div>
          <div className="hour-grid" role="img" aria-label={t('Cargas por hora de hoy comparadas con la semana pasada')}>
            {activeHours.map((h) => (
              <div key={h.hour} className={`h${h.hour === data.localHour ? ' now' : ''}`}>
                <span className="tt">{t('{hour}:00 · {sales} hoy · {lw} sem. pasada', { hour: hh(h.hour), sales: h.sales, lw: h.lastWeekSales })}</span>
                <i style={{ height: `${(h.sales / maxHour) * 100}%` }} />
                {h.lastWeekSales > 0 && <u style={{ bottom: `${(h.lastWeekSales / maxHour) * 100}%` }} />}
              </div>
            ))}
          </div>
          <div className="hour-axis" aria-hidden="true">{activeHours.map((h) => <span key={h.hour}>{hh(h.hour)}</span>)}</div>
          <p className="chart-insight"><span className="chart-insight-dot" aria-hidden="true" />{(() => {
            const busiest = activeHours.reduce((a, b) => (b.sales > a.sales ? b : a), activeHours[0]);
            const soFar = lw.soFar.sales; const diff = lw.salesChangePct;
            if (td.sales === 0) return t('Todavía no hay cargas hoy. El {day} pasado a esta hora llevaba {soFar}.', { day: lastWeekDay, soFar });
            const peak = busiest.sales === 1
              ? t('La hora más fuerte fue a las {hour}:00 con 1 carga.', { hour: hh(busiest.hour) })
              : t('La hora más fuerte fue a las {hour}:00 con {n} cargas.', { hour: hh(busiest.hour), n: busiest.sales });
            const vars = { total: td.sales, day: lastWeekDay, soFar, pct: Math.abs(diff ?? 0) };
            const pace = diff === null
              ? t('Llevas {total} en el día; el {day} pasado a esta hora llevaba {soFar}.', vars)
              : diff >= 0
                ? t('Llevas {total} en el día; el {day} pasado a esta hora llevaba {soFar} (vas {pct} % arriba).', vars)
                : t('Llevas {total} en el día; el {day} pasado a esta hora llevaba {soFar} (vas {pct} % abajo).', vars);
            return `${peak} ${pace}`;
          })()}</p>
        </Spotlight>

        <Spotlight className="card b-4">
          <div className="section-title"><h3><Icon name="star" size={18} /> {t('Beneficios entregados hoy')}</h3></div>
          <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Kpi icon="star" value={fmtInt(td.points)} label={t('puntos')} sub={pesos(td.pointsValueCents)} tone="accent" />
            <Kpi icon="wallet" value={pesos(td.walletIssuedCents)} label={t('dinero virtual')} sub={t('usado {amt}', { amt: pesos(td.walletUsedCents) })} tone="ok" />
            <Kpi icon="tag" value={fmtInt(td.promoUses)} label={t('usos de promos')} sub={t('{n} clientes', { n: td.promoMembers })} tone="violet" />
            <Kpi icon="gift" value={fmtInt(td.scratchIssued)} label={t('Rasca y Gana')} sub={td.scratchPending > 0 ? t('{n} sin rascar', { n: td.scratchPending }) : t('todas rascadas')} tone={td.scratchPending > 0 ? 'warn' : 'neutral'} />
          </div>
          {data.promoUses.length > 0 && <BarList rows={data.promoUses.slice(0, 4).map((p) => ({ label: p.name, value: p.uses, display: `${p.uses} · ${pesos(p.cost)}`, tone: 'accent' as const }))} />}
        </Spotlight>

        <Spotlight className="card b-4">
          <div className="section-title"><h3><Icon name="alert" size={18} /> {t('Para atender hoy')}</h3></div>
          {data.alerts.length === 0 ? <div className="empty-state" style={{ padding: '.6rem' }}><span className="empty-ico"><Icon name="check" size={22} /></span><b>{t('Todo en orden')}</b><span className="muted small">{t('Sin pendientes por ahora.')}</span></div> : (
            <ul className="notif-list">
              {data.alerts.map((a, i) => (
                <li key={i}>
                  <span className="picto-wrap" style={a.kind === 'concentration' ? { background: 'var(--crit-soft)', color: 'var(--crit)' } : undefined}><Picto name={ALERT_ICON[a.kind]} size={24} /></span>
                  <div className="grow"><span className="small">{a.text}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Spotlight>

        <Spotlight className="card b-4">
          <div className="section-title"><h3><Icon name="fuel" size={18} /> {t('Qué se cargó')}</h3></div>
          {fuelRows.length === 0 ? <div className="muted">{t('Sin cargas todavía.')}</div> : (
            <BarList rows={fuelRows.map(([k, v]) => ({ label: FUEL_LABEL[k] ? t(FUEL_LABEL[k]) : k, value: v, display: k === 'store_only' ? (v === 1 ? t('1 visita') : t('{n} visitas', { n: v })) : litros(v), icon: (k === 'store_only' ? 'store' : k === 'diesel' ? 'truck' : 'fuel') as IconName }))} />
          )}
          {payRows.length > 0 && (
            <>
              <div className="section-title"><h3><Icon name="card" size={18} /> {t('Cómo pagaron')}</h3></div>
              <BarList tone="neutral" rows={payRows.map(([k, v]) => ({ label: PAYMENT_METHOD_LABELS[k as PaymentMethod] ? t(PAYMENT_METHOD_LABELS[k as PaymentMethod]) : k, value: v, display: v === 1 ? t('1 carga') : t('{n} cargas', { n: v }) }))} />
            </>
          )}
        </Spotlight>

        <Spotlight className="card b-4">
          <div className="section-title"><h3><Icon name="user" size={18} /> {t('Despachadores hoy')}</h3><p>{t('Cargas y números distintos por persona.')}</p></div>
          {data.attendants.length === 0 ? <div className="muted">{t('Nadie ha registrado cargas hoy.')}</div> : (
            <div className="attendant-grid one">
              {data.attendants.map((a) => {
                const ratio = a.sales ? a.distinctMembers / a.sales : 1;
                const crit = ratio < 0.5 && a.sales >= 8;
                return (
                  <div key={a.name + a.station} className={`attendant ${crit ? 'crit' : 'ok'}`}>
                    <span className="avatar" aria-hidden="true">{a.name.charAt(0)}</span>
                    <div className="grow">
                      <b>{a.name.replace(/\s*\([^)]*\)\s*$/, '')}</b>
                      <span className="muted small">{a.station} · {a.sales === 1 ? t('1 carga') : t('{n} cargas', { n: a.sales })} · {litros(a.litersMl)}</span>
                    </div>
                    <span className={`pill ${crit ? 'crit' : 'ok'}`}>{t('{n} núm.', { n: a.distinctMembers })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Spotlight>

        <div className="card b-12">
          <div className="row between"><div className="section-title"><h3><Icon name="list" size={18} /> {t('Últimas cargas')}</h3><p>{t('Las 12 más recientes. Se actualiza solo cada minuto.')}</p></div></div>
          {data.recent.length === 0 ? <div className="muted">{t('Aquí aparecerán las cargas conforme se registren en la bomba.')}</div> : (
            <div className="tbl">
              <table className="recent">
                <thead><tr><th>{t('Hora')}</th><th>{t('Cliente')}</th><th>{t('Carga')}</th><th className="num">{t('Monto')}</th><th className="num">{t('Puntos')}</th><th>{t('Promociones')}</th><th>{t('Atendió')}</th></tr></thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{hora(r.at)}</td>
                      <td><b>{r.firstName}</b></td>
                      <td>{r.fuelType ? `${FUEL_LABEL[r.fuelType] ? t(FUEL_LABEL[r.fuelType]) : r.fuelType} · ${litros(r.litersMl)}` : t('Solo tienda')}{r.storeCents > 0 && r.fuelType ? ` ${t('+ tienda {amt}', { amt: pesos(r.storeCents) })}` : ''}{r.pump ? <span className="muted"> {t('· bomba {n}', { n: r.pump })}</span> : null}</td>
                      <td className="num">{pesos(r.amountCents)}{r.walletSpentCents > 0 && <span className="muted small"> {t('(−{amt} virtual)', { amt: pesos(r.walletSpentCents) })}</span>}</td>
                      <td className="num">{r.points > 0 ? `+${r.points}` : '—'}</td>
                      <td>{r.promos.length === 0 ? <span className="muted">—</span> : <span className="applied-chips">{r.promos.slice(0, 2).map((p) => <span key={p} className="pill neutral">{p}</span>)}{r.promos.length > 2 && <span className="pill neutral">+{r.promos.length - 2}</span>}</span>}</td>
                      <td className="muted small">{r.attendant.replace(/\s*\([^)]*\)\s*$/, '')}{station === 'all' ? ` · ${r.station}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Stagger>
  );
}
