import type { Section } from './AdminPanel';

/** Iconos de trazo (SVG en línea, sin librerías) para el menú del panel y las tarjetas de inicio. */
const PATHS: Record<Section, string> = {
  inicio: 'M3 11l9-8 9 8M5 10v10h14V10',
  dashboard: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  campanas: 'M3 11l18-5v12L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-4',
  promociones: 'M20 12l-8 8-9-9V4h7l10 8zM7.5 7.5h.01',
  generador: 'M12 2l1.8 4.6L18 8l-4.2 1.4L12 14l-1.8-4.6L6 8l4.2-1.4L12 2zM5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16z',
  investigacion: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  asociados: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 2.7-5 6-5s6 2 6 5M14 15c3.3 0 6 2 6 5',
  segmentos: 'M12 3a9 9 0 1 1-9 9h9V3zM12 3a9 9 0 0 1 9 9h-9',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7a2 2 0 0 1 2-2h11M16 14h.01',
  notificaciones: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4',
};

export function NavIcon({ name }: { name: Section }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
