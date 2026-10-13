import type { SVGProps } from 'react';

/**
 * Iconos de trazo propios (24 × 24, sin librerías). Un solo estilo para toda la interfaz:
 * línea de 1.75 px, extremos redondeados, sin relleno. Se pintan con `currentColor`.
 */
const PATHS = {
  fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h10M6 9h6M14 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2.5-2.5',
  store: 'M3 9l1.5-5h15L21 9M3 9v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 13v8h14v-8M10 21v-5h4v5',
  coffee: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zM17 10h2a2 2 0 0 1 0 4h-2M7 4v2M11 3v3',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  wash: 'M5 10h14l-1 10H6L5 10zM7 10V7a5 5 0 0 1 10 0v3M4 4l1.5 1.5M20 4l-1.5 1.5M12 2v2',
  oil: 'M7 8h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM9 8V5h4v3M17 12h2l2 3v3h-4',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 10h.01M19 14h.01',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  truck: 'M2 6h12v10H2zM14 10h4l3 3v3h-7zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  car: 'M4 13l2-6h12l2 6M3 13h18v5h-2M3 18h2M6 18h12M7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  taxi: 'M4 13l2-6h12l2 6M3 13h18v5H3zM9 7V5h6v2M7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  moto: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 14l4-6h4l3 6M13 8h3l2 3M9 8H7',
  fleet: 'M2 8h10v8H2zM12 11h4l3 3v2h-7zM5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19 5h3v3',
  app: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h6M9 15h3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7a2 2 0 0 1 2-2h11M16 14h.01',
  ticket: 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3v4zM3 12v4M14 4v12',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-3 0-5-1.5-5-3.5S9 3 12 6c3-3 5-.5 5 1.5S15 9 12 9z',
  stamp: 'M6 21h12M8 17h8a2 2 0 0 0 2-2v-1H6v1a2 2 0 0 0 2 2zM9 14V9a3 3 0 0 1 6 0v5',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 2.7-5 6-5s6 2 6 5M14 15c3.3 0 6 2 6 5',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  pin: 'M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  check: 'M4 12.5l5 5L20 6.5',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  receipt: 'M5 3h14v18l-2.5-2-2.5 2-2-2-2 2-2.5-2L5 21V3zM8 8h8M8 12h8M8 16h5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  repeat: 'M17 2l4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3',
  hourglass: 'M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4',
  tag: 'M20 12l-8 8-9-9V4h7l10 8zM7.5 7.5h.01',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  alert: 'M12 3l10 18H2L12 3zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  sparkle: 'M12 2l1.8 4.6L18 8l-4.2 1.4L12 14l-1.8-4.6L6 8l4.2-1.4L12 2zM5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16z',
  party: 'M4 20l4-12 8 8-12 4zM12 5l1-2M16 9l2-1M14 3l4 2-2 4M19 13l2 1',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  backspace: 'M21 5H8l-6 7 6 7h13V5zM12 9l5 5M17 9l-5 5',
  logout: 'M9 21H4V3h5M15 17l5-5-5-5M20 12H9',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  bank: 'M3 10l9-6 9 6M4 10v9M8 10v9M12 10v9M16 10v9M20 10v9M2 19h20',
  fire: 'M12 22c4 0 7-3 7-7 0-3-2-5-3-6 0 2-1 3-2 3 0-3-1-6-4-8 0 3-2 5-4 7-1 1.5-1 3-1 4 0 4 3 7 7 7z',
  idcard: 'M2 6h20v12H2zM6 10h4M6 14h4M14 10h4M14 14h4',
  megaphone: 'M3 11l18-5v12L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-4',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z',
  handshake: 'M2 9l4-4 6 3 6-3 4 4-4 5-3 3-2-1-2 1-3-3-4-5zM8 12l3 3',
  pie: 'M12 3a9 9 0 1 1-9 9h9V3zM12 3a9 9 0 0 1 9 9h-9',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14h2v2h-2zM17 19h4v2h-4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, strokeWidth = 1.75, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Marca de la aplicación: una pistola de despacho estilizada dentro de un rombo. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" />
      <path d="M10 23V10a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 18 10v13M10 23h8M11.5 13h5M18 13h1.5a1.5 1.5 0 0 1 1.5 1.5V20a1 1 0 0 0 2 0v-6l-2-2" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
