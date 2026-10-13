/**
 * Gráficas SVG sin dependencias para el panel. Una sola paleta categórica (--chart-1..4), marcas
 * delgadas, rejilla de un tono, tooltip con la fecha completa, el mejor día señalado, el día en
 * curso atenuado y, debajo de cada gráfica, una lectura en palabras de lo que muestra.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { getLocale, translate, useT } from '../i18n';

export type Fmt = (v: number) => string;
export interface Series { name: string; color?: string }
export interface Point { label: string; values: number[]; title?: string }

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const color = (s: Series | undefined, i: number) => s?.color ?? COLORS[i % COLORS.length];
export const fmtInt: Fmt = (v) => v.toLocaleString(getLocale(), { maximumFractionDigits: 0 });
export const fmtMoney: Fmt = (v) => `$${(v / 100).toLocaleString(getLocale(), { maximumFractionDigits: 0 })}`;
export const fmtLiters: Fmt = (v) => `${(v / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 0 })} L`;
const compact = (v: number): string => (Math.abs(v) >= 1_000_000
  ? translate('{n} M', { n: (v / 1_000_000).toLocaleString(getLocale(), { maximumFractionDigits: 1 }) })
  : Math.abs(v) >= 10_000
    ? translate('{n} mil', { n: (v / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 0 }) })
    : v.toLocaleString(getLocale(), { maximumFractionDigits: 0 }));
/** Etiqueta compacta de eje según el formato del valor (dinero en pesos, litros o entero). */
const axisFmt = (fmt: Fmt): Fmt => (fmt === fmtMoney ? (v) => `$${compact(v / 100)}` : fmt === fmtLiters ? (v) => `${compact(v / 1000)} L` : (v) => compact(v));

/** Divisiones "redondas" del eje Y. */
function ticks(max: number, n = 4): number[] {
  if (max <= 0) return [0, 1];
  if (max <= 6) return Array.from({ length: Math.ceil(max) + 1 }, (_, i) => i);
  const raw = max / n; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
const parseDay = (label: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
/** Día ISO (AAAA-MM-DD) → "12 ene"; cualquier otro texto se devuelve tal cual. */
export const shortDay = (label: string): string => { const d = parseDay(label); return d ? d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }).replace('.', '') : label; };
/** Día ISO → "sábado 14 de septiembre". */
export const longDay = (label: string): string => { const d = parseDay(label); return d ? d.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) : label; };
const isToday = (label: string): boolean => { const d = parseDay(label); if (!d) return false; const t = new Date(); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate(); };
/** Porcentaje con signo ("+12 %"); null si no hay base. */
const pct = (a: number, b: number): string | null => (b > 0 ? translate('{n} %', { n: `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}` }) : null);

