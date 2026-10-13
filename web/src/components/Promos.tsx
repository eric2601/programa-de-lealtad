import { useState } from 'react';
import { fecha, pesos, type LadderTier, type PromoApplied, type PromoHint, type PromoSkipped } from '../api';
import { translate, useT } from '../i18n';
import { Icon } from './icons';

/** "Antes del 12 sep" para fechas límite de regreso; vacío si ya pasó o no hay. */
export function deadlineText(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const date = fecha(iso);
  return days <= 1 ? translate('Antes del {date} (hoy)', { date })
    : days <= 7 ? translate('Antes del {date} ({n} días)', { date, n: days })
      : translate('Antes del {date}', { date });
}

/** Barra de avance genérica. Con `unit: 'visits'` se muestra como puntos (una carga = un punto). */
export function ProgressBar({ current, target, unit }: { current: number; target: number; unit: 'cents' | 'visits' }) {
  const { t } = useT();
  if (unit === 'visits') return <VisitDots current={current} target={target} />;
  const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(current, target)} aria-valuetext={t('{current} de {target}', { current: pesos(Math.min(current, target)), target: pesos(target) })}>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="progress-meta mono"><span>{pesos(Math.min(current, target))}</span><span>{pesos(target)}</span></div>
    </div>
  );
}

export function VisitDots({ current, target }: { current: number; target: number }) {
  const { t } = useT();
  const n = Math.max(1, Math.min(target, 12));
  return (
    <div className="visit-dots" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(current, target)} aria-valuetext={t('{current} de {target} cargas', { current: Math.min(current, target), target })}>
      {Array.from({ length: n }).map((_, i) => <span key={i} className={i < current ? 'on' : ''} />)}
      <span className="muted small mono">{Math.min(current, target)}/{target}</span>
    </div>
  );
}

/** Pistas del motor ("Te faltan $80 para obtener $50 de dinero virtual.") con su barra. */
export function HintList({ hints, title = 'Tu siguiente beneficio', max = 3 }: { hints: PromoHint[]; title?: string | null; max?: number }) {
  const { t } = useT();
  const [all, setAll] = useState(false);
  if (!hints.length) return null;
  const shown = all ? hints : hints.slice(0, max);
  return (
    <div className="hints">
      {title && <h3>{t(title)}</h3>}
      {shown.map((h) => {
        const dl = deadlineText(h.deadline);
        return (
          <div key={h.promotionId} className="hint">
            <div className="hint-text"><Icon name={h.targetCount != null ? 'repeat' : 'target'} size={18} /><span>{h.text}</span></div>
            {h.targetCents != null && <ProgressBar current={h.currentCents ?? 0} target={h.targetCents} unit="cents" />}
            {h.targetCount != null && <ProgressBar current={h.currentCount ?? 0} target={h.targetCount} unit="visits" />}
            {dl && <div className="deadline"><Icon name="clock" size={14} /> {dl}</div>}
            <div className="muted small">{h.promotionName}</div>
          </div>
        );
      })}
      {hints.length > max && <button type="button" className="link small" onClick={() => setAll(!all)}><Icon name={all ? 'chevronDown' : 'chevronRight'} size={14} />{all ? t('Ver menos') : t('Ver {n} más', { n: hints.length - max })}</button>}
    </div>
  );
}

/** Código de cupón grande para dictarlo o mostrarlo al cliente. */
export function CouponCode({ code, label }: { code: string; label?: string | null }) {
  const { t } = useT();
  return (
    <div className="coupon-code">
      <span className="muted small">{t('Entregar cupón')}{label ? ` · ${label}` : ''}</span>
      <code>{code}</code>
    </div>
  );
}

/** Promociones aplicadas a un despacho (vista previa o registrado). */
export function AppliedList({ applied, emptyText = 'Sin promociones para este despacho.' }: { applied: PromoApplied[]; emptyText?: string }) {
  const { t } = useT();
  if (!applied.length) return <div className="muted small">{t(emptyText)}</div>;
  return (
    <ul className="applied">
      {applied.map((a) => (
        <li key={a.promotionId}>
          <span className="applied-check"><Icon name="check" size={18} /></span>
          <div className="grow">
            <div className="applied-desc">{a.description}</div>
            <div className="muted small">{a.promotionName}{a.discountCents > 0 && ` · ${t('descuento {amount}', { amount: pesos(a.discountCents) })}`}</div>
            {a.couponCode && <CouponCode code={a.couponCode} label={a.couponLabel} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Promociones que no aplicaron y por qué (colapsable). */
export function SkippedList({ skipped }: { skipped: PromoSkipped[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (!skipped.length) return null;
  return (
    <div className="skipped">
      <button type="button" className="link small" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />{t('Por qué no aplican otras ({n})', { n: skipped.length })}</button>
      {open && (
        <ul>
          {skipped.map((s) => <li key={s.promotionId}><strong>{s.promotionName}</strong> <span className="muted">· {s.reason}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/** Escalera de una promoción escalonada: $400 → 10 puntos … $800 → $50. */
export function Ladder({ tiers, current }: { tiers: LadderTier[]; current?: number | null }) {
  const { t } = useT();
  const nextIdx = current == null ? -1 : tiers.findIndex((tier) => current < tier.minAmountCents);
  return (
    <ol className="ladder" aria-label={t('Niveles de la promoción')}>
      {tiers.map((tier, i) => {
        const reached = current != null && current >= tier.minAmountCents;
        const cls = reached ? 'reached' : i === nextIdx ? 'next' : i === tiers.length - 1 && current == null ? 'top' : '';
        return (
          <li key={i} className={cls}>
            <span className="ladder-dot" aria-hidden="true" />
            <div><div className="ladder-amount">{pesos(tier.minAmountCents)}</div><div className="ladder-label">{tier.label}</div></div>
          </li>
        );
      })}
    </ol>
  );
}
