import { useState, type FormEvent } from 'react';
import { pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { WALLET_KIND_LABELS, WALLET_STATUS_LABELS, adminApi, errorText, fmtDate, fmtNum, toCents, type WalletResponse } from '../api';
import { Field, Head, Kpi } from '../ui';

const walletTone = (s: string) => (s === 'active' ? 'ok' : s === 'partial' ? 'warn' : s === 'used' || s === 'done' ? 'info' : s === 'expired' ? 'neutral' : 'crit');
const couponTone = (s: string) => (s === 'issued' ? 'ok' : s === 'redeemed' ? 'info' : s === 'expired' ? 'neutral' : 'crit');
/** Etiquetas en español; se traducen al dibujar. */
const COUPON_STATUS: Record<string, string> = { issued: 'Vigente', redeemed: 'Canjeado', expired: 'Vencido', cancelled: 'Cancelado' };

export function Wallet() {
  const { t } = useT();
  const { token, catalog } = useAdmin();
  const [phone, setPhone] = useState('');
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState(() => ({ amount: '', days: '30', note: t('Bonificación manual') }));
  const [crediting, setCrediting] = useState(false);
  const [creditMsg, setCreditMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function search(p = phone) {
    if (!p.trim()) return;
    setLoading(true); setError(null); setCreditMsg(null);
    try { setData(await adminApi<WalletResponse>(`/wallet?phone=${encodeURIComponent(p.trim())}`, token)); }
    catch (e) { setData(null); setError(errorText(e)); } finally { setLoading(false); }
  }
  async function doCredit(e: FormEvent) {
    e.preventDefault(); if (!data) return;
    const amountCents = toCents(credit.amount);
    if (!amountCents || amountCents <= 0) { setCreditMsg({ ok: false, text: t('Indica un monto mayor que cero.') }); return; }
    if (!confirm(t('¿Abonar {amount} de dinero virtual a {name} ({phone})?', { amount: pesos(amountCents), name: data.member.firstName, phone: data.member.maskedPhone }))) return;
    setCrediting(true); setCreditMsg(null);
    try {
      const r = await adminApi<{ movementId: string; availableCents: number }>('/wallet/credit', token, { body: { phone: phone.trim(), amountCents, expiresDays: Number(credit.days) || 30, note: credit.note || t('Bonificación manual') } });
      setCreditMsg({ ok: true, text: t('Abono registrado. Saldo disponible: {amount}.', { amount: pesos(r.availableCents) }) });
      setCredit({ ...credit, amount: '' });
      await search();
    } catch (err) { setCreditMsg({ ok: false, text: errorText(err) }); } finally { setCrediting(false); }
  }
  const segLabel = (k: string) => catalog.segments.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="admin-main">
      <Head title={t('Clientes y dinero virtual')} sub={t('Consulta el saldo de un cliente por teléfono, revisa sus movimientos y abona bonificaciones manuales.')}
        desc={t('Escribe el celular del cliente para ver sus puntos, su dinero virtual y sus cupones. También puedes regalarle dinero virtual, por ejemplo para compensar un problema.')} />
      <form className="card" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <div className="filters">
          <Field label={t('Teléfono del cliente')} className="grow"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55 1234 5678" autoFocus /></Field>
          <button className="btn primary" disabled={loading || !phone.trim()}>{loading ? t('Buscando…') : t('Buscar')}</button>
        </div>
        {error && <div className="alert error">{error}</div>}
      </form>

      {data && (
        <>
          <div className="card">
            <div className="row between">
              <div className="row"><h2>{data.member.firstName}</h2><span className="mono muted">{data.member.maskedPhone}</span><span className="pill violet">{data.member.customerTypeLabel}</span>{data.member.verified ? <span className="pill ok">{t('Verificado')}</span> : <span className="pill warn">{t('Sin verificar')}</span>}</div>
              <div className="badge-row">{data.member.segments.map((s) => <span key={s} className="pill neutral">{segLabel(s)}</span>)}</div>
            </div>
            <div className="meta small muted">{t('Puntos:')} <b className="mono" style={{ color: 'var(--ink)' }}>{fmtNum(data.member.points)}</b> ({pesos(data.member.valueCents)}) · {t('Última compra:')} {fmtDate(data.member.lastPurchaseAt, true)}</div>
          </div>
          <section className="kpis" aria-label={t('Saldo')}>
            <Kpi hero label={t('Saldo disponible')} value={pesos(data.wallet.availableCents)} sub={data.wallet.nextExpiry ? <span className="pill warn">{t('{amount} vencen el {date}', { amount: pesos(data.wallet.nextExpiry.cents), date: fmtDate(data.wallet.nextExpiry.at) })}</span> : t('Sin vencimientos próximos')} />
            <Kpi label={t('Generado')} value={pesos(data.wallet.generatedCents)} />
            <Kpi label={t('Utilizado')} value={pesos(data.wallet.usedCents)} />
            <Kpi label={t('Expirado')} value={pesos(data.wallet.expiredCents)} sub={data.wallet.cancelledCents > 0 ? t('cancelado {amount}', { amount: pesos(data.wallet.cancelledCents) }) : undefined} />
          </section>

          <div className="grid-2">
            <form className="card accent" onSubmit={doCredit}>
              <h3>{t('Abonar bonificación manual')}</h3>
              <div className="form-grid">
                <Field label={t('Monto (MXN)')} className="num"><input inputMode="decimal" required value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} placeholder="50" /></Field>
                <Field label={t('Vence en (días)')} className="num"><input inputMode="numeric" value={credit.days} onChange={(e) => setCredit({ ...credit, days: e.target.value })} /></Field>
                <Field label={t('Nota')} className="span-2"><input value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} /></Field>
              </div>
              {creditMsg && <div className={`alert ${creditMsg.ok ? 'ok' : 'error'}`}>{creditMsg.text}</div>}
              <div className="row"><button className="btn primary" disabled={crediting}>{crediting ? t('Abonando…') : t('Abonar')}</button><span className="muted small">{t('Queda registrado en auditoría con tu usuario y estación.')}</span></div>
            </form>
            <div className="card tbl">
              <h3>{t('Cupones')}</h3>
              {data.coupons.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{t('Sin cupones vigentes o recientes.')}</p> : (
                <table>
                  <thead><tr><th>{t('Código')}</th><th>{t('Cupón')}</th><th>{t('Estado')}</th><th>{t('Vence')}</th><th className="num">{t('Valor')}</th></tr></thead>
                  <tbody>{data.coupons.map((c) => <tr key={c.id}><td><span className="mono-code">{c.code}</span></td><td>{c.label ?? c.promotionName ?? c.kind}{c.partnerName && <div className="muted small">{c.partnerName}</div>}</td><td><span className={`pill ${couponTone(c.status)}`}>{COUPON_STATUS[c.status] ? t(COUPON_STATUS[c.status]) : c.status}</span></td><td className="small">{fmtDate(c.validUntil)}</td><td className="num">{pesos(c.valueCents)}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card tbl">
            <h3>{t('Movimientos')}</h3>
            {data.wallet.movements.length === 0 ? <p className="muted small">{t('Sin movimientos.')}</p> : (
              <table>
                <thead><tr><th>{t('Fecha')}</th><th>{t('Movimiento')}</th><th>{t('Origen')}</th><th className="num">{t('Monto')}</th><th className="num">{t('Restante')}</th><th>{t('Estado')}</th><th>{t('Vence')}</th><th>{t('Estación / ticket')}</th></tr></thead>
                <tbody>{data.wallet.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{fmtDate(m.createdAt, true)}</td>
                    <td><b>{WALLET_KIND_LABELS[m.kind] ? t(WALLET_KIND_LABELS[m.kind]) : m.kind}</b>{m.note && <div className="muted small">{m.note}</div>}</td>
                    <td className="small">{m.promotionName ?? m.sourceType}</td>
                    <td className="num">{m.kind === 'earn' ? '+' : m.kind === 'spend' ? '−' : ''}{pesos(m.amountCents)}</td>
                    <td className="num">{m.kind === 'earn' ? pesos(m.remainingCents) : '—'}</td>
                    <td><span className={`pill ${walletTone(m.status)}`}>{WALLET_STATUS_LABELS[m.status] ? t(WALLET_STATUS_LABELS[m.status]) : m.status}</span></td>
                    <td className="small">{m.expiresAt ? fmtDate(m.expiresAt) : '—'}</td>
                    <td className="small">{m.stationName ?? '—'}{m.saleReference && <div className="mono muted">{m.saleReference}</div>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