// ---- Lecturas en palabras ---------------------------------------------------------------
/** Describe una serie diaria: mejor día, promedio y cómo va el día en curso. `noun` en plural, p. ej. "ventas". */
export function describeTrend(data: Point[], fmt: Fmt, noun: string, k = 0): string {
  const pts = data.map((d) => ({ label: d.label, v: d.values[k] ?? 0 }));
  if (pts.length === 0) return translate('Todavía no hay {noun} en el periodo.', { noun });
  const closed = pts.filter((p) => !isToday(p.label));
  const base = closed.length ? closed : pts;
  const best = base.reduce((a, b) => (b.v > a.v ? b : a));
  const avg = base.reduce((s, p) => s + p.v, 0) / base.length;
  const vars = { day: longDay(best.label), best: fmt(best.v), avg: fmt(avg) };
  const last = pts[pts.length - 1];
  if (isToday(last.label)) return translate('El mejor día fue el {day} con {best}; el promedio diario es {avg}; hoy lleva {today} y el día no ha terminado.', { ...vars, today: fmt(last.v) });
  if (closed.length >= 2) {
    const prev = closed[closed.length - 2]; const ch = pct(last.v, prev.v);
    if (ch) return translate('El mejor día fue el {day} con {best}; el promedio diario es {avg}; el último día cerró en {last} ({change} frente al anterior).', { ...vars, last: fmt(last.v), change: ch });
    return translate('El mejor día fue el {day} con {best}; el promedio diario es {avg}; el último día cerró en {last}.', { ...vars, last: fmt(last.v) });
  }
  return translate('El mejor día fue el {day} con {best}; el promedio diario es {avg}.', vars);
}
/** Describe un ranking: quién va primero, quién al final y la diferencia. */
export function describeRanking(items: { label: string; value: number }[], fmt: Fmt, noun: string): string {
  const rows = items.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (rows.length === 0) return translate('Sin {noun} en el periodo.', { noun });
  const top = rows[0]; const total = rows.reduce((s, r) => s + r.value, 0);
  const share = total > 0 ? Math.round((top.value / total) * 100) : 0;
  if (rows.length === 1) return translate('{top} concentra todo ({value}).', { top: top.label, value: fmt(top.value) });
  const last = rows[rows.length - 1];
  const ratio = last.value > 0 ? Math.round(top.value / last.value * 10) / 10 : null;
  const vars = { top: top.label, value: fmt(top.value), share, last: last.label, lastValue: fmt(last.value) };
  if (ratio && ratio >= 1.2) return translate('{top} va primero con {value} ({share} % del total), {ratio} veces más que {last}, que va al final con {lastValue}.', { ...vars, ratio: ratio.toLocaleString(getLocale(), { maximumFractionDigits: 1 }) });
  return translate('{top} va primero con {value} ({share} % del total); {last} va al final con {lastValue}.', vars);
}
/** Describe dos series acumuladas: cuánto del primero se convierte en el segundo. */
export function describeShare(data: Point[], fmt: Fmt, names: [string, string], phrase: string): string {
  const a = data.reduce((s, d) => s + (d.values[0] ?? 0), 0); const b = data.reduce((s, d) => s + (d.values[1] ?? 0), 0);
  if (a === 0 && b === 0) return translate('Sin movimientos en el periodo.');
  const share = a > 0 ? Math.round((b / a) * 100) : 0;
  return `${names[0]}: ${fmt(a)}. ${names[1]}: ${fmt(b)}. ${phrase.replace('{pct}', translate('{n} %', { n: share }))}`;
}

interface TipState { x: number; y: number; title: string; rows: { name: string; value: string; color: string }[] }
function Tooltip({ t }: { t: TipState | null }) {
  if (!t) return null;
  return <div className="tip" style={{ left: t.x, top: t.y }} role="status"><span className="muted">{t.title}</span>{t.rows.map((r) => <span key={r.name} className="k"><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.color, marginRight: 6 }} />{r.name}</span><b>{r.value}</b></span>)}</div>;
}
function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return <div className="legend" aria-hidden="true">{series.map((s, i) => <span key={s.name}><i style={{ background: color(s, i) }} />{s.name}</span>)}</div>;
}
function TableView({ data, series, fmt, id }: { data: Point[]; series: Series[]; fmt: Fmt; id: string }) {
  const { t } = useT();
  return (
    <details><summary>{t('Ver los números')}</summary>
      <div className="tbl-scroll"><table id={id}><thead><tr><th>{t('Día')}</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.title ?? shortDay(d.label)}</td>{d.values.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}</tr>)}</tbody></table></div>
    </details>
  );
}
function Frame({ title, sub, children, legend, table, empty, insight }: { title: string; sub?: string; children: ReactNode; legend?: Series[]; table?: ReactNode; empty?: boolean; insight?: string }) {
  const { t } = useT();
  return (
    <div className="card chart">
      <div className="chart-head"><h3>{title}</h3>{sub && <small>{sub}</small>}</div>
      {legend && <Legend series={legend} />}
      {empty ? <div className="empty">{t('Todavía no hay datos en este periodo.')}</div> : children}
      {!empty && insight && <p className="chart-insight"><span className="chart-insight-dot" aria-hidden="true" />{insight}</p>}
      {!empty && table}
    </div>
  );
}

const W = 640; const PAD = { l: 48, r: 12, t: 18, b: 26 };
const tipTitle = (d: Point) => d.title ?? longDay(d.label);
/** Título del tooltip; si es el día en curso lo señala. */
const tipTitleNow = (d: Point) => (isToday(d.label) ? translate('{title} · hoy, en curso', { title: tipTitle(d) }) : tipTitle(d));

