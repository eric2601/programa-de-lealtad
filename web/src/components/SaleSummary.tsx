import { litros, pesos, PAYMENT_METHOD_LABELS, type Member, type PaymentMethod, type PreviewResult, type PromoApplied } from '../api';
import { useT } from '../i18n';
import { Icon } from './icons';
import { HintList, SkippedList } from './Promos';
import { Alert, Kpi } from './Visual';

export const FUEL_NAMES: Record<string, string> = { regular: 'Regular', premium: 'Premium', diesel: 'Diésel' };

/** Cupones que se entregarán (los que tienen etiqueta o código). */
export const couponsOf = (applied: PromoApplied[]) => applied.filter((a) => a.couponLabel || a.couponCode);

/** Tarjeta "Gana hoy": puntos, dinero virtual y cupones que obtiene el cliente con esta compra, como mosaicos con icono. */
export function GainCard({ points, walletCents, coupons, discountCents, title = 'Gana hoy' }: { points: number; walletCents: number; coupons: PromoApplied[]; discountCents?: number; title?: string }) {
  const { t } = useT();
  const nothing = points <= 0 && walletCents <= 0 && coupons.length === 0 && !(discountCents && discountCents > 0);
  return (
    <div className="gain" aria-live="polite">
      <h3><Icon name="sparkle" size={16} /> {t(title)}</h3>
      {nothing ? <span className="muted">{t('Con esta compra todavía no gana puntos ni premios.')}</span> : (
        <div className="stat-grid">
          {points > 0 && <Kpi icon="star" value={`+${points}`} label={t('puntos')} tone="accent" />}
          {walletCents > 0 && <Kpi icon="wallet" value={`+${pesos(walletCents)}`} label={t('para su próxima visita')} tone="ok" />}
          {!!discountCents && discountCents > 0 && <Kpi icon="tag" value={`−${pesos(discountCents)}`} label={t('descuento hoy')} tone="violet" />}
          {coupons.map((c) => <Kpi key={c.promotionId} icon="ticket" value={t('Cupón')} label={c.couponLabel ?? c.promotionName} tone="warn" />)}
        </div>
      )}
    </div>
  );
}

export function Ticket({ fuel, litersMl, priceCents, fuelCents, storeCents, rewardCents, discountCents, walletCents, paymentMethod, paidCents, paid }: {
  fuel: string; litersMl: number; priceCents: number; fuelCents: number; storeCents: number; rewardCents: number; discountCents: number; walletCents: number; paymentMethod: PaymentMethod; paidCents: number; paid?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="ticket" aria-live="polite">
      {fuel && <div className="line"><span>{t(FUEL_NAMES[fuel] ?? fuel)} · {litros(litersMl)} × {pesos(priceCents)}</span><span>{pesos(fuelCents)}</span></div>}
      {storeCents > 0 && <div className="line"><span>{t('Tienda y servicios')}</span><span>{pesos(storeCents)}</span></div>}
      {rewardCents > 0 && <div className="line"><span>{t('Pagado con puntos')}</span><span>−{pesos(rewardCents)}</span></div>}
      {discountCents > 0 && <div className="line"><span>{t('Descuento por promoción')}</span><span>−{pesos(discountCents)}</span></div>}
      {walletCents > 0 && <div className="line"><span>{t('Pagado con dinero virtual')}</span><span>−{pesos(walletCents)}</span></div>}
      <div className="line"><span>{t('Forma de pago')}</span><span>{t(PAYMENT_METHOD_LABELS[paymentMethod])}</span></div>
      <div className="line total"><span>{paid ? t('Pagó el cliente') : t('Paga el cliente')}</span><span>{pesos(paidCents)}</span></div>
    </div>
  );
}

interface SummaryProps {
  member: Member; preview: PreviewResult | null; previewError: string | null;
  fuel: string; litersMl: number; priceCents: number; fuelCents: number; storeCents: number; rewardCents: number; paymentMethod: PaymentMethod;
  useWallet: boolean; onUseWallet: (v: boolean) => void; walletSpend: string; onWalletSpend: (v: string) => void;
}

/** Paso 3: resumen de beneficios, pago con dinero virtual y ticket. */
export function SaleSummary({ member, preview, previewError, fuel, litersMl, priceCents, fuelCents, storeCents, rewardCents, paymentMethod, useWallet, onUseWallet, walletSpend, onWalletSpend }: SummaryProps) {
  const { t } = useT();
  const totalCents = fuelCents + storeCents;
  const walletAvailable = member.walletAvailableCents ?? 0;
  const walletMax = preview?.maxWalletSpendCents ?? 0;
  const walletRaw = Math.round(parseFloat(walletSpend || '0') * 100);
  // La vista previa ya se calculó con el monto de dinero virtual elegido (0 si el interruptor está apagado).
  const walletShown = preview?.walletSpendCents ?? 0;
  const discount = preview?.discountCents ?? 0;
  const paid = preview ? preview.paidCents : Math.max(0, totalCents - rewardCents);
  return (
    <>
      {previewError && <Alert kind="warn">{previewError}</Alert>}
      {!preview && !previewError && <div className="skeleton" aria-busy="true" aria-label={t('Calculando beneficios')}><i /><i /><i /></div>}
      {preview && (
        <>
          <GainCard points={preview.basePoints + preview.promoPoints} walletCents={preview.walletEarnCents} coupons={couponsOf(preview.promotions.applied)} discountCents={preview.discountCents} />
          {preview.promotions.applied.length > 0 && (
            <div className="applied-chips" aria-label={t('Promociones que aplican')}>{preview.promotions.applied.map((a) => <span key={a.promotionId} className="pill ok"><Icon name="check" size={12} />{a.promotionName}</span>)}</div>
          )}
          <HintList hints={preview.promotions.hints} title="Para la próxima vez" />
          <SkippedList skipped={preview.promotions.skipped} />
        </>
      )}

      {walletAvailable > 0 && (
        <div className="wallet-pay">
          <label className="wallet-toggle">
            <input type="checkbox" checked={useWallet} disabled={walletMax <= 0} onChange={(e) => { onUseWallet(e.target.checked); if (e.target.checked && !walletSpend) onWalletSpend((walletMax / 100).toFixed(2)); }} />
            <span>{t('Pagar con dinero virtual')} <span className="muted small">{t('(tiene {amount})', { amount: pesos(walletAvailable) })}</span></span>
          </label>
          {walletMax <= 0 && preview && (
            <div className="muted small">{t('Su dinero virtual tiene condiciones (compra mínima o solo tienda) y hoy no aplica.')}</div>
          )}
          {useWallet && walletMax > 0 && (
            <div className="row">
              <label className="field num grow">{t('Cuánto usar ($)')}
                <input inputMode="decimal" value={walletSpend} onChange={(e) => onWalletSpend(e.target.value.replace(/[^\d.]/g, ''))}
                  onBlur={() => { if (walletRaw > walletMax) onWalletSpend((walletMax / 100).toFixed(2)); }} />
                <span className="help">{t('Máximo {amount} en esta compra.', { amount: pesos(walletMax) })}</span>
              </label>
              <button className="btn" type="button" onClick={() => onWalletSpend((walletMax / 100).toFixed(2))}>{t('Usar todo')}</button>
            </div>
          )}
        </div>
      )}

      <Ticket fuel={fuel} litersMl={litersMl} priceCents={priceCents} fuelCents={fuelCents} storeCents={storeCents}
        rewardCents={preview?.redemptionCents ?? rewardCents} discountCents={discount} walletCents={walletShown} paymentMethod={paymentMethod} paidCents={paid} />
    </>
  );
}
