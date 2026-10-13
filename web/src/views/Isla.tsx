import { useEffect, useRef, useState } from 'react';
import {
  api, ApiError, errorMessage, fecha, formatPhone, formatPlateInput, isPlateComplete, newKey, pesos, CUSTOMER_TYPE_LABELS, PAYMENT_METHOD_LABELS, STORE_ITEMS,
  type CouponDto, type CustomerType, type Lookup, type Member, type PaymentMethod, type PreviewResult, type RevealResponse, type SaleResult, type Session,
} from '../api';
import { useT } from '../i18n';
import { Icon, type IconName } from '../components/icons';
import { Picto, type PictoName } from '../components/Picto';
import { Keypad } from '../components/Keypad';
import { Alert } from '../components/Visual';
import { SaleSummary } from '../components/SaleSummary';
import { Stepper } from '../components/Stepper';
import { plateKind, VEHICLE_KIND_LABELS } from '../plates';
import { IslaDone } from './IslaDone';
import { IslaMore, type Redemption } from './IslaMore';

type FuelType = 'regular' | 'premium' | 'diesel';
type Step = 1 | 2 | 3;
const STEPS = ['¿Quién carga?', '¿Qué cargó?', 'Beneficios y cobro'];
const PRICES: Record<FuelType, string> = { regular: '23.89', premium: '25.99', diesel: '25.49' };
const FUEL_CHOICES: { key: FuelType | ''; label: string; icon: PictoName }[] = [
  { key: 'regular', label: 'Regular', icon: 'pump' }, { key: 'premium', label: 'Premium', icon: 'carFuel' }, { key: 'diesel', label: 'Diésel', icon: 'ev' }, { key: '', label: 'Solo tienda', icon: 'store' },
];
const PAY_ICONS: Record<PaymentMethod, PictoName> = { efectivo: 'coins', tarjeta: 'card', digital: 'card', flotilla: 'carFuel' };
const TYPE_ICONS: Record<CustomerType, IconName> = { particular: 'car', taxi: 'taxi', moto: 'moto', plataforma: 'app', flotilla: 'fleet' };
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
const CUSTOMER_TYPES = Object.keys(CUSTOMER_TYPE_LABELS) as CustomerType[];

function MemberStrip({ member, onChange }: { member: Member; onChange: () => void }) {
  const { t } = useT();
  return (
    <div className="member-strip">
      <span className="avatar" aria-hidden="true">{member.firstName.charAt(0).toUpperCase()}</span>
      <div className="grow">
        <div className="row"><span className="name">{member.firstName}</span><span className="muted mono small">{member.maskedPhone}</span>
          {member.verified ? <span className="pill ok">{t('teléfono confirmado')}</span> : <span className="pill warn">{t('sin confirmar')}</span>}</div>
        <div className="member-stats">
          <span className="mstat"><Icon name="star" size={16} /><b>{member.points}</b><small>{t('pts')} · {pesos(member.valueCents)}</small></span>
          <span className="mstat"><Icon name="wallet" size={16} /><b>{pesos(member.walletAvailableCents ?? 0)}</b><small>{t('virtual')}</small></span>
          <span className="mstat"><Icon name="stamp" size={16} /><b>{member.stamps}/{member.stampsForReward}</b><small>{t('sellos')}</small></span>
          {member.scratchPending > 0 && <span className="mstat warn"><Icon name="gift" size={16} /><b>{member.scratchPending}</b><small>{t('por rascar')}</small></span>}
        </div>
      </div>
      <button className="link" onClick={onChange}>{t('Cambiar')}</button>
    </div>
  );
}