/** Gráfica de barras verticales (una o varias series agrupadas, o apiladas). */
export function BarChart({ title, sub, data, series, fmt = fmtInt, height = 200, stacked = false, labelLast = false, insight, markBest = true }: { title: string; sub?: string; data: Point[]; series: Series[]; fmt?: Fmt; height?: number; stacked?: boolean; labelLast?: boolean; insight?: string; markBest?: boolean }) {
  const { t } = useT();
  const id = useId();
  const [tip, setTip] = useState<TipState | null>(null);
  const H = height; const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const total = (d: Point) => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values));
  const max = useMemo(() => Math.max(0, ...data.map(total)), [data, stacked]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestIdx = useMemo(() => { let b = -1; data.forEach((d, i) => { if (!isToday(d.label) && (b < 0 || total(d) > total(data[b]))) b = i; }); return b; }, [data, stacked]); // eslint-disable-line react-hooks/exhaustive-deps
  const ys = ticks(max); const top = ys[ys.length - 1] || 1;
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const band = data.length ? iw / data.length : iw;
  const n = stacked ? 1 : series.length;
  const bw = Math.min(24, Math.max(3, (band * 0.7 - (n - 1) * 2) / n));
  const groupW = n * bw + (n - 1) * 2;
  const every = Math.max(1, Math.ceil(data.length / 8));
  const af = axisFmt(fmt);
  const show = (i: number, e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const d = data[i]; const cx = PAD.l + band * i + band / 2;
    setTip({ x: (cx / W) * r.width, y: (y(total(d)) / H) * r.height, title: tipTitleNow(d), rows: series.map((s, k) => ({ name: s.name, value: fmt(d.values[k] ?? 0), color: color(s, k) })) });
  };
  return (
    <Frame title={title} sub={sub} legend={series} empty={!data.length} insight={insight} table={<TableView data={data} series={series} fmt={fmt} id={id} />}>
      <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${insight ?? ''}`} aria-describedby={id}>
          {ys.map((v) => <g key={v}><line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} /><text className="tick" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">{af(v)}</text></g>)}
          <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
          {data.map((d, i) => {
            const x0 = PAD.l + band * i + (band - groupW) / 2;
            const today = isToday(d.label);
            let acc = 0;
            return (
              <g key={d.label} className={today ? 'partial' : undefined}>
                {d.values.map((v, k) => {
                  const h = Math.max(0, y(0) - y(v));
                  const yy = stacked ? y(acc + v) : y(v); if (stacked) acc += v;
                  const xx = stacked ? x0 : x0 + k * (bw + 2);
                  const rr = Math.min(4, h / 2);
                  const gap = stacked && k > 0 ? 2 : 0;
                  return h <= gap + rr ? null : <path key={k} fill={color(series[k], k)} d={`M${xx},${yy + h - gap} v${-(h - gap - rr)} q0,-${rr} ${rr},-${rr} h${bw - 2 * rr} q${rr},0 ${rr},${rr} v${h - gap - rr} z`} />;
                })}
                {markBest && i === bestIdx && data.length > 3 && <text className="lbl best" x={x0 + groupW / 2} y={y(total(d)) - 6} textAnchor="middle">{t('mejor día · {value}', { value: fmt(total(d)) })}</text>}
                {labelLast && i === data.length - 1 && !stacked && i !== bestIdx && <text className="lbl" x={x0 + groupW / 2} y={y(Math.max(...d.values)) - 5} textAnchor="middle">{today ? t('hoy · {value}', { value: fmt(Math.max(...d.values)) }) : fmt(Math.max(...d.values))}</text>}
                {i % every === 0 && <text className="tick" x={PAD.l + band * i + band / 2} y={H - 8} textAnchor="middle">{today ? t('hoy') : shortDay(d.label)}</text>}
                <rect className="hit" x={PAD.l + band * i} y={PAD.t} width={band} height={ih} tabIndex={0} onMouseEnter={(e) => show(i, e)} onFocus={(e) => show(i, e as unknown as React.MouseEvent)} onBlur={() => setTip(null)}><title>{`${tipTitle(d)}: ${series.map((s, k) => `${s.name} ${fmt(d.values[k] ?? 0)}`).join(', ')}`}</title></rect>
              </g>
            );
          })}
        </svg>
        <Tooltip t={tip} />
      </div>
    </Frame>
  );
}

/** Gráfica de líneas con cursor y tooltip; una o varias series sobre el mismo eje. */
export function LineChart({ title, sub, data, series, fmt = fmtInt, height = 200, area = true, insight }: { title: string; sub?: string; data: Point[]; series: Series[]; fmt?: Fmt; height?: number; area?: boolean; insight?: string }) {
  const { t } = useT();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const H = height; const iw = W - PAD.l - PAD.r; const ih = H - PAD.t - PAD.b;
  const max = useMemo(() => Math.max(0, ...data.flatMap((d) => d.values)), [data]);
  const ys = ticks(max); const top = ys[ys.length - 1] || 1;
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const x = (i: number) => (data.length <= 1 ? PAD.l + iw / 2 : PAD.l + (i / (data.length - 1)) * iw);
  const every = Math.max(1, Math.ceil(data.length / 8));
  const af = axisFmt(fmt);
  const lastClosed = data.length && isToday(data[data.length - 1].label) ? data.length - 2 : data.length - 1;
  const bestIdx = useMemo(() => { let b = -1; data.forEach((d, i) => { if (!isToday(d.label) && (b < 0 || (d.values[0] ?? 0) > (data[b].values[0] ?? 0))) b = i; }); return b; }, [data]);
  const paths = series.map((_, k) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.values[k] ?? 0).toFixed(1)}`).join(' '));
  const show = (i: number, e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const d = data[i]; setHover(i);
    setTip({ x: (x(i) / W) * r.width, y: (y(Math.max(...d.values)) / H) * r.height, title: tipTitleNow(d), rows: series.map((s, k) => ({ name: s.name, value: fmt(d.values[k] ?? 0), color: color(s, k) })) });
  };
  const slot = data.length > 1 ? iw / (data.length - 1) : iw;
  return (
    <Frame title={title} sub={sub} legend={series} empty={!data.length} insight={insight} table={<TableView data={data} series={series} fmt={fmt} id={id} />}>
      <div className="chart-wrap" onMouseLeave={() => { setTip(null); setHover(null); }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${insight ?? ''}`} aria-describedby={id}>
          {ys.map((v) => <g key={v}><line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} /><text className="tick" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">{af(v)}</text></g>)}
          <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
          {data.map((d, i) => (i % every === 0 || i === data.length - 1) && <text key={d.label} className="tick" x={x(i)} y={H - 8} textAnchor={i === data.length - 1 ? 'end' : 'middle'}>{isToday(d.label) ? t('hoy') : shortDay(d.label)}</text>)}
          {series.map((s, k) => (
            <g key={s.name}>
              {area && series.length === 1 && data.length > 1 && <path d={`${paths[k]} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} z`} fill={color(s, k)} opacity={0.1} />}
              <path d={paths[k]} fill="none" stroke={color(s, k)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {lastClosed >= 0 && <circle cx={x(lastClosed)} cy={y(data[lastClosed].values[k] ?? 0)} r={4} fill={color(s, k)} stroke="var(--surface-2)" strokeWidth={2} />}
              {lastClosed >= 0 && series.length <= 2 && <text className="lbl" x={x(lastClosed) - 6} y={y(data[lastClosed].values[k] ?? 0) - 8} textAnchor="end">{fmt(data[lastClosed].values[k] ?? 0)}</text>}
              {k === 0 && bestIdx >= 0 && bestIdx !== lastClosed && data.length > 3 && <g><circle cx={x(bestIdx)} cy={y(data[bestIdx].values[0] ?? 0)} r={4} fill="var(--surface)" stroke={color(s, k)} strokeWidth={2} /><text className="lbl best" x={x(bestIdx)} y={y(data[bestIdx].values[0] ?? 0) - 9} textAnchor="middle">{t('mejor día · {value}', { value: fmt(data[bestIdx].values[0] ?? 0) })}</text></g>}
              {data.length > 1 && isToday(data[data.length - 1].label) && <text className="tick partial-note" x={x(data.length - 1)} y={y(data[data.length - 1].values[k] ?? 0) - 8} textAnchor="end">{t('hoy, en curso')}</text>}
            </g>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />}
          {hover !== null && series.map((s, k) => <circle key={k} cx={x(hover)} cy={y(data[hover].values[k] ?? 0)} r={4} fill={color(s, k)} stroke="var(--surface-2)" strokeWidth={2} />)}
          {data.map((d, i) => <rect key={d.label} className="hit" x={x(i) - slot / 2} y={PAD.t} width={slot} height={ih} tabIndex={0} onMouseEnter={(e) => show(i, e)} onFocus={(e) => show(i, e as unknown as React.MouseEvent)} onBlur={() => { setTip(null); setHover(null); }}><title>{`${tipTitle(d)}: ${series.map((s, k) => `${s.name} ${fmt(d.values[k] ?? 0)}`).join(', ')}`}</title></rect>)}
        </svg>
        <Tooltip t={tip} />
      </div>
    </Frame>
  );
}

/** Barras horizontales de una serie, ordenadas, con valor en la punta y porcentaje del total. */
export function HBarChart({ title, sub, items, fmt = fmtInt, max: maxItems = 8, seriesName, insight }: { title: string; sub?: string; items: { label: string; value: number; sub?: string }[]; fmt?: Fmt; max?: number; seriesName?: string; insight?: string }) {
  const { t } = useT();
  const id = useId();
  const name0 = seriesName ?? t('Valor');
  const rows = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
  const total = items.reduce((s, r) => s + r.value, 0) || 1;
  const rh = 28; const H = rows.length * rh + 4; const labelW = 170; const valW = 110; const iw = W - labelW - valW;
  const text = insight ?? describeRanking(items, fmt, name0.toLowerCase());
  return (
    <Frame title={title} sub={sub} empty={!rows.length} insight={text} table={<TableView data={rows.map((r) => ({ label: r.label, title: r.label, values: [r.value] }))} series={[{ name: name0 }]} fmt={fmt} id={id} />}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${text}`} aria-describedby={id}>
        {rows.map((r, i) => {
          const w = Math.max(0, (r.value / max) * iw); const yy = i * rh + 4; const bh = 18; const rr = Math.min(4, w / 2);
          const name = r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label;
          return (
            <g key={r.label + i}>
              <text className="hbar-name" x={labelW - 10} y={yy + 13} textAnchor="end"><title>{r.label}</title>{name}</text>
              <line className="grid" x1={labelW} x2={labelW} y1={yy - 2} y2={yy + bh + 2} />
              {w > 0 && <path fill={i === 0 ? 'var(--chart-1)' : 'var(--chart-4)'} opacity={i === 0 ? 1 : 0.6} d={`M${labelW},${yy} h${w - rr} q${rr},0 ${rr},${rr} v${bh - 2 * rr} q0,${rr} -${rr},${rr} h-${w - rr} z`} />}
              <text className="lbl" x={labelW + w + 6} y={yy + 13}>{fmt(r.value)} <tspan className="tick">{t('· {n} % del total', { n: Math.round((r.value / total) * 100) })}</tspan></text>
              <rect className="hit" x={0} y={yy - 2} width={W} height={bh + 4}><title>{`${r.label}: ${fmt(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}</title></rect>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** Mini gráfica de barras sin ejes para incrustar en tarjetas (uso por día). */
export function Sparkbars({ values, labels, fmt = fmtInt, height = 48 }: { values: number[]; labels: string[]; fmt?: Fmt; height?: number }) {
  const { t } = useT();
  const max = Math.max(0, ...values) || 1; const w = 4; const gap = 2; const totalW = values.length * (w + gap);
  if (!values.length) return <span className="muted small">{t('Sin usos registrados.')}</span>;
  const best = values.indexOf(Math.max(...values));
  return (
    <svg viewBox={`0 0 ${totalW} ${height}`} width={Math.min(totalW, 400)} height={height} role="img" aria-label={t('Usos por día; el mejor fue el {day} con {value}', { day: longDay(labels[best]), value: fmt(values[best]) })} style={{ display: 'block' }}>
      {values.map((v, i) => { const h = Math.max(1, (v / max) * (height - 2)); return <rect key={i} x={i * (w + gap)} y={height - h} width={w} height={h} rx={1.5} fill={i === best ? 'var(--chart-1)' : 'var(--chart-4)'} opacity={i === best ? 1 : 0.7}><title>{`${longDay(labels[i])}: ${fmt(v)}`}</title></rect>; })}
    </svg>
  );
}
