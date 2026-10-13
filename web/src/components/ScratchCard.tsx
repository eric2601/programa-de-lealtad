import { useEffect, useRef, useState } from 'react';
import type { RevealResponse, ScratchCardDto, ScratchPrize } from '../api';
import { translate, useT } from '../i18n';

interface Props {
  card: ScratchCardDto;
  /** Pide al servidor el premio (y lo acredita). Se llama en el primer toque. */
  reveal: (cardId: string) => Promise<RevealResponse>;
  onRevealed?: (r: RevealResponse) => void;
}

const BRUSH = 24;
const CLEAR_THRESHOLD = 0.55;

/**
 * Tarjeta "Carga, Rasca y Gana". El premio lo decide el servidor al emitir la tarjeta; aquí
 * solo se descubre. Al primer toque se pide el premio y se pinta bajo la capa plateada; el
 * cliente sigue rascando y, al despejar más de la mitad, la capa desaparece con confeti.
 */
export function ScratchCard({ card, reveal, onRevealed }: Props) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prize, setPrize] = useState<ScratchPrize | null>(card.prize);
  const [done, setDone] = useState(card.status === 'revealed');
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const revealing = useRef(false);
  const scratching = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (done) return;
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
    c.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = rect.width, h = rect.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#A8A296'); g.addColorStop(0.45, '#DAD4C8'); g.addColorStop(0.55, '#C4BDB0'); g.addColorStop(1, '#8E877A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#FFFFFF';
    for (let x = -h; x < w; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.lineTo(x + h + 6, h); ctx.lineTo(x + 6, 0); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2A241B'; ctx.font = '700 16px "Manrope", system-ui, sans-serif'; ctx.textAlign = 'center';
    // `translate` (no `t`) para que cambiar de idioma no vuelva a pintar la capa plateada.
    ctx.fillText(translate('RASCA AQUÍ'), w / 2, h / 2 - 4);
    ctx.font = '500 12px "Manrope", system-ui, sans-serif';
    ctx.fillText(translate('desliza el dedo para descubrir tu premio'), w / 2, h / 2 + 16);
  }, [done]);

  async function ensureReveal() {
    if (prize || revealing.current) return;
    revealing.current = true;
    try { const r = await reveal(card.id); setPrize(r.prize); onRevealed?.(r); }
    catch (e) { revealing.current = false; setError(e instanceof Error ? e.message : t('No se pudo revelar.')); }
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function scratchLine(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    const c = canvasRef.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    const start = from ?? to;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - start.x, to.y - start.y) / 6));
    for (let i = 0; i <= steps; i++) {
      const x = start.x + ((to.x - start.x) * i) / steps, y = start.y + ((to.y - start.y) * i) / steps;
      ctx.beginPath(); ctx.arc(x, y, BRUSH, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function clearedFraction(): number {
    const c = canvasRef.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return 0;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, total = 0;
    const step = 6 * 4 * Math.max(1, Math.round(devicePixelRatio));
    for (let i = 3; i < data.length; i += step) { total++; if (data[i] < 40) clear++; }
    return total ? clear / total : 0;
  }
  function finish() {
    setConfetti(true); setDone(true);
    window.setTimeout(() => setConfetti(false), 1800);
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scratching.current = true; last.current = pos(e);
    void ensureReveal();
    scratchLine(null, last.current);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scratching.current) return;
    const p = pos(e); scratchLine(last.current, p); last.current = p;
  };
  const onUp = () => {
    scratching.current = false; last.current = null;
    if (prize && clearedFraction() > CLEAR_THRESHOLD) finish();
  };

  const expired = card.status === 'expired' || card.status === 'cancelled';
  return (
    <div className={`scratch ${done ? 'done' : ''} ${expired ? 'expired' : ''}`}>
      <div className="scratch-face" aria-live="polite">
        {expired ? (
          <><span className="scratch-label">{t('Tarjeta vencida')}</span><span className="scratch-sub">{t('Carga de {ref}', { ref: card.saleReference ?? '—' })}</span></>
        ) : prize ? (
          <><span className="scratch-label">{prize.label}</span><span className="scratch-sub">{done ? t('Ya están en tu saldo') : t('sigue rascando…')}</span></>
        ) : (
          <><span className="scratch-label">?</span><span className="scratch-sub">{t('Carga {ref} · vence {date}', { ref: card.saleReference ?? '', date: card.expiresAt.slice(0, 10) })}</span></>
        )}
      </div>
      {!done && !expired && (
        <canvas ref={canvasRef} className="scratch-overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} />
      )}
      {confetti && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 60}ms`, background: ['#3FD3DF', '#EEF2F6', '#3ED17F', '#F5B841', '#22B8C6'][i % 5] }} />)}
        </div>
      )}
      {error && <div className="alert error" style={{ marginTop: '.5rem' }}>{error}</div>}
    </div>
  );
}