/** Lo que el cliente tiene a favor al llegar: cupones, dinero virtual y tarjetas por rascar. */
function Benefits({ member, coupons }: { member: Member; coupons: CouponDto[] }) {
  const { t } = useT();
  const wallet = member.walletAvailableCents ?? 0;
  const none = coupons.length === 0 && wallet <= 0 && member.scratchPending === 0;
  return (
    <div className="benefits" aria-label={t('Beneficios del cliente')}>
      <h3 className="friendly">{t('Beneficios del cliente')}</h3>
      {coupons.map((c) => (
        <div key={c.id} className="benefit"><Icon name="ticket" size={18} /><span><b>{c.label ?? c.promotionName ?? t('Cupón')}</b> <code>{c.code}</code> <small className="muted">{t('vence')} {fecha(c.validUntil)}</small></span></div>
      ))}
      {wallet > 0 && <div className="benefit"><Icon name="wallet" size={18} /><span><b>{pesos(wallet)}</b> {t('de dinero virtual para pagar esta carga.')}</span></div>}
      {member.scratchPending > 0 && <div className="benefit"><Icon name="gift" size={18} /><span>{t('Tiene {n} tarjeta(s) de Rasca y Gana por rascar.', { n: member.scratchPending })}</span></div>}
      {none && <p className="muted small">{t('Sin cupones ni dinero virtual. Al registrar la carga se aplican las promociones vigentes.')}</p>}
    </div>
  );
}

