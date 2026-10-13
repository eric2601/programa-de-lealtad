/**
 * Ilustraciones propias en SVG (trazo + relleno plano) para acceso, estados vacíos y portal.
 * Usan los colores del tema, así que funcionan en modo día y noche sin archivos externos.
 */
const stroke = { stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Bomba de gasolina con celular: identidad por teléfono en la bomba. */
export function PumpPhone({ width = 260 }: { width?: number }) {
  return (
    <svg viewBox="0 0 260 180" width={width} height={width * 0.69} role="img" aria-label="Bomba de gasolina y celular" style={{ color: 'var(--ink)' }}>
      <ellipse cx="130" cy="164" rx="110" ry="8" fill="var(--surface-3)" />
      <rect x="40" y="40" width="88" height="118" rx="10" fill="var(--surface-2)" {...stroke} />
      <rect x="54" y="54" width="60" height="34" rx="6" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <text x="84" y="77" textAnchor="middle" fontFamily="var(--mono)" fontSize="15" fontWeight="700" fill="var(--accent-strong)">36.5 L</text>
      <rect x="54" y="100" width="60" height="10" rx="5" fill="var(--surface-3)" />
      <rect x="54" y="118" width="40" height="10" rx="5" fill="var(--surface-3)" />
      <path d="M128 60h14a10 10 0 0 1 10 10v50a8 8 0 0 0 16 0V78l-8-8" fill="none" {...stroke} />
      <path d="M150 92h8" fill="none" {...stroke} />
      <rect x="176" y="70" width="52" height="92" rx="10" fill="var(--surface)" {...stroke} />
      <rect x="184" y="82" width="36" height="60" rx="4" fill="var(--surface-2)" />
      <circle cx="202" cy="152" r="3" fill="currentColor" />
      <circle cx="202" cy="100" r="12" fill="var(--accent)" />
      <path d="M196 100l4 4 8-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="188" y="120" width="28" height="6" rx="3" fill="var(--accent-soft)" />
      <rect x="188" y="130" width="18" height="6" rx="3" fill="var(--surface-3)" />
      <path d="M232 46l6-6M240 60h8M226 36v-8" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Tarjeta de regalo con estrellas: premios y puntos (portal). */
export function Rewards({ width = 200 }: { width?: number }) {
  return (
    <svg viewBox="0 0 200 140" width={width} height={width * 0.7} role="img" aria-label="Premios" style={{ color: 'var(--ink)' }}>
      <ellipse cx="100" cy="128" rx="80" ry="7" fill="var(--surface-3)" />
      <rect x="40" y="58" width="120" height="66" rx="10" fill="var(--surface-2)" {...stroke} />
      <rect x="32" y="44" width="136" height="24" rx="8" fill="var(--accent)" />
      <rect x="92" y="44" width="16" height="80" fill="var(--accent-strong)" opacity=".85" />
      <path d="M100 44c-14-2-26-12-20-22 6-8 18 2 20 14 2-12 14-22 20-14 6 10-6 20-20 22z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <path d="M26 30l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="var(--warn)" />
      <path d="M172 18l2 5 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1z" fill="var(--warn)" />
      <circle cx="176" cy="60" r="3" fill="var(--accent)" />
      <circle cx="22" cy="72" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

/** Caja abierta vacía: estados sin datos. */
export function EmptyBox({ width = 140 }: { width?: number }) {
  return (
    <svg viewBox="0 0 140 110" width={width} height={width * 0.78} role="img" aria-label="Sin datos" style={{ color: 'var(--muted)' }}>
      <ellipse cx="70" cy="100" rx="52" ry="6" fill="var(--surface-3)" />
      <path d="M30 48l40 16 40-16v38l-40 16-40-16z" fill="var(--surface-2)" {...stroke} />
      <path d="M70 64v38" fill="none" {...stroke} />
      <path d="M30 48l-12-16 40-8 12 16zM110 48l12-16-40-8-12 16" fill="var(--surface)" {...stroke} />
      <path d="M96 22l6-10M104 30l10-4" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Tablero con barras: dashboard y reportes vacíos o de bienvenida. */
export function ChartBoard({ width = 160 }: { width?: number }) {
  return (
    <svg viewBox="0 0 160 120" width={width} height={width * 0.75} role="img" aria-label="Gráfica" style={{ color: 'var(--ink)' }}>
      <ellipse cx="80" cy="112" rx="60" ry="6" fill="var(--surface-3)" />
      <rect x="20" y="16" width="120" height="84" rx="10" fill="var(--surface)" {...stroke} />
      <rect x="34" y="66" width="14" height="22" rx="3" fill="var(--surface-3)" />
      <rect x="56" y="52" width="14" height="36" rx="3" fill="var(--accent-soft)" />
      <rect x="78" y="40" width="14" height="48" rx="3" fill="var(--accent)" />
      <rect x="100" y="58" width="14" height="30" rx="3" fill="var(--surface-3)" />
      <path d="M34 44c14-10 26 2 40-10s24 0 42-8" fill="none" stroke="var(--accent-strong)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="116" cy="26" r="3.5" fill="var(--accent-strong)" />
    </svg>
  );
}
