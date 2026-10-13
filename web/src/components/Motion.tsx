import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useT } from '../i18n';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cifra que cuenta desde 0 (o desde el valor anterior) hasta el valor actual. `format` da el texto final. */
export function NumberTicker({ value, format = (v) => Math.round(v).toLocaleString('es-MX'), duration = 900, className }: { value: number; format?: (v: number) => string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(reduceMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduceMotion()) { setShown(value); return; }
    const start = performance.now(); const a = from.current; const b = value;
    // setInterval en vez de requestAnimationFrame: sigue avanzando (más lento) aunque la pestaña esté oculta.
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration); const e = 1 - Math.pow(1 - p, 3);
      setShown(a + (b - a) * e);
      if (p >= 1) { from.current = b; window.clearInterval(id); }
    }, 16);
    return () => window.clearInterval(id);
  }, [value, duration]);
  return <span className={className} aria-label={format(value)}>{format(shown)}</span>;
}

/** Minigráfica de área sin ejes para meter dentro de una tarjeta. */
export function Sparkline({ values, width = 120, height = 36, tone = 'var(--accent)', fill = true, className }: { values: number[]; width?: number; height?: number; tone?: string; fill?: boolean; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values); const min = Math.min(0, ...values);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const d = `M${pts.join(' L')}`;
  const id = `sp-${Math.round(max)}-${values.length}`;
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
      {fill && (
        <>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone} stopOpacity=".35" /><stop offset="100%" stopColor={tone} stopOpacity="0" /></linearGradient></defs>
          <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={d} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={tone} />
    </svg>
  );
}

/** Tarjeta con un halo que sigue al cursor (spotlight). Puramente decorativo; no interfiere con el contenido. */
export function Spotlight({ children, className = '', style, as: Tag = 'div' }: { children: ReactNode; className?: string; style?: CSSProperties; as?: 'div' | 'section' | 'article' }) {
  const ref = useRef<HTMLElement | null>(null);
  const move = (e: MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  const Comp = Tag as 'div';
  return <Comp ref={ref as React.RefObject<HTMLDivElement>} className={`spot ${className}`} style={style} onMouseMove={move}>{children}</Comp>;
}

/** Envoltorio que aplica entrada escalonada a sus hijos directos (vía CSS `.stagger > *`). */
export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`stagger ${className}`}>{children}</div>;
}

/** Punto que late para indicar datos en vivo. */
export function LiveDot({ label = 'En vivo' }: { label?: string }) {
  const { t } = useT();
  return <span className="live"><i aria-hidden="true" />{t(label)}</span>;
}
