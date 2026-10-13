import type { CSSProperties } from 'react';

/**
 * Pictogramas rellenos (lámina `docs/arte-original/pictos-sheet.png` recortada en 15 máscaras PNG).
 * Se pintan como máscara CSS, así toman `currentColor` y funcionan en modo día y noche.
 */
export const PICTOS = {
  pump: 'picto-01', carFuel: 'picto-02', gift: 'picto-03', tag: 'picto-04', card: 'picto-05',
  store: 'picto-06', wash: 'picto-07', tire: 'picto-08', tools: 'picto-09', ev: 'picto-10',
  coins: 'picto-11', map: 'picto-12', userStar: 'picto-13', bell: 'picto-14', chart: 'picto-15',
} as const;
export type PictoName = keyof typeof PICTOS;

export function Picto({ name, size = 28, className = '', style, title }: { name: PictoName; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  const url = `url(/pictos/${PICTOS[name]}.png)`;
  return (
    <span className={`picto ${className}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url, ...style }} />
  );
}
