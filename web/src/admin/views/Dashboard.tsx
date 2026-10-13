import { useState } from 'react';
import { litros, pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { CAMPAIGN_STATUS_LABELS, adminApi, fmtDate, fmtNum, fmtRoi, type Dashboard as DashboardData } from '../api';
import { BarChart, HBarChart, LineChart, describeShare, describeTrend, fmtInt, fmtLiters, fmtMoney } from '../charts';
import { Delta, Empty, ErrorBox, Head, Kpi, Loading, Term, useLoad } from '../ui';

const RANGES = [7, 30, 90] as const;

export function Dashboard() {
  const { t } = useT();
  const { token, go } = useAdmin();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, loading, reload } = useLoad(() => {
    const to = new Date(Date.now() + 86_400_000); const from = new Date(Date.now() - days * 86_400_000);
    return adminApi<DashboardData>(`/dashboard?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, token);
  }, [token, days]);

  const selector = <div className="seg" role="group" aria-label={t('Periodo')}>{RANGES.map((r) => <button key={r} className={days === r ? 'on' : ''} onClick={() => setDays(r)}>{t('Últimos {n} días', { n: r })}</button>)}</div>;
  if (error) return <><Head title={t('Ventas y resultados')}>{selector}</Head><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Ventas y resultados')}>{selector}</Head><Loading /></>;
  const k = data.kpis;
  const s = data.series;
  const ticketDelta = k.avgTicketCents - k.prevAvgTicketCents;
  const roiNote = k.roi === null ? t('Sin costo registrado en el periodo') : k.roi >= 0.5 ? t('Retorno saludable') : k.roi >= 0 ? t('Retorno positivo pero bajo') : t('El costo supera la ganancia extra');
  const customersInsight = (() => {
    const n = s.reduce((a, d) => a + d.newCustomers, 0); const r = s.reduce((a, d) => a + d.recurringCustomers, 0);
    if (n + r === 0) return t('Sin clientes en el periodo.');
    return t('De cada 100 visitas, {known} son de clientes que ya conocíamos y {fresh} de clientes nuevos ({signups} altas en el periodo).', { known: Math.round((r / (n + r)) * 100), fresh: Math.round((n / (n + r)) * 100), signups: fmtNum(n) });
  })();

  return (
    <div className={`admin-main${loading ? ' dim' : ''}`}>
      <Head title={t('Ventas y resultados')} sub={`${fmtDate(data.range.from)} → ${fmtDate(data.range.to)} · ${t('comparado con el periodo anterior de la misma duración')}`}
        desc={t('Aquí ves cuánto se vendió, cuánto gasta cada cliente por visita y si las promociones están dejando ganancia. Pasa el cursor sobre los términos con “?” para ver qué significan.')}>{selector}</Head>

      <section className="kpis" aria-label={t('Ventas')}>
        <Kpi hero label={t('Ventas totales')} value={pesos(k.salesCents)} sub={<Delta value={k.salesChangePct} />} />
        <Kpi label={t('Ticket promedio')} help="ticket" value={pesos(k.avgTicketCents)} sub={<Delta value={k.avgTicketChangePct} />} />
        <Kpi label={t('Incremento del ticket promedio')} value={<span className={ticketDelta >= 0 ? '' : 'muted'}>{ticketDelta >= 0 ? '+' : '−'}{pesos(Math.abs(ticketDelta))}</span>} sub={t('antes {amount}', { amount: pesos(k.prevAvgTicketCents) })} />
        <Kpi label={t('Litros vendidos')} value={litros(k.litersMl)} sub={<Delta value={k.litersChangePct} />} />
        <Kpi label={t('Transacciones')} value={fmtNum(k.transactions)} sub={<Delta value={k.transactionsChangePct} />} />
      </section>

      <section className="kpis" aria-label={t('Promociones y dinero virtual')}>
        <Kpi label={t('Promociones activas')} value={fmtNum(k.activePromotions)} sub={<><span className={`pill ${k.expiringPromotions ? 'warn' : 'neutral'}`}>{t('{n} por vencer', { n: k.expiringPromotions })}</span><span className={`pill ${k.exhaustedPromotions ? 'crit' : 'neutral'}`}>{t('{n} agotadas', { n: k.exhaustedPromotions })}</span>{k.nearlyExhausted > 0 && <span className="pill warn">{t('{n} por agotarse', { n: k.nearlyExhausted })}</span>}</>} />
        <Kpi label={t('Usos de promociones')} value={fmtNum(k.promoUses)} sub={<><Term k="participantes">{t('{n} clientes participantes', { n: fmtNum(k.participants) })}</Term></>} />
        <Kpi label={t('Costo de promociones')} help="costo" value={pesos(k.promoCostCents)} sub={<Term k="margen">{t('margen incremental est. {amount}', { amount: pesos(k.incrementalMarginCents) })}</Term>} />
        <Kpi label={t('ROI de promociones')} help="roi" value={<span className={k.roi === null ? 'muted' : ''}>{fmtRoi(k.roi)}</span>} sub={roiNote} />
        <Kpi label={t('Dinero virtual generado')} value={pesos(k.walletGeneratedCents)} sub={t('utilizado {used} · expirado {expired}', { used: pesos(k.walletUsedCents), expired: pesos(k.walletExpiredCents) })} />
        <Kpi label={t('Dinero virtual vigente')} help="pasivo" value={pesos(k.walletOutstandingCents)} sub={t('saldo que los clientes aún pueden usar (pasivo)')} />
        <Kpi label={t('Clientes nuevos')} value={fmtNum(k.newCustomers)} sub={t('altas en el periodo')} />
        <Kpi label={t('Clientes recurrentes')} help="recurrentes" value={fmtNum(k.recurringCustomers)} sub={t('con 2 o más cargas en el periodo')} />
      </section>

      {(data.expiring.length > 0 || data.nearlyExhausted.length > 0) && (
        <div className="row">
          {data.expiring.map((p) => <button key={p.id} className="alert warn" style={{ cursor: 'pointer' }} onClick={() => go('promociones', p.id)}>{t('“{name}” vence el {date}', { name: p.name, date: fmtDate(p.endsAt) })}</button>)}
          {data.nearlyExhausted.map((p) => <button key={p.id} className="alert warn" style={{ cursor: 'pointer' }} onClick={() => go('promociones', p.id)}>{t('“{name}” por agotarse: {used} de {initial}', { name: p.name, used: p.used, initial: p.initial ?? '—' })}</button>)}
        </div>
      )}

      <div className="grid-2">
        <LineChart title={t('¿Cuánto vendimos cada día?')} sub={t('combustible y tienda, en pesos')} data={s.map((d) => ({ label: d.day, values: [d.salesCents] }))} series={[{ name: t('Ventas') }]} fmt={fmtMoney} insight={describeTrend(s.map((d) => ({ label: d.day, values: [d.salesCents] })), fmtMoney, 'ventas')} />
        <LineChart title={t('¿Cuánto gasta cada cliente por visita?')} sub={t('ticket promedio en pesos')} data={s.map((d) => ({ label: d.day, values: [d.avgTicketCents] }))} series={[{ name: t('Gasto por visita'), color: 'var(--chart-2)' }]} fmt={fmtMoney} insight={describeTrend(s.map((d) => ({ label: d.day, values: [d.avgTicketCents] })), fmtMoney, 'visitas')} />
        <BarChart title={t('¿Cuántos litros salieron cada día?')} sub={t('solo cargas identificadas con celular')} data={s.map((d) => ({ label: d.day, values: [d.litersMl] }))} series={[{ name: t('Litros'), color: 'var(--chart-3)' }]} fmt={fmtLiters} labelLast insight={describeTrend(s.map((d) => ({ label: d.day, values: [d.litersMl] })), fmtLiters, 'litros')} />
        <HBarChart title={t('¿Qué estación vende más?')} sub={t('pesos en el periodo')} items={data.byStation.map((st) => ({ label: st.name, value: st.sales_cents, sub: t('{n} cargas', { n: fmtNum(st.transactions) }) }))} fmt={fmtMoney} seriesName={t('Ventas')} max={10} />
        <HBarChart title={t('¿Qué promociones se usan más?')} sub={t('veces que se entregó el beneficio')} items={data.promoUsage.filter((p) => p.uses > 0).map((p) => ({ label: p.name, value: p.uses, sub: t('costo {amount}', { amount: pesos(p.cost) }) }))} fmt={fmtInt} seriesName={t('Usos')} />
        <BarChart title={t('¿Llegan clientes nuevos o vuelven los de siempre?')} sub={t('clientes distintos por día')} data={s.map((d) => ({ label: d.day, values: [d.newCustomers, d.recurringCustomers] }))} series={[{ name: t('Nuevos') }, { name: t('Ya conocidos') }]} stacked markBest={false} insight={customersInsight} />
        <BarChart title={t('Dinero virtual: ¿se usa lo que regalamos?')} sub={t('pesos entregados y pesos gastados por día')} data={s.map((d) => ({ label: d.day, values: [d.walletIssuedCents, d.walletUsedCents] }))} series={[{ name: t('Regalado'), color: 'var(--chart-2)' }, { name: t('Gastado'), color: 'var(--chart-3)' }]} fmt={fmtMoney} markBest={false} insight={describeShare(s.map((d) => ({ label: d.day, values: [d.walletIssuedCents, d.walletUsedCents] })), fmtMoney, [t('Regalado en el periodo'), t('Gastado por los clientes')], t('Los clientes ya usaron el {pct} de lo que se les regaló; el resto sigue vigente o venció.'))} />
        <BarChart title={t('¿Cuántas promociones aplicamos cada día?')} sub={t('beneficios entregados en la bomba')} data={s.map((d) => ({ label: d.day, values: [d.promoUses] }))} series={[{ name: t('Beneficios'), color: 'var(--chart-4)' }]} labelLast insight={describeTrend(s.map((d) => ({ label: d.day, values: [d.promoUses] })), fmtInt, 'beneficios')} />
      </div>

      <div className="card tbl">
        <div className="chart-head"><h3 style={{ color: 'var(--ink)', textTransform: 'none', letterSpacing: 0, fontSize: '.92rem' }}>{t('Rendimiento de campañas')}</h3><small className="muted">{t('usos y costo acumulados')}</small></div>
        {data.campaigns.length === 0 ? <Empty icon="megaphone" title={t('Todavía no hay campañas')} text={t('Una campaña agrupa promociones con un objetivo y te dice si funcionaron.')} action={<button className="btn sm primary" onClick={() => go('campanas')}>{t('Crear la primera campaña')}</button>} /> : (
          <table>
            <thead><tr><th>{t('Campaña')}</th><th>{t('Objetivo')}</th><th>{t('Estado')}</th><th>{t('Vigencia')}</th><th className="num">{t('Usos')}</th><th className="num">{t('Costo')}</th><th className="num">{t('Ventas asociadas')}</th></tr></thead>
            <tbody>{data.campaigns.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => go('campanas', c.id)}>
                <td><button className="link">{c.name}</button></td><td>{c.objectiveLabel}</td>
                <td><span className={`pill ${c.status === 'active' ? 'ok' : c.status === 'paused' ? 'warn' : c.status === 'ended' ? 'crit' : 'neutral'}`}>{(CAMPAIGN_STATUS_LABELS as Record<string, string>)[c.status] ? t((CAMPAIGN_STATUS_LABELS as Record<string, string>)[c.status]) : c.status}</span></td>
                <td>{fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}</td><td className="num">{fmtNum(c.uses)}</td><td className="num">{pesos(c.cost)}</td><td className="num">{pesos(c.sales)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data.campaigns.length > 0 && <HBarChart title={t('¿Qué campaña nos cuesta más?')} sub={t('valor de los beneficios entregados, en pesos')} items={data.campaigns.filter((c) => c.cost > 0).map((c) => ({ label: c.name, value: c.cost, sub: t('{n} usos', { n: fmtNum(c.uses) }) }))} fmt={fmtMoney} seriesName={t('Costo')} />}
      </div>
    </div>
  );
}
