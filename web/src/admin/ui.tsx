import { useEffect, useState, type ReactNode } from 'react';
import { pesos } from '../api';
import { Icon, type IconName } from '../components/icons';
import { EmptyBox } from '../components/Illustrations';
import { translate, useT } from '../i18n';
import { CAMPAIGN_STATUS_LABELS, PROMO_STATUS_LABELS, fmtDate, statusTone, type Inventory } from './api';

export function Loading({ text }: { text?: string }) {
  const { t } = useT();
  return <div className="card skeleton" aria-busy="true" aria-label={text ?? t('Cargando…')}><i /><i /><i /></div>;
}
export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { t } = useT();
  return <div className="alert error row between"><span>{text}</span>{onRetry && <button className="link" onClick={onRetry}>{t('Reintentar')}</button>}</div>;
}

/** Encabezado de sección: título, subtítulo corto y, opcionalmente, una explicación en lenguaje llano. */
export function Head({ title, sub, desc, children }: { title: string; sub?: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="admin-head">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}{desc && <p className="admin-desc">{desc}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** Explicaciones breves de términos que aparecen en los indicadores (en español; se traducen al dibujar). */
export const TERMS: Record<string, string> = {
  roi: 'Retorno de la inversión: cuánto ganaste por cada peso que costaron las promociones. Se calcula (margen incremental − costo) ÷ costo. +50 % significa que por cada $1 invertido regresaron $1.50.',
  margen: 'Margen incremental: la ganancia extra estimada gracias a las ventas adicionales de litros y tienda, comparando con el periodo anterior.',
  lift: 'Lift o incremento: cuánto subió un indicador (ticket, litros, transacciones) durante la promoción respecto al periodo anterior de la misma duración.',
  pasivo: 'Pasivo: dinero virtual o puntos que los clientes ya ganaron y todavía no han usado. Es un compromiso pendiente con ellos.',
  ticket: 'Ticket promedio: lo que gasta un cliente en promedio en cada visita (combustible + tienda).',
  recurrentes: 'Clientes que cargaron 2 o más veces en el periodo.',
  participantes: 'Clientes distintos que recibieron al menos un beneficio de una promoción.',
  costo: 'Suma del valor de los beneficios entregados (descuentos, puntos, dinero virtual, cupones).',
  concentracion: 'Números distintos ÷ cargas. Si un despachador registra muchas cargas en pocos números conviene revisar sus tickets.',
};

/** Término con explicación al pasar el cursor o al tocarlo ("¿Qué significa?"). */
export function Term({ k, children }: { k: keyof typeof TERMS; children: ReactNode }) {
  const { t } = useT();
  const tip = t(TERMS[k]);
  return <span className="term" tabIndex={0} title={tip} data-tip={tip}>{children}<i aria-hidden="true">?</i></span>;
}

/** Estado vacío amable con un icono, un texto y una acción opcional. */
export function Empty({ icon = 'list', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card empty-state">
      {icon === 'list' ? <EmptyBox width={130} /> : <span className="empty-ico"><Icon name={icon} size={24} /></span>}
      <b>{title}</b>
      {text && <span className="muted">{text}</span>}
      {action && <div className="row" style={{ justifyContent: 'center' }}>{action}</div>}
    </div>
  );
}

export function StatusPill({ status, kind = 'promo' }: { status: string; kind?: 'promo' | 'campaign' }) {
  const { t } = useT();
  const label = kind === 'campaign' ? (CAMPAIGN_STATUS_LABELS as Record<string, string>)[status] : (PROMO_STATUS_LABELS as Record<string, string>)[status];
  return <span className={`pill ${statusTone(status)}`}>{label ? t(label) : status}</span>;
}

export function Delta({ value, goodWhenUp = true, suffix }: { value: number | null | undefined; goodWhenUp?: boolean; suffix?: string }) {
  const { t, locale } = useT();
  const sfx = suffix ?? t('vs periodo anterior');
  if (value === null || value === undefined) return <span className="delta flat">{t('sin comparación')}</span>;
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  const good = dir === 'flat' ? 'flat' : (dir === 'up') === goodWhenUp ? 'up' : 'down';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●';
  return <span className={`delta ${good}`} title={sfx}>{arrow} {Math.abs(value).toLocaleString(locale, { maximumFractionDigits: 1 })} % <span className="muted" style={{ fontWeight: 500, fontFamily: 'var(--sans)' }}>{sfx}</span></span>;
}

export function Kpi({ label, value, sub, hero, help }: { label: ReactNode; value: ReactNode; sub?: ReactNode; hero?: boolean; help?: keyof typeof TERMS }) {
  return (
    <div className={`kpi${hero ? ' hero' : ''}`}>
      <span className="label">{help ? <Term k={help}>{label}</Term> : label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function InventoryBar({ inv, compact }: { inv: Inventory; compact?: boolean }) {
  const { t, locale } = useT();
  if (inv.initial === null) return <div className="inv"><small>{t('Sin límite de existencias · {used} usadas', { used: inv.used.toLocaleString(locale) })}</small></div>;
  const pct = inv.percentUsed ?? 0;
  const tone = inv.exhausted ? 'crit' : pct >= 85 ? 'warn' : '';
  return (
    <div className="inv">
      <div className="bar"><i className={tone} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <small>{compact ? `${inv.used}/${inv.initial} · ${pct} %` : t('Iniciales {initial} · usadas {used} · restantes {remaining} · {pct} %', { initial: inv.initial.toLocaleString(locale), used: inv.used.toLocaleString(locale), remaining: (inv.remaining ?? 0).toLocaleString(locale), pct })}
        {inv.exhausted && <> <span className="pill crit">{t('Agotada')}</span></>}</small>
    </div>
  );
}

export function Stars({ n }: { n: number | null }) {
  const { t } = useT();
  if (n === null) return <span className="muted">—</span>;
  return <span className="stars" aria-label={t('{n} de 5', { n })}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? '' : 'off'}>★</span>)}</span>;
}

/** Grupo de casillas con estilo de fichas. */
export function Checks<T extends string | number>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  const toggle = (k: T, on: boolean) => onChange(on ? [...value, k] : value.filter((x) => x !== k));
  return <div className="checks">{options.map((o) => <label key={String(o.key)}><input type="checkbox" checked={value.includes(o.key)} onChange={(e) => toggle(o.key, e.target.checked)} />{o.label}</label>)}</div>;
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`field ${className ?? ''}`}>{label}{children}{hint && <span className="muted" style={{ fontWeight: 400 }}>{hint}</span>}</label>;
}

/** Texto de fecha con vigencia: "12 ene 2026 → 30 ene 2026". Se evalúa al dibujar, así que toma el idioma activo. */
export const vigencia = (a?: string | null, b?: string | null) => (a || b ? `${fmtDate(a)} → ${fmtDate(b)}` : translate('Sin vigencia definida'));

export function Money({ cents }: { cents: number }) { return <span className="mono">{pesos(cents)}</span>; }

/** Copia texto al portapapeles con confirmación breve. */
export function CopyButton({ text }: { text: string }) {
  const { t } = useT();
  const [ok, setOk] = useState(false);
  useEffect(() => { if (!ok) return; const id = setTimeout(() => setOk(false), 1500); return () => clearTimeout(id); }, [ok]);
  return <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(text).then(() => setOk(true)).catch(() => setOk(false)); }}>{ok ? t('Copiado') : t('Copiar')}</button>;
}

/** Hook de carga con estado de error y recarga. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } }).catch((e) => { if (alive) { setError(e instanceof Error ? e.message : translate('Sin conexión.')); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