export function Isla({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const { t } = useT();
  const token = session.token;
  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'phone' | 'plate'>('phone');
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreKey, setMoreKey] = useState(0);

  // alta breve
  const [firstName, setFirstName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [customerType, setCustomerType] = useState<CustomerType>('particular');
  const [birthday, setBirthday] = useState('');

  // despacho
  const [pump, setPump] = useState('4');
  const [fuel, setFuel] = useState<FuelType | ''>('regular');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState(PRICES.regular);
  const [store, setStore] = useState('');
  const [storeItems, setStoreItems] = useState<string[]>([]);
  const [folio, setFolio] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [useWallet, setUseWallet] = useState(false);
  const [walletSpend, setWalletSpend] = useState('');
  const [redemption, setRedemption] = useState<Redemption | null>(null);
  const [result, setResult] = useState<SaleResult | null>(null);

  // vista previa
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

  const member: Member | null = lookup?.found ? lookup.member : null;
  const digits = phone.replace(/\D/g, '');
const plateOk = isPlateComplete(plate);  /** Con lo que se identifica al cliente en el servidor: celular o placa. */  const ident = mode === 'plate' ? plate : digits;  const identReady = mode === 'plate' ? plateOk : digits.length >= 10;
  const litersMl = Math.round(parseFloat(liters || '0') * 1000);
  const priceCents = Math.round(parseFloat(price || '0') * 100);
  const storeCents = Math.round(parseFloat(store || '0') * 100);
  const fuelCents = fuel ? Math.round((litersMl * priceCents) / 1000) : 0;
  const totalCents = fuelCents + storeCents;
  const rewardCents = redemption?.confirmed ? redemption.valueCents : 0;
  const walletSpendRaw = useWallet ? Math.round(parseFloat(walletSpend || '0') * 100) : 0;
  const walletSpendCents = preview ? Math.min(walletSpendRaw, preview.maxWalletSpendCents) : walletSpendRaw;
  const saleReady = totalCents > 0 && (fuel === '' || (litersMl > 0 && priceCents > 0));

  function saleBody(posReference: string) {
    return {
      phone: ident, posReference, pumpNumber: pump ? Number(pump) : undefined,
      fuelType: fuel || undefined, litersMl: fuel ? litersMl : 0, pricePerLiterCents: fuel ? priceCents : 0, storeCents, storeItems,
      redemptionId: redemption?.confirmed ? redemption.redemptionId : undefined,
      paymentMethod, walletSpendCents, source: 'manual' as const,
    };
  }

  // Vista previa (sin registrar) cada vez que cambia el despacho, con espera de 300 ms.
  const membershipId = member?.membershipId ?? null;
  const redemptionKey = redemption?.confirmed ? redemption.redemptionId : '';
  const itemsKey = storeItems.join(',');
  useEffect(() => {
    previewSeq.current += 1;
    const seq = previewSeq.current;
    if (!membershipId || result || !saleReady) { setPreview(null); setPreviewError(null); return; }
    const timer = window.setTimeout(async () => {
      try {
        const p = await api<PreviewResult>('/sales/preview', { body: saleBody(folio.trim() || 'VISTA-PREVIA'), token });
        if (seq === previewSeq.current) { setPreview(p); setPreviewError(null); }
      } catch (err) {
        if (seq !== previewSeq.current) return;
        if (err instanceof ApiError && err.status === 401) onExpired();
        setPreview(null); setPreviewError(errorMessage(err));
      }
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId, result, saleReady, fuel, litersMl, priceCents, storeCents, itemsKey, paymentMethod, walletSpendRaw, redemptionKey]);

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setError(null); setNotice(null);
    try { return await fn(); } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setError(errorMessage(err));
    } finally { setBusy(false); }
  }

  function reset() {
    setPhone(''); setLookup(null); setLiters(''); setStore(''); setStoreItems([]); setFolio(''); setPaymentMethod('efectivo');
    setResult(null); setRedemption(null); setUseWallet(false); setWalletSpend(''); setPreview(null); setPreviewError(null);
    setError(null); setNotice(null); setFirstName(''); setMarketing(false); setCustomerType('particular'); setBirthday('');
    setStep(1); setMoreKey((k) => k + 1); window.scrollTo({ top: 0 });
  }
  function goStep(s: Step) { setError(null); setStep(s); window.scrollTo({ top: 0 }); }

  async function refreshMember() {
    const r = await guard(() => api<Lookup>('/lookup', { body: { phone: ident }, token }));
    if (r) setLookup(r);
  }
  async function doLookup() {
    setNotice(null);
    const r = await guard(() => api<Lookup>('/lookup', { body: { phone: ident }, token }));
    if (!r) return;
    setRegPhone('');
    setLookup(r);
    if (r.found) goStep(2);
  }
  async function enroll() {
    const m = await guard(() => api<Member>('/memberships', { body: { phone: mode === 'plate' ? regPhone : digits, firstName: firstName.trim(), marketingConsent: marketing, customerType, birthday: birthday || null, ...(mode === 'plate' ? { plate } : {}) }, token }));
    if (m) {
      setLookup({ found: true, blocked: false, member: m });
      setNotice(`${t('{name} ya está en el programa.', { name: m.firstName })} ${session.program.description}`);
      goStep(2);
    }
  }
  async function registerSale() {
    const r = await guard(() => api<SaleResult>('/sales', { body: saleBody(folio.trim()), token, headers: { 'Idempotency-Key': newKey() } }));
    if (r) { setResult(r); setLookup({ found: true, blocked: false, member: r.member }); setRedemption(null); setPreview(null); window.scrollTo({ top: 0 }); }
  }
  async function voidSale() {
    if (!result || !confirm(t('¿Anular esta venta? Se quitan los puntos y beneficios que se dieron.'))) return;
    const r = await guard(() => api<{ balance: number }>(`/sales/${result.saleId}/void`, { body: { reason: 'error de captura' }, token }));
    if (r) { setResult(null); setUseWallet(false); setWalletSpend(''); await refreshMember(); setNotice(t('Venta anulada. {name} tiene {n} puntos.', { name: member?.firstName ?? t('El cliente'), n: r.balance })); goStep(2); }
  }
  function onScratchRevealed(r: RevealResponse) {
    if (lookup?.found) setLookup({ ...lookup, member: { ...lookup.member, points: r.balance, valueCents: r.balance * lookup.member.redemption.pointValueCents, scratchPending: Math.max(0, lookup.member.scratchPending - 1) } });
    setNotice(t('Rasca y Gana: {prize}. Nuevo saldo: {n} puntos.', { prize: r.prize.label, n: r.balance }));
  }

  const toggleItem = (k: string) => setStoreItems((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const paidCents = preview ? preview.paidCents : Math.max(0, totalCents - rewardCents);
  const step2Problem = !fuel && storeCents <= 0 ? t('Escribe cuánto compró en tienda.')
    : fuel && litersMl <= 0 ? t('Escribe los litros que cargó.')
      : fuel && priceCents <= 0 ? t('Revisa el precio por litro.')
        : !folio.trim() ? t('Escribe el folio del ticket para continuar.') : null;

  const more = member && (
    <IslaMore key={moreKey} token={token} phone={ident} member={member} result={result} busy={busy} redemption={redemption} onRedemption={setRedemption}
      onExpired={onExpired} onNotice={setNotice} onRefreshMember={refreshMember} />
  );

  // ---- Registrado: confirmación ----
  if (result) {
    return (
      <div className="wizard">
        {notice && <Alert kind="ok">{notice}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <IslaDone result={result} fuel={fuel} litersMl={litersMl} priceCents={priceCents} token={token} busy={busy} onNext={reset} onVoid={voidSale} onScratchRevealed={onScratchRevealed} />
        {more}
      </div>
    );
  }

  return (
    <div className="wizard">
      <Stepper steps={STEPS.map((s) => t(s))} current={step} onGo={(n) => goStep(n as Step)} />
      {notice && <Alert kind="ok">{notice}</Alert>}

      {/* ---- Paso 1: ¿Quién carga? ---- */}
      {step === 1 && (
        <section className="card accent">
          <div className="step-title"><h2 className="hero-title" style={{ fontSize: "1.6rem" }}>{t('¿Quién')} <em className="ac">{t('carga')}</em>?</h2><p>{mode === 'plate' ? t('Escribe la placa del auto o la moto.') : t('Pídele al cliente su celular de 10 dígitos.')}</p></div>
          <div className="lang-toggle id-toggle" role="group" aria-label={t('Identificar por')}>
            <button type="button" className={mode === 'phone' ? 'on' : ''} aria-pressed={mode === 'phone'} onClick={() => { setMode('phone'); setLookup(null); }}>{t('Celular')}</button>
            <button type="button" className={mode === 'plate' ? 'on' : ''} aria-pressed={mode === 'plate'} onClick={() => { setMode('plate'); setLookup(null); }}>{t('Placa')}</button>
          </div>
          {mode === 'phone' ? (
            <>
              <label className="field big">{t('Celular del cliente')}
                <input className="phone-input" inputMode="numeric" placeholder="55 4433 4317" value={formatPhone(phone)} autoFocus
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setLookup(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && digits.length >= 10) void doLookup(); }} />
                <span className="help">{t('Ejemplo: 55 4433 4317')}</span>
              </label>
              <Keypad disabled={busy} onDigit={(d) => { setPhone((p) => (p + d).slice(0, 10)); setLookup(null); }} onDelete={() => { setPhone((p) => p.slice(0, -1)); setLookup(null); }} onClear={() => { setPhone(''); setLookup(null); }} />
            </>
          ) : (
            <label className="field big">{t('Placa del vehículo')}
              <input className="phone-input plate-input" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABC-123-D" value={plate} autoFocus
                onChange={(e) => { setPlate(formatPlateInput(e.target.value)); setLookup(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && plateOk) void doLookup(); }} />
              <span className="help">{plateKind(plate) ? `${t('Tipo de vehículo')}: ${t(VEHICLE_KIND_LABELS[plateKind(plate)!])}` : t('Edomex: ABC-123-D. CDMX: A01-ABC. Moto: 1234A5.')}</span>
            </label>
          )}
          <button className="btn primary huge" disabled={busy || !identReady} onClick={doLookup}>{busy ? t('Buscando…') : <>{t('Buscar cliente')} <Icon name="arrowRight" size={22} /></>}</button>
          {error && <Alert kind="error">{error}</Alert>}
          {lookup && !lookup.found && lookup.blocked && <Alert kind="warn">{t('Este número es de un empleado del grupo y no puede acumular puntos.')}</Alert>}

          {lookup && !lookup.found && !lookup.blocked && (
            <div className="card">
              <div className="step-title"><h2 className="friendly">{mode === 'plate' ? t('Placa nueva: regístrala en un paso') : t('Número nuevo: regístralo en un paso')}</h2><p>{mode === 'plate' ? t('Pide su celular y su nombre. La placa {plate} queda asociada a su número.', { plate }) : t('Solo el nombre y el tipo de cliente.')}</p></div>
              {mode === 'plate' && (
                <label className="field big">{t('Celular del cliente')}
                  <input className="phone-input" inputMode="numeric" placeholder="55 4433 4317" value={formatPhone(regPhone)} autoFocus onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                </label>
              )}
              {mode === 'plate' && plateKind(plate) && <p className="muted small">{t('Tipo de vehículo')}: <b>{t(VEHICLE_KIND_LABELS[plateKind(plate)!])}</b></p>}
              <label className="field big">{t('¿Cómo se llama?')}
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('Nombre de pila')} autoFocus={mode === 'phone'} onKeyDown={(e) => { if (e.key === 'Enter' && firstName.trim()) void enroll(); }} />
              </label>
              <div className="field">{t('Tipo de cliente')}
                <div className="choices">
                  {CUSTOMER_TYPES.map((ct) => <button key={ct} type="button" className={`choice ${customerType === ct ? 'on' : ''}`} aria-pressed={customerType === ct} onClick={() => setCustomerType(ct)}><Icon name={TYPE_ICONS[ct]} size={20} />{t(CUSTOMER_TYPE_LABELS[ct])}</button>)}
                </div>
              </div>
              <label className="consent"><input type="checkbox" checked readOnly /><span><b>{t('Participa en el programa de puntos de {tenant}.', { tenant: session.tenant.name })}</b> {t('Es necesario para acumular.')}</span></label>
              <label className="consent"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /><span><b>{t('Quiere recibir promociones por WhatsApp.')}</b> {t('Es opcional y lo puede cambiar cuando quiera.')}</span></label>
              <details>
                <summary>{t('Agregar cumpleaños (opcional)')}</summary>
                <label className="field" style={{ marginTop: '.5rem' }}>{t('Fecha de cumpleaños')}<input type="date" value={birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthday(e.target.value)} /></label>
              </details>
              <p className="muted small">{session.program.description} {t('El aviso de privacidad completo le llega por WhatsApp.')}</p>
              <button className="btn primary huge" disabled={busy || !firstName.trim() || (mode === 'plate' && regPhone.length < 10)} onClick={enroll}>{busy ? t('Registrando…') : t('Registrar y continuar')}</button>
            </div>
          )}
        </section>
      )}

      {/* ---- Paso 2: ¿Qué cargó? ---- */}
      {step === 2 && member && (
        <section className="card">
          <MemberStrip member={member} onChange={reset} />
          <Benefits member={member} coupons={lookup?.found ? lookup.coupons ?? [] : []} />
          <div className="step-title"><h2 className="hero-title" style={{ fontSize: "1.6rem" }}>{t('¿Qué')} <em className="ac">{t('cargó')}</em>?</h2><p>{t('Elige el combustible y escribe los litros. Si solo compró en tienda, elige “Solo tienda”.')}</p></div>
          <div className="choices">
            {FUEL_CHOICES.map((f) => (
              <button key={f.key} type="button" className={`choice ${fuel === f.key ? 'on' : ''}`} aria-pressed={fuel === f.key}
                onClick={() => { setFuel(f.key); if (f.key) setPrice(PRICES[f.key]); }}><Picto name={f.icon} size={24} />{t(f.label)}</button>
            ))}
          </div>
          {fuel && (
            <div className="row">
              <label className="field big grow">{t('Litros')}
                <input inputMode="decimal" placeholder="35.20" value={liters} onChange={(e) => setLiters(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
                <span className="help">{t('Como aparece en la bomba.')}</span>
              </label>
              <label className="field num" style={{ width: 150 }}>{t('Precio por litro')}
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
                <span className="help">{t('Se llena solo.')}</span>
              </label>
            </div>
          )}
          <label className="field big">{t('Tienda y servicios ($)')}
            <input inputMode="decimal" placeholder="0.00" value={store} onChange={(e) => setStore(e.target.value.replace(/[^\d.]/g, ''))} autoFocus={!fuel} />
            <span className="help">{t('Café, agua, lavado… Déjalo vacío si no compró nada.')}</span>
          </label>
          <div className="field">{t('¿Qué llevó de la tienda? (opcional, sirve para promociones)')}
            <div className="choices">
              {STORE_ITEMS.map((it) => <button key={it.key} type="button" className={`choice ${storeItems.includes(it.key) ? 'on' : ''}`} aria-pressed={storeItems.includes(it.key)} onClick={() => toggleItem(it.key)}><Icon name={it.icon} size={20} />{t(it.label)}</button>)}
            </div>
          </div>
          <div className="row">
            <label className="field num" style={{ width: 120 }}>{t('Bomba')}<input inputMode="numeric" value={pump} onChange={(e) => setPump(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
            <label className="field grow">{t('Folio del ticket')}
              <input placeholder="T-118342" value={folio} onChange={(e) => setFolio(e.target.value.toUpperCase())} />
              <span className="help">{t('Evita registrar la misma venta dos veces.')}</span>
            </label>
          </div>
          <div className="field">{t('¿Cómo paga?')}
            <div className="choices">
              {PAYMENT_METHODS.map((m) => <button key={m} type="button" className={`choice ${paymentMethod === m ? 'on' : ''}`} aria-pressed={paymentMethod === m} onClick={() => setPaymentMethod(m)}><Picto name={PAY_ICONS[m]} size={24} />{t(PAYMENT_METHOD_LABELS[m])}</button>)}
            </div>
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          {step2Problem && <div className="muted small" role="status">{step2Problem}</div>}
          <div className="wizard-nav">
            <button className="link back" onClick={() => goStep(1)}><Icon name="arrowLeft" size={18} /> {t('Volver')}</button>
            <button className="btn primary big" disabled={!!step2Problem} onClick={() => goStep(3)}>{t('Ver beneficios')} <Icon name="arrowRight" size={20} /></button>
          </div>
          {more}
        </section>
      )}

      {/* ---- Paso 3: Beneficios y cobro ---- */}
      {step === 3 && member && (
        <section className="card">
          <MemberStrip member={member} onChange={reset} />
          <div className="step-title"><h2 className="hero-title" style={{ fontSize: "1.6rem" }}>{t('Beneficios y')} <em className="ac">{t('cobro')}</em></h2><p>{t('Dile al cliente lo que gana hoy y cobra.')}</p></div>
          <SaleSummary member={member} preview={preview} previewError={previewError} fuel={fuel} litersMl={litersMl} priceCents={priceCents} fuelCents={fuelCents} storeCents={storeCents}
            rewardCents={rewardCents} paymentMethod={paymentMethod} useWallet={useWallet} onUseWallet={setUseWallet} walletSpend={walletSpend} onWalletSpend={setWalletSpend} />
          {error && <Alert kind="error">{error}</Alert>}
          <button className="btn primary huge" disabled={busy || !saleReady || !folio.trim()} onClick={registerSale}>
            {busy ? t('Registrando…') : t('Cobrar {amount} y registrar', { amount: pesos(paidCents) })}
          </button>
          <div className="wizard-nav"><button className="link back" onClick={() => goStep(2)}><Icon name="arrowLeft" size={18} /> {t('Corregir la carga')}</button><span className="muted small">{t('Folio {folio} · Bomba {pump}', { folio: folio.trim(), pump: pump || '—' })}</span></div>
          {more}
        </section>
      )}

      {step > 1 && !member && (
        <div className="card"><span className="muted">{t('Primero busca al cliente.')}</span><button className="btn" onClick={() => goStep(1)}><Icon name="arrowLeft" size={18} /> {t('Ir al paso 1')}</button></div>
      )}
    </div>
  );
}
