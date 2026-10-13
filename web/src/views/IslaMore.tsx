import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage, pesos, type CouponRedeemResult, type Member, type OutboxMessage, type SaleResult } from '../api';
import { useT } from '../i18n';
import { Icon } from '../components/icons';
import { Alert } from '../components/Visual';

export interface Redemption { redemptionId: string; points: number; valueCents: number; devCode?: string; confirmed: boolean }

interface Props {
  token: string; phone: string; member: Member | null; result: SaleResult | null; busy: boolean;
  redemption: Redemption | null; onRedemption: (r: Redemption | null) => void;
  onExpired: () => void; onNotice: (text: string) => void; onRefreshMember: () => Promise<void>;
}

/**
 * "Más opciones" de la bomba: confirmar teléfono, pagar con puntos (canje con código), canjear un cupón
 * y los mensajes enviados en desarrollo. Todo secundario, plegado por defecto.
 */
export function IslaMore({ token, phone, member, result, busy, redemption, onRedemption, onExpired, onNotice, onRefreshMember }: Props) {
  const { t } = useT();
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [code, setCode] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const working = busy || localBusy;

  useEffect(() => {
    api<OutboxMessage[]>('/dev/outbox').then(setOutbox).catch(() => { /* solo en desarrollo */ });
  }, [result, redemption, verify]);

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setLocalBusy(true); setError(null);
    try { return await fn(); } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setError(errorMessage(err));
    } finally { setLocalBusy(false); }
  }

  async function startVerify() {
    const v = await guard(() => api<{ challengeId: string; devCode?: string }>('/verify/start', { body: { phone }, token }));
    if (v) setVerify(v);
  }
  async function confirmVerify() {
    if (!verify) return;
    const ok = await guard(() => api('/verify/confirm', { body: { challengeId: verify.challengeId, code: verifyCode }, token }));
    if (ok !== undefined) { setVerify(null); setVerifyCode(''); onNotice(t('Teléfono confirmado. Ya puede pagar con puntos.')); await onRefreshMember(); }
  }
  async function prepareRedeem() {
    const r = await guard(() => api<{ redemptionId: string; points: number; valueCents: number; devCode?: string }>('/redemptions/prepare', { body: { phone, points: redeemPoints }, token }));
    if (r) onRedemption({ ...r, confirmed: false });
  }
  async function confirmRedeem() {
    if (!redemption) return;
    const r = await guard(() => api<{ status: string }>('/redemptions/confirm', { body: { redemptionId: redemption.redemptionId, code }, token }));
    if (r) { onRedemption({ ...redemption, confirmed: true }); setCode(''); onNotice(t('Listo: {n} puntos ({amount}) se descuentan al cobrar.', { n: redemption.points, amount: pesos(redemption.valueCents) })); }
  }
  async function cancelRedeem() {
    if (!redemption) return;
    await guard(() => api(`/redemptions/${redemption.redemptionId}/cancel`, { method: 'POST', body: {}, token }));
    onRedemption(null); setCode('');
  }
  async function redeemCoupon() {
    setCouponMsg(null); setLocalBusy(true);
    try {
      const r = await api<CouponRedeemResult>('/coupons/redeem', { body: { code: couponInput.trim().toUpperCase(), saleId: result?.saleId }, token });
      const label = r.label ?? couponInput.toUpperCase();
      setCouponMsg({
        ok: true,
        text: r.valueCents > 0
          ? t('Cupón válido: {label} ({amount}). Entrega el beneficio al cliente.', { label, amount: pesos(r.valueCents) })
          : t('Cupón válido: {label}. Entrega el beneficio al cliente.', { label }),
      });
      setCouponInput('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setCouponMsg({ ok: false, text: errorMessage(err) });
    } finally { setLocalBusy(false); }
  }

  const redeemOptions: number[] = [];
  if (member) for (let p = member.redemption.minPoints; p <= member.availablePoints; p += member.redemption.stepPoints) redeemOptions.push(p);
  const showRedeem = !!member && member.canRedeem && !result;
  const showVerify = !!member && !member.verified;

  return (
    <details className="more-options">
      <summary><Icon name="chevronRight" size={16} /> {t('Más opciones')}{showVerify ? ` · ${t('confirmar teléfono')}` : ''}{showRedeem ? ` · ${t('pagar con puntos')}` : ''} · {t('canjear cupón')}</summary>
      {error && <Alert kind="error">{error}</Alert>}

      {showVerify && (
        <div className="card">
          <h3 className="friendly">{t('Confirmar el teléfono')}</h3>
          <p className="muted small">{t('Le mandamos un código por WhatsApp. Con el teléfono confirmado puede pagar con puntos y gana sin límite.')}</p>
          {!verify ? <button className="btn" disabled={working} onClick={startVerify}><Icon name="send" size={16} /> {t('Enviar código al cliente')}</button> : (
            <div className="row">
              <input className="code-input" style={{ width: 150 }} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" aria-label={t('Código de confirmación')} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <button className="btn primary" disabled={working || verifyCode.length < 4} onClick={confirmVerify}>{t('Confirmar')}</button>
              {verify.devCode && <span className="pill neutral">{t('demo: código {code}', { code: verify.devCode })}</span>}
            </div>
          )}
        </div>
      )}

      {showRedeem && member && (
        <div className="card">
          <h3 className="friendly">{t('Pagar con puntos')}</h3>
          <p className="muted small">{t('El cliente recibe un código por WhatsApp; con ese código se descuentan los puntos de esta compra.')}</p>
          {!redemption ? (
            <div className="row">
              <select className="grow" aria-label={t('Puntos a usar')} value={redeemPoints} onChange={(e) => setRedeemPoints(Number(e.target.value))}>
                <option value={0}>{t('¿Cuántos puntos quiere usar?')}</option>
                {redeemOptions.map((p) => <option key={p} value={p}>{t('{n} puntos = {amount}', { n: p, amount: pesos(p * member.redemption.pointValueCents) })}</option>)}
              </select>
              <button className="btn" disabled={working || !redeemPoints} onClick={prepareRedeem}><Icon name="send" size={16} /> {t('Enviar código')}</button>
            </div>
          ) : redemption.confirmed ? (
            <div className="row between">
              <span className="pill ok"><Icon name="check" size={12} /> {t('Se descontarán {n} puntos ({amount}) al cobrar', { n: redemption.points, amount: pesos(redemption.valueCents) })}</span>
              <button className="link" onClick={cancelRedeem}>{t('Quitar')}</button>
            </div>
          ) : (
            <div className="row">
              <span className="small">{t('Código que recibió el cliente ({n} puntos):', { n: redemption.points })}</span>
              <input className="code-input" style={{ width: 150 }} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" aria-label={t('Código de canje')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <button className="btn primary" disabled={working || code.length < 4} onClick={confirmRedeem}>{t('Confirmar')}</button>
              <button className="link" onClick={cancelRedeem}>{t('Cancelar')}</button>
              {redemption.devCode && <span className="pill neutral">{t('demo: código {code}', { code: redemption.devCode })}</span>}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="friendly">{t('Canjear un cupón')}</h3>
        <p className="muted small">{t('Escribe el código que trae el cliente (de una promoción o de un negocio aliado).')}{result ? ` ${t('Se liga al folio {folio}.', { folio: result.posReference })}` : ''}</p>
        <div className="row">
          <input className="grow mono" style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontSize: '1.1rem', width: 'auto' }} aria-label={t('Código del cupón')}
            placeholder="CAFE-XXXXXX" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16))}
            onKeyDown={(e) => { if (e.key === 'Enter' && couponInput.trim().length >= 4) void redeemCoupon(); }} />
          <button className="btn" disabled={working || couponInput.trim().length < 4} onClick={redeemCoupon}>{t('Canjear')}</button>
        </div>
        {couponMsg && <Alert kind={couponMsg.ok ? 'ok' : 'error'}>{couponMsg.text}</Alert>}
      </div>

      <details>
        <summary>{t('Mensajes enviados (solo en desarrollo, sustituye a WhatsApp)')}</summary>
        <div className="outbox">
          {outbox.length === 0 && <span className="muted">{t('Sin mensajes todavía.')}</span>}
          {outbox.map((m, i) => <div key={i}><b>{m.kind}</b> → {m.to}: {m.text}</div>)}
        </div>
      </details>
    </details>
  );
}
