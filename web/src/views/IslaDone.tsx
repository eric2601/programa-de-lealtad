import { useState } from 'react';
import { api, litros, pesos, type RevealResponse, type SaleResult } from '../api';
import { useT } from '../i18n';
import { Icon } from '../components/icons';
import { HintList } from '../components/Promos';
import { ScratchCard } from '../components/ScratchCard';
import { couponsOf, Ticket } from '../components/SaleSummary';
import { Kpi, Ring } from '../components/Visual';

interface Props { result: SaleResult; fuel: string; litersMl: number; priceCents: number; token: string; busy: boolean; onNext: () => void; onVoid: () => void; onScratchRevealed: (r: RevealResponse) => void }

/** Pantalla de confirmación tras registrar: qué ganó el cliente, cupones a entregar y siguiente cliente. */
export function IslaDone({ result, fuel, litersMl, priceCents, token, busy, onNext, onVoid, onScratchRevealed }: Props) {
  const { t } = useT();
  const [showScratch, setShowScratch] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const name = result.member.firstName;
  const gained = result.points.total + (result.points.promo ?? 0);
  const walletEarn = result.promotions?.walletEarnCents ?? 0;
  const walletNow = result.wallet?.availableCents ?? result.member.walletAvailableCents ?? 0;
  const coupons = couponsOf(result.promotions?.applied ?? []).filter((c) => c.couponCode);
  const nothing = gained <= 0 && walletEarn <= 0 && coupons.length === 0 && result.discountCents <= 0;
  const stampsLeft = result.stamp.stampsForReward - result.stamp.stamps;

  return (
    <>
      <div className="done-hero" role="status">
        <div className="emoji"><Icon name="check" size={26} strokeWidth={2.4} /></div>
        <h2>{t('Listo, {name} ya tiene sus beneficios', { name })}</h2>
        {nothing ? <p>{t('La compra quedó registrada.')}</p> : (
          <div className="stat-grid center">
            {gained > 0 && <Kpi icon="star" value={`+${gained}`} label={t('puntos hoy')} tone="accent" big />}
            {walletEarn > 0 && <Kpi icon="wallet" value={`+${pesos(walletEarn)}`} label={t('para su próxima visita')} tone="ok" big />}
            {result.discountCents > 0 && <Kpi icon="tag" value={`−${pesos(result.discountCents)}`} label={t('de descuento')} tone="violet" big />}
          </div>
        )}
        <div className="done-balance">
          <span>{t('Saldo:')}</span>
          <b>{result.member.points} {t('pts')}</b>
          <span className="muted">≈ {pesos(result.member.valueCents)}</span>
          {walletNow > 0 && <><span aria-hidden="true">·</span><b>{pesos(walletNow)}</b><span className="muted">{t('virtual')}</span></>}
        </div>
        {result.points.capped && <span className="pill warn">{t('Puntos limitados hasta confirmar su teléfono')}</span>}
        <span className="muted small mono">{t('Folio {folio}', { folio: result.posReference })}</span>
      </div>

      {coupons.map((c) => (
        <div key={c.promotionId} className="coupon-big">
          <span className="muted">{t('Entrega este cupón')}{c.couponLabel ? ` · ${c.couponLabel}` : ''}</span>
          <code>{c.couponCode}</code>
        </div>
      ))}

      {result.stamp.awarded && (
        <div className={`stamp-strip ${result.stamp.rewardEarned ? 'won' : ''}`}>
          <Ring value={result.stamp.stamps} max={result.stamp.stampsForReward} size={72} stroke={8} tone="violet" label={`${result.stamp.stamps}/${result.stamp.stampsForReward}`} />
          <div className="grow">
            <b>{result.stamp.rewardEarned ? t('Completó sus sellos') : t('Sello {n} de {total}', { n: result.stamp.stamps, total: result.stamp.stampsForReward })}</b>
            <span className="muted small">{result.stamp.rewardEarned ? t('Entrégale su recompensa por sellos.') : stampsLeft === 1 ? t('Le falta 1 carga para su regalo.') : t('Le faltan {n} cargas para su regalo.', { n: stampsLeft })}</span>
          </div>
        </div>
      )}

      {result.scratch && (
        <div className="promo-banner">
          <Icon name="gift" size={26} />
          <div className="grow"><strong>{t('Ganó una tarjeta Rasca y Gana')}</strong><div className="muted small">{t('Puede rascarla aquí o desde su celular. Vence el {date}.', { date: result.scratch.expiresAt.slice(0, 10) })}</div></div>
          {!showScratch && <button className="btn" onClick={() => setShowScratch(true)}>{t('Rascar aquí')}</button>}
        </div>
      )}
      {result.scratch && showScratch && (
        <ScratchCard
          card={{ id: result.scratch.cardId, status: 'available', createdAt: '', expiresAt: result.scratch.expiresAt, saleReference: result.posReference, prize: null }}
          reveal={(id) => api<RevealResponse>(`/scratch/${id}/reveal`, { method: 'POST', body: {}, token })}
          onRevealed={onScratchRevealed}
        />
      )}

      {result.promotions && <HintList hints={result.promotions.hints} title="Para la próxima vez" />}

      <div className="promo-how">
        <button type="button" className="link" aria-expanded={showTicket} onClick={() => setShowTicket(!showTicket)}><Icon name="receipt" size={16} />{showTicket ? t('Ocultar ticket') : t('Ver ticket')}</button>
        {showTicket && (
          <>
            <Ticket fuel={fuel} litersMl={litersMl} priceCents={priceCents} fuelCents={result.fuelCents} storeCents={result.storeCents} rewardCents={result.rewardCents}
              discountCents={result.discountCents} walletCents={result.walletSpentCents} paymentMethod={result.paymentMethod} paidCents={result.paidCents} paid />
            {result.rewardCents > 0 && <div className="muted small">{t('Pagó {amount} con puntos; acumuló sobre {liters} pagados.', { amount: pesos(result.rewardCents), liters: litros(result.eligibleLitersMl) })}</div>}
          </>
        )}
      </div>

      <button className="btn primary huge" onClick={onNext}>{t('Siguiente cliente')} <Icon name="arrowRight" size={22} /></button>
      <div className="row between small">
        <span className="muted">{t('¿Te equivocaste al capturar?')}</span>
        <button className="link" disabled={busy} onClick={onVoid}><Icon name="undo" size={16} /> {t('Anular esta venta')}</button>
      </div>
    </>
  );
}
