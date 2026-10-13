import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { useT } from '../i18n';

type Tone = 'accent' | 'violet' | 'ok' | 'warn' | 'crit' | 'neutral';

/** Anillo de progreso con el valor grande al centro. */
export function Ring({ value, max, size = 96, stroke = 9, tone = 'accent', label, sub, children }: {
  value: number; max: number; size?: number; stroke?: number; tone?: Tone; label?: ReactNode; sub?: ReactNode; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`ring tone-${tone}`} style={{ width: size, height: size }} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={typeof sub === 'string' ? sub : undefined}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-center">{children ?? <><b>{label}</b>{sub && <span>{sub}</span>}</>}</div>
    </div>
  );
}

/** Mosaico de indicador: icono, número grande y una palabra. */
export function Kpi({ icon, value, label, sub, tone = 'neutral', big }: { icon: IconName; value: ReactNode; label: string; sub?: ReactNode; tone?: Tone; big?: boolean }) {
  return (
    <div className={`stat-tile tone-${tone}${big ? ' big' : ''}`}>
      <span className="stat-ico"><Icon name={icon} size={big ? 24 : 20} /></span>
      <div className="stat-body">
        <b className="stat-value">{value}</b>
        <span className="stat-label">{label}</span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

/** Lista de barras horizontales proporcionales al mayor valor. */
export function BarList({ rows, tone = 'accent' }: { rows: { label: ReactNode; value: number; display: ReactNode; tone?: Tone; icon?: IconName }[]; tone?: Tone }) {
  const { t } = useT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {rows.map((r, i) => (
        <div key={i} className={`bar tone-${r.tone ?? tone}`}>
          <div className="bar-head">
            <span className="bar-label">{r.icon && <Icon name={r.icon} size={16} />}{r.label}</span>
            <span className="bar-value mono">{r.display}</span>
          </div>
          <div className="bar-track" role="img" aria-label={t('{pct} % del mayor', { pct: Math.round((r.value / max) * 100) })}><div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Icono con fondo suave. */
export function Ico({ name, tone = 'accent', size = 40 }: { name: IconName; tone?: Tone; size?: number }) {
  return <span className={`ico-badge tone-${tone}`} style={{ width: size, height: size }}><Icon name={name} size={Math.round(size * 0.5)} /></span>;
}

/** Fila de pestañas grandes con icono (para el portal). */
export function IconTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; icon: IconName; label: string; badge?: number }[]; value: T; onChange: (k: T) => void }) {
  const { t: tr } = useT();
  return (
    <nav className="icon-tabs" role="tablist" aria-label={tr('Secciones del portal')}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          <span className="it-ico"><Icon name={t.icon} size={22} /></span>
          <span className="it-label">{t.label}</span>
          {!!t.badge && <span className="it-badge" aria-label={tr('{n} elementos', { n: t.badge })}>{t.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Aviso con icono según el tipo. */
export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'info' | 'warn'; children: ReactNode }) {
  const icon: IconName = kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : 'info';
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={icon} size={18} /><span>{children}</span></div>;
}

/** Estado de carga en forma de líneas grises. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const { t } = useT();
  return <div className="card skeleton" aria-busy="true" aria-label={t('Cargando')}>{Array.from({ length: lines }).map((_, i) => <i key={i} />)}</div>;
}
