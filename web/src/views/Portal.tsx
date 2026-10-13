import { useEffect, useRef, useState } from 'react';
import { api, ApiError, fecha, formatPhone, litros, pesos, type CouponDto, type LedgerEntry, type PortalMe, type PortalMembership, type PortalPromotion, type RevealResponse, type WalletMovement } from '../api';
import { Icon, type IconName } from '../components/icons';
import { deadlineText, Ladder, ProgressBar } from '../components/Promos';
import { ScratchCard } from '../components/ScratchCard';
import { Alert, IconTabs, Ico, Kpi, Ring, Skeleton } from '../components/Visual';
import { EmptyBox, Rewards } from '../components/Illustrations';
import { Picto } from '../components/Picto';
import { Vehicles } from '../components/Vehicles';
import { artFor, POSTERS } from '../promoArt';
import { LangToggle, translate, useT } from '../i18n';

// Las etiquetas de estas tablas se traducen al dibujar (t(label)), no al cargar el módulo.
const KIND: Record<string, { label: string; icon: IconName }> = {
  earn: { label: 'Ganaste', icon: 'fuel' }, redeem: { label: 'Usaste puntos', icon: 'gift' }, reverse: { label: 'Venta anulada', icon: 'undo' },
  adjust: { label: 'Devolución', icon: 'undo' }, expire: { label: 'Vencieron', icon: 'hourglass' }, release: { label: 'Reserva liberada', icon: 'lock' },
};
const WALLET_KIND: Record<string, { label: string; icon: IconName }> = { earn: { label: 'Recibiste', icon: 'gift' }, spend: { label: 'Usaste', icon: 'store' }, expire: { label: 'Venció', icon: 'hourglass' }, cancel: { label: 'Cancelado', icon: 'x' } };
const WALLET_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'disponible', cls: 'ok' }, partial: { label: 'queda una parte', cls: 'warn' }, used: { label: 'ya usado', cls: 'neutral' },
  expired: { label: 'vencido', cls: 'crit' }, cancelled: { label: 'cancelado', cls: 'crit' }, done: { label: 'aplicado', cls: 'neutral' },
};
const COUPON_STATUS: Record<string, { label: string; cls: string }> = {
  issued: { label: 'vigente', cls: 'ok' }, redeemed: { label: 'ya usado', cls: 'neutral' }, expired: { label: 'vencido', cls: 'crit' }, cancelled: { label: 'cancelado', cls: 'crit' },
};
const PROMO_ICON: Record<string, IconName> = {
  descuento_litro: 'fuel', descuento_porcentaje: 'percent', descuento_fijo: 'tag', cashback: 'cash', dinero_virtual: 'wallet', puntos: 'star', puntos_dobles: 'sparkle', producto_gratis: 'gift',
  cupon: 'ticket', '2x1': 'ticket', sorteo: 'gift', referidos: 'users', horario: 'clock', volumen: 'chart', frecuencia: 'repeat', temporada: 'calendar', flotillas: 'fleet', combinada: 'list', asociados: 'handshake', escalonada: 'chart',
};
const NOTIF_ICON: Record<string, IconName> = { wallet_expiry: 'hourglass', promo_new: 'megaphone', promo_ending: 'clock', reward: 'gift', birthday: 'party', inactivity: 'bell', welcome: 'bell' };
const FAVS_KEY = 'lealtad.favs';
type Filter = 'all' | 'nearby' | 'fav';
type Tab = 'resumen' | 'promos' | 'dinero' | 'historial';

function loadFavs(): string[] {
  try { const raw = localStorage.getItem(FAVS_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
const netErr = (err: unknown) => (err instanceof ApiError ? err.message : translate('Sin conexión. Intenta de nuevo en un momento.'));

export function Portal() {
  const { t } = useT();
  const [token, setToken] = useState<string | null>(() => { try { return sessionStorage.getItem('lealtad.portal'); } catch { return null; } });
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('resumen');

  async function load(tok: string) {
    try { setMe(await api<PortalMe>('/portal/me', { token: tok })); setError(null); }
    catch (err) { if (err instanceof ApiError && err.status === 401) { setToken(null); try { sessionStorage.removeItem('lealtad.portal'); } catch { /* nada */ } } else setError(netErr(err)); }
  }
  useEffect(() => { if (token) void load(token); }, [token]);

  function toggleFav(id: string) {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  }
  async function start() {
    setBusy(true); setError(null);
    try { setChallenge(await api('/portal/session/start', { body: { phone } })); } catch (err) { setError(netErr(err)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!challenge) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ token: string }>('/portal/session/confirm', { body: { challengeId: challenge.challengeId, code } });
      try { sessionStorage.setItem('lealtad.portal', r.token); } catch { /* nada */ }
      setToken(r.token); setChallenge(null); setCode('');
    } catch (err) { setError(netErr(err)); } finally { setBusy(false); }
  }
  async function toggleMarketing(m: PortalMembership, granted: boolean) {
    if (!token) return;
    await api('/portal/consents', { body: { membershipId: m.membershipId, granted, channel: 'whatsapp' }, token });
    await load(token);
  }
  const logout = () => { setToken(null); setMe(null); try { sessionStorage.removeItem('lealtad.portal'); } catch { /* nada */ } };

  if (!token) {
    return (
      <div className="portal">
        <form className="card" style={{ maxWidth: 440, margin: '1rem auto', width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (challenge) { if (code.length >= 4) void confirm(); } else if (phone.length >= 10) void start(); }}>
          <div className="row" style={{ justifyContent: 'flex-end' }}><LangToggle compact /></div>
          <div style={{ display: 'grid', justifyItems: 'center' }}><Rewards width={190} /></div>
          <div className="step-title" style={{ textAlign: 'center' }}><h2 className="hero-title" style={{ fontSize: "1.7rem" }}>{t('Tus')} <em className="ac">{t('puntos')}</em> {t('y premios')}</h2><p>{challenge ? t('Escribe el código de 4 dígitos que te llegó por WhatsApp.') : t('Escribe tu celular y te mandamos un código por WhatsApp.')}</p></div>
          {!challenge ? (
            <>
              <label className="field big">{t('Tu celular')}<input className="phone-input" inputMode="numeric" autoComplete="tel-national" placeholder="55 4433 4317" value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
              <button className="btn primary huge" disabled={busy || phone.length < 10}>{busy ? t('Enviando…') : t('Enviarme un código')}</button>
              <p className="muted small" style={{ textAlign: 'center' }}>{t('Demo: prueba con')} <button type="button" className="link" onClick={() => setPhone('5544334317')}>55 4433 4317</button> {t('(Ana) o')} <button type="button" className="link" onClick={() => setPhone('5611122233')}>56 1112 2233</button> (Beto). {t('El código aparece en pantalla.')}</p>
            </>
          ) : (
            <>
              <label className="field big">{t('Código')}<input className="code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="0000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus /></label>
              {challenge.devCode && <Alert kind="info">{t('Demo: tu código es {code}', { code: challenge.devCode })}</Alert>}
              <button className="btn primary huge" disabled={busy || code.length < 4}>{busy ? t('Entrando…') : t('Entrar')}</button>
              <button type="button" className="link" onClick={() => setChallenge(null)}><Icon name="arrowLeft" size={16} /> {t('Cambiar celular')}</button>
            </>
          )}
          {error && <Alert kind="error">{error}</Alert>}
        </form>
      </div>
    );
  }

  if (!me) return <div className="portal">{error ? <Alert kind="error">{error}</Alert> : <Skeleton lines={4} />}</div>;

  return (
    <div className="portal">
      <div className="row between">
        <span className="muted small row" style={{ gap: '.3rem' }}><Icon name="phone" size={16} /> {me.phone}</span>
        <button className="link" onClick={logout}><Icon name="logout" size={16} /> {t('Salir del portal')}</button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <Vehicles vehicles={me.vehicles} token={token!} onChange={() => void load(token!)} />
      {me.memberships.length === 0 && <div className="card empty-state"><EmptyBox width={150} /><b>{t('Todavía no participas')}</b><p className="muted">{t('Pide al despachador que te registre con este celular en tu próxima carga.')}</p></div>}
      {me.memberships.map((m) => (
        <MembershipView key={m.membershipId} m={m} token={token} favs={favs} filter={filter} tab={tab} onTab={setTab}
          onFilter={setFilter} onFav={toggleFav} onReload={() => void load(token)} onMarketing={(g) => toggleMarketing(m, g)} />
      ))}
    </div>
  );
}

interface ViewProps {
  m: PortalMembership; token: string; favs: string[]; filter: Filter; tab: Tab; onTab: (t: Tab) => void;
  onFilter: (f: Filter) => void; onFav: (id: string) => void; onReload: () => void; onMarketing: (granted: boolean) => void;
}

/** Elige el "siguiente premio" más cercano: meta personal, progreso con fecha límite, mayor avance o escalera. */
function pickNextReward(promos: PortalPromotion[]): PortalPromotion | null {
  const personal = promos.find((p) => p.personal);
  if (personal) return personal;
  const withProgress = promos.filter((p) => p.progress);
  const urgent = withProgress.filter((p) => deadlineText(p.progress!.deadline)).sort((a, b) => (a.progress!.deadline! < b.progress!.deadline! ? -1 : 1));
  if (urgent.length) return urgent[0];
  if (withProgress.length) return [...withProgress].sort((a, b) => b.progress!.current / b.progress!.target - a.progress!.current / a.progress!.target)[0];
  return promos.find((p) => p.ladder && p.ladder.length > 0) ?? null;
}

function MembershipView({ m, token, favs, filter, tab, onTab, onFilter, onFav, onReload, onMarketing }: ViewProps) {
  const { t } = useT();
  const marketing = [...m.consents].reverse().find((c) => c.purpose === 'marketing');
  const wallet = m.wallet ?? { availableCents: m.walletAvailableCents ?? 0, generatedCents: 0, usedCents: 0, expiredCents: 0, cancelledCents: 0, nextExpiry: null, movements: [] };
  const promos = m.promotions ?? [];
  const coupons = m.coupons ?? [];
  const liveCoupons = coupons.filter((c) => c.status === 'issued');
  const notifications = m.notifications ?? [];
  const pendingCards = m.scratchCards.filter((c) => c.status === 'available');
  const nearbyCount = promos.filter((p) => p.nearby).length;
  const favCount = promos.filter((p) => favs.includes(p.id)).length;
  const visible = promos.filter((p) => filter === 'all' ? true : filter === 'nearby' ? p.nearby : favs.includes(p.id));
  const next = pickNextReward(promos);
  const minPts = m.redemption.minPoints;
  const ringMax = m.points >= minPts ? m.points : minPts;
  const stampsLeft = m.stampsForReward - m.stamps;

  return (
    <>
      <div className="portal-hero">
        <div className="row between">
          <h2 className="hero-title" style={{ fontSize: "1.9rem" }}>{t('Hola,')} <em className="ac">{m.firstName}</em></h2>
          <span className="muted small">{m.homeStation ?? m.tenantName}</span>
        </div>
        <div className="hero-tiles">
          <div className="hero-tile">
            <Ring value={m.points} max={ringMax} size={104} tone="accent" label={m.points} sub={t('puntos')} />
            <div className="hero-tile-text">
              <b>{pesos(m.valueCents)}</b>
              <span>{m.nextReward ? t('faltan {n} pts para usarlos', { n: m.nextReward.pointsMissing }) : t('listos para usar')}</span>
            </div>
          </div>
          <div className="hero-tile">
            <span className="picto-wrap"><Picto name="coins" size={34} /></span>
            <div className="hero-tile-text">
              <b>{pesos(wallet.availableCents)}</b>
              <span>{t('dinero virtual')}</span>
              {wallet.nextExpiry && <span className="pill warn">{t('vence {date}', { date: fecha(wallet.nextExpiry.at) })}</span>}
            </div>
          </div>
          <div className="hero-tile">
            <Ring value={m.stamps} max={m.stampsForReward} size={104} tone="violet" label={`${m.stamps}/${m.stampsForReward}`} sub={t('sellos')} />
            <div className="hero-tile-text">
              <b>{stampsLeft > 0 ? t('{n} más', { n: stampsLeft }) : t('Completo')}</b>
              <span>{stampsLeft > 0 ? t('para tu regalo') : t('reclama tu regalo')}</span>
            </div>
          </div>
        </div>
      </div>

      <IconTabs<Tab> value={tab} onChange={onTab} tabs={[
        { key: 'resumen', icon: 'home', label: t('Resumen'), badge: pendingCards.length },
        { key: 'promos', icon: 'tag', label: t('Promos'), badge: promos.length },
        { key: 'dinero', icon: 'wallet', label: t('Dinero'), badge: liveCoupons.length },
        { key: 'historial', icon: 'fuel', label: t('Cargas') },
      ]} />

      {tab === 'resumen' && (
        <>
          <div className="card">
            <div className="row between"><div className="section-title"><h3><Icon name="tag" size={18} /> {t('Promociones del mes')}</h3></div></div>
            <PromoSlider promos={promos} onOpen={() => onTab('promos')} />
          </div>

          <div className="next-reward">
            <div className="row between">
              <div className="section-title"><h3><Icon name="target" size={18} /> {t('Tu siguiente premio')}</h3></div>
              {next && !next.personal && next.progress && deadlineText(next.progress.deadline) && <span className="pill warn"><Icon name="clock" size={12} /> {deadlineText(next.progress.deadline)}</span>}
            </div>
            {!next && <div className="big-text">{m.nextReward ? t('Te faltan {n} puntos para pagar con puntos.', { n: m.nextReward.pointsMissing }) : t('Ya puedes pagar con tus puntos en tu próxima carga.')}</div>}
            {next?.personal && (
              <>
                <div className="reward-line"><span className="reward-amt">{pesos(next.personal.amountCents)}</span><span className="reward-for">{t('si cargas')} <b>{pesos(next.personal.targetCents)}</b></span></div>
                {next.progress && <ProgressBar current={next.progress.current} target={next.progress.target} unit={next.progress.unit} />}
                <div className="chips-info"><span><Icon name="calendar" size={14} /> {t('{n} días', { n: next.personal.validDays })}</span>{next.personal.minNextPurchaseCents ? <span><Icon name="store" size={14} /> {t('desde {amt}', { amt: pesos(next.personal.minNextPurchaseCents) })}</span> : null}</div>
              </>
            )}
            {next && !next.personal && next.progress && (
              <>
                <div className="big-text">{next.progress.text}</div>
                <ProgressBar current={next.progress.current} target={next.progress.target} unit={next.progress.unit} />
                <div className="muted small">{next.name}</div>
              </>
            )}
            {next && !next.personal && !next.progress && next.ladder && (
              <>
                <div className="big-text">{next.name}</div>
                <Ladder tiers={next.ladder} current={null} />
              </>
            )}
          </div>

          {m.scratchCards.length > 0 && (
            <div className="card">
              <div className="section-title"><h3><Icon name="gift" size={18} /> {t('Rasca y Gana')} {pendingCards.length > 0 && <span className="pill warn">{t('{n} por rascar', { n: pendingCards.length })}</span>}</h3></div>
              <div className="scratch-list">
                {(pendingCards.length > 0 ? pendingCards : m.scratchCards).slice(0, 1).map((c) => (
                  <ScratchCard key={c.id} card={c} reveal={(id) => api<RevealResponse>(`/portal/scratch/${id}/reveal`, { method: 'POST', body: {}, token })} onRevealed={onReload} />
                ))}
              </div>
              {pendingCards.length > 1 && <div className="muted small">{t('Rasca esta y aparece la siguiente. Te quedan {n} más.', { n: pendingCards.length - 1 })}</div>}
            </div>
          )}

          <div className="card">
            <div className="row between"><div className="section-title"><h3><Icon name="tag" size={18} /> {t('Promos para ti')}</h3></div><button className="link" onClick={() => onTab('promos')}>{t('Ver todas ({n})', { n: promos.length })} <Icon name="arrowRight" size={16} /></button></div>
            <div className="promo-mini-list">
              {promos.slice(0, 3).map((p) => (
                <button key={p.id} className="promo-mini" onClick={() => onTab('promos')}>
                  <Ico name={PROMO_ICON[p.type] ?? 'tag'} tone="violet" size={44} />
                  <div className="grow"><b>{p.benefitLabel}</b><span className="muted small">{p.name}</span></div>
                  {p.progress && p.progress.current > 0 && <span className="mini-pct">{Math.min(100, Math.round((p.progress.current / p.progress.target) * 100))} %</span>}
                </button>
              ))}
              {promos.length === 0 && <div className="muted" style={{ padding: '.8rem' }}>{t('Por ahora no hay promociones activas.')}</div>}
            </div>
          </div>

          {notifications.length > 0 && (
            <div className="card">
              <div className="section-title"><h3><Icon name="bell" size={18} /> {t('Avisos')}</h3></div>
              <ul className="notif-list">
                {notifications.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <Ico name={NOTIF_ICON[n.kind] ?? 'bell'} tone="neutral" size={36} />
                    <div className="grow"><b>{n.title}</b><span className="muted small">{n.body}</span></div>
                    <span className="muted small mono">{fecha(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === 'promos' && (
        <div className="card">
          <div className="chips" role="group" aria-label={t('Filtrar promociones')}>
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>{t('Todas · {n}', { n: promos.length })}</button>
            <button className={`chip ${filter === 'nearby' ? 'on' : ''}`} aria-pressed={filter === 'nearby'} onClick={() => onFilter('nearby')}>{t('Cerca de ti · {n}', { n: nearbyCount })}</button>
            <button className={`chip ${filter === 'fav' ? 'on' : ''}`} aria-pressed={filter === 'fav'} onClick={() => onFilter('fav')}>{t('Favoritas · {n}', { n: favCount })}</button>
          </div>
          {visible.length === 0 && <div className="muted">{promos.length === 0 ? t('Por ahora no hay promociones activas.') : filter === 'fav' ? t('Marca con la estrella las que quieras tener a la mano.') : t('No hay promociones con este filtro.')}</div>}
          <div className="promo-grid">
            {visible.map((p) => <PromoCard key={p.id} p={p} fav={favs.includes(p.id)} onFav={() => onFav(p.id)} />)}
          </div>
        </div>
      )}

      {tab === 'dinero' && (
        <>
          <div className="card">
            <div className="section-title"><h3><Icon name="wallet" size={18} /> {t('Tu dinero virtual')}</h3><p>{t('Te lo regalan las promociones y se descuenta de tu siguiente compra.')}</p></div>
            <div className="stat-grid">
              <Kpi icon="wallet" value={pesos(wallet.availableCents)} label={t('disponible')} tone="accent" big />
              <Kpi icon="gift" value={pesos(wallet.generatedCents)} label={t('recibido')} tone="ok" />
              <Kpi icon="store" value={pesos(wallet.usedCents)} label={t('usado')} tone="neutral" />
              {wallet.expiredCents > 0 && <Kpi icon="hourglass" value={pesos(wallet.expiredCents)} label={t('vencido')} tone="crit" />}
            </div>
            {wallet.nextExpiry && <Alert kind="warn">{t('Usa {amt} antes del {date} o se vence.', { amt: pesos(wallet.nextExpiry.cents), date: fecha(wallet.nextExpiry.at, true) })}</Alert>}
            {wallet.movements.length === 0 ? <div className="muted">{t('Aún no tienes movimientos.')}</div> : (
              <ul className="movements">{wallet.movements.slice(0, 10).map((mv) => <Movement key={mv.id} mv={mv} />)}</ul>
            )}
          </div>
          <div className="card">
            <div className="section-title"><h3><Icon name="ticket" size={18} /> {t('Tus cupones')}</h3><p>{t('Muestra el código en la estación o con el negocio aliado.')}</p></div>
            {coupons.length === 0 ? <div className="muted">{t('Cuando ganes un cupón aparecerá aquí con su código.')}</div> : (
              <div className="coupon-list">{coupons.map((c) => <Coupon key={c.id} c={c} />)}</div>
            )}
          </div>
        </>
      )}

      {tab === 'historial' && (
        <>
          <div className="card">
            <div className="row between"><div className="section-title"><h3><Icon name="stamp" size={18} /> {t('Tus sellos')}</h3><p>{t('Junta {n} cargas y llévate un regalo.', { n: m.stampsForReward })}</p></div><span className="mono muted">{m.stamps} / {m.stampsForReward}</span></div>
            <div className="stamps big" role="img" aria-label={t('{a} de {b} sellos', { a: m.stamps, b: m.stampsForReward })}>{Array.from({ length: m.stampsForReward }).map((_, i) => <span key={i} className={i < m.stamps ? 'on' : ''}>{i < m.stamps ? <Icon name="fuel" size={20} /> : null}</span>)}</div>
          </div>
          <div className="card">
            <div className="row between"><div className="section-title"><h3><Icon name="fuel" size={18} /> {t('Tus últimas cargas')}</h3></div>{m.stats && <span className="pill neutral">{t('{n} este mes', { n: m.stats.visitsThisMonth })}</span>}</div>
            {m.entries.length === 0 ? <div className="muted">{t('Todavía no hay movimientos. Tu próxima carga ya cuenta.')}</div> : (
              <ul className="history-list">{m.entries.slice(0, 10).map((e, i) => <History key={i} e={e} />)}</ul>
            )}
            {m.entries.length > 10 && (
              <details>
                <summary>{t('Ver historial completo ({n})', { n: m.entries.length })}</summary>
                <div className="tbl" style={{ marginTop: '.5rem' }}>
                  <table>
                    <thead><tr><th>{t('Fecha')}</th><th>{t('Movimiento')}</th><th>{t('Estación')}</th><th>{t('Detalle')}</th><th className="num">{t('Puntos')}</th></tr></thead>
                    <tbody>{m.entries.map((e, i) => (
                      <tr key={i}><td className="mono small">{fecha(e.created_at)}</td><td>{KIND[e.kind] ? t(KIND[e.kind].label) : e.kind}</td><td className="small">{e.station ?? '—'}</td><td className="small muted">{detail(e)}</td><td className="num">{e.points_delta > 0 ? '+' : ''}{e.points_delta}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </>
      )}

      <div className="consent-box">
        <label className="consent"><input type="checkbox" checked={!!marketing?.granted} onChange={(e) => onMarketing(e.target.checked)} /><span><b>{t('Recibir promociones por WhatsApp')}</b> {t('Los avisos de tu cuenta llegan de todas formas.')}</span></label>
      </div>
    </>
  );
}

/** Carrusel con los diez carteles: avanza solo cada 3 s, se puede deslizar con el dedo y cada cartel abre sus promociones. */
function PromoSlider({ promos, onOpen }: { promos: PortalPromotion[]; onOpen: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);
  const items = POSTERS.map((art) => ({ art, promo: promos.find((p) => artFor(p).file === art.file) ?? null }));
  const step = () => { const el = ref.current; if (!el || !el.firstElementChild) return el?.clientWidth ?? 1; return (el.firstElementChild as HTMLElement).offsetWidth + 12; };
  useEffect(() => {
    // Con 'reducir movimiento' activo el carrusel avanza igual, pero sin desplazamiento animado.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      const el = ref.current; if (!el) return;
      const next = (Math.round(el.scrollLeft / step()) + 1) % items.length;
      const target = next * step();
      el.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' }); setIdx(next);
      // Si el desplazamiento suave no avanzó (pestaña en segundo plano), salta directo.
      window.setTimeout(() => { if (Math.abs(el.scrollLeft - target) > 8) el.scrollTo({ left: target }); }, 800);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [items.length]);
  const onScroll = () => { const el = ref.current; if (!el) return; setIdx(Math.round(el.scrollLeft / step()) % items.length); };
  return (
    <div className="promo-slider-wrap">
      <div className="promo-slider" ref={ref} onScroll={onScroll} onPointerDown={() => { paused.current = true; }} onPointerUp={() => { window.setTimeout(() => { paused.current = false; }, 6000); }} aria-roledescription={t('carrusel')} aria-label={t('Promociones del mes')}>
        {items.map(({ art, promo }, i) => (
          <button key={art.file} className="slide" onClick={onOpen} aria-label={promo ? `${promo.name}: ${promo.benefitLabel}` : art.title} aria-current={i === idx ? 'true' : undefined}>
            <img src={art.file} alt="" loading={i < 2 ? 'eager' : 'lazy'} />
            <span className="slide-cap"><b>{promo ? promo.benefitLabel : art.title}</b><small>{promo ? promo.name : art.caption}</small></span>
          </button>
        ))}
      </div>
      <div className="slider-dots" aria-hidden="true">{items.map(({ art }, i) => <i key={art.file} className={i === idx ? 'on' : ''} />)}</div>
    </div>
  );
}

const detail = (e: LedgerEntry) => `${e.fuel_type ? `${e.fuel_type} ${litros(e.liters_ml ?? 0)}` : ''}${e.store_cents ? ` · ${translate('tienda {amt}', { amt: pesos(e.store_cents) })}` : ''}${!e.fuel_type && !e.store_cents ? e.note ?? '' : ''}`;

function History({ e }: { e: LedgerEntry }) {
  const { t } = useT();
  const k = KIND[e.kind] ?? { label: e.kind, icon: 'list' as IconName };
  const pos = e.points_delta > 0;
  return (
    <li>
      <Ico name={k.icon} tone={pos ? 'ok' : e.points_delta < 0 ? 'crit' : 'neutral'} size={40} />
      <div className="grow">
        <b>{KIND[e.kind] ? t(k.label) : k.label}{e.fuel_type ? ` ${litros(e.liters_ml ?? 0)}` : ''}{e.store_cents ? ` · ${t('tienda {amt}', { amt: pesos(e.store_cents) })}` : ''}</b>
        <span className="muted small">{fecha(e.created_at)}{e.station ? ` · ${e.station}` : ''}</span>
      </div>
      <span className={`pts ${pos ? 'pos' : e.points_delta < 0 ? 'neg' : ''}`}>{pos ? '+' : ''}{e.points_delta}</span>
    </li>
  );
}

function PromoCard({ p, fav, onFav }: { p: PortalPromotion; fav: boolean; onFav: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const vigencia = p.endsAt ? t('Hasta el {date}', { date: fecha(p.endsAt, true) }) : p.startsAt ? t('Desde el {date}', { date: fecha(p.startsAt, true) }) : t('Sin fecha límite');
  const stock = p.inventory?.remaining != null ? (p.inventory.exhausted ? t('Agotada') : t('Quedan {n}', { n: p.inventory.remaining })) : null;
  const where = p.stationNames.length > 0
    ? (p.stationNames.length > 3 ? t('{list} y {n} más', { list: p.stationNames.slice(0, 3).join(', '), n: p.stationNames.length - 3 }) : p.stationNames.join(', '))
    : t('Todas las estaciones');
  const dl = deadlineText(p.progress?.deadline);
  return (
    <article className={`promo-card ${fav ? 'fav' : ''}`} aria-labelledby={`promo-${p.id}`}>
      <div className="promo-head">
        <img className="promo-thumb sm" src={artFor(p).file} alt="" loading="lazy" />
        <div className="grow">
          <div className="benefit" id={`promo-${p.id}`}>{p.benefitLabel}</div>
          <div className="muted small">{p.name}</div>
        </div>
        <button className={`star ${fav ? 'on' : ''}`} aria-pressed={fav} aria-label={fav ? t('Quitar de favoritas') : t('Marcar como favorita')} onClick={onFav}><Icon name="star" size={20} /></button>
      </div>
      <div className="row small">
        {p.endsSoon && <span className="pill warn"><Icon name="clock" size={12} /> {t('termina pronto')}</span>}
        {p.nearby && <span className="pill ok"><Icon name="pin" size={12} /> {t('cerca de ti')}</span>}
        {stock && <span className={`pill ${p.inventory.exhausted ? 'crit' : 'neutral'}`}>{stock}</span>}
        {p.usedByMe > 0 && <span className="pill neutral"><Icon name="check" size={12} /> {p.usedByMe > 1 ? t('usada {n} veces', { n: p.usedByMe }) : t('usada 1 vez')}</span>}
      </div>
      {p.progress && <div className="hint"><div className="hint-text small"><Icon name="target" size={16} /><span>{p.progress.text}</span></div><ProgressBar current={p.progress.current} target={p.progress.target} unit={p.progress.unit} />{dl && <div className="deadline"><Icon name="clock" size={14} /> {dl}</div>}</div>}
      {p.ladder && p.ladder.length > 0 && <Ladder tiers={p.ladder} current={p.progress?.unit === 'cents' ? p.progress.current : null} />}
      <div className="promo-how">
        <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />{open ? t('Ocultar condiciones') : t('¿Cómo funciona?')}</button>
        {open && (
          <>
            <div className="sentence">{p.condition}</div>
            <ul>
              <li>{vigencia}</li>
              <li>{t('Válida en: {where}', { where })}</li>
              {p.restrictions.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}

function Movement({ mv }: { mv: WalletMovement }) {
  const { t } = useT();
  const st = WALLET_STATUS[mv.status] ? { label: t(WALLET_STATUS[mv.status].label), cls: WALLET_STATUS[mv.status].cls } : { label: mv.status, cls: 'neutral' };
  const k = WALLET_KIND[mv.kind] ? { label: t(WALLET_KIND[mv.kind].label), icon: WALLET_KIND[mv.kind].icon } : { label: mv.kind, icon: 'list' as IconName };
  const positive = mv.kind === 'earn';
  const negative = mv.kind === 'spend' || mv.kind === 'expire' || mv.kind === 'cancel';
  return (
    <li>
      <Ico name={k.icon} tone={positive ? 'ok' : negative ? 'crit' : 'neutral'} size={40} />
      <div className="grow">
        <b>{k.label}{mv.promotionName ? ` · ${mv.promotionName}` : mv.note ? ` · ${mv.note}` : ''}</b>
        <span className="sub">
          <span className="muted">{fecha(mv.createdAt)}</span>
          {mv.kind === 'earn' && <span className={`pill ${st.cls}`}>{st.label}</span>}
          {mv.kind === 'earn' && mv.status === 'partial' && <span>{t('quedan {amt}', { amt: pesos(mv.remainingCents) })}</span>}
          {mv.kind === 'earn' && mv.expiresAt && (mv.status === 'active' || mv.status === 'partial') && <span>{t('vence {date}', { date: fecha(mv.expiresAt) })}</span>}
          {mv.conditions && <span className="cond">{mv.conditions}</span>}
        </span>
      </div>
      <span className={`amt ${positive ? 'pos' : negative ? 'neg' : ''}`}>{positive ? '+' : negative ? '−' : ''}{pesos(mv.amountCents)}</span>
    </li>
  );
}

function Coupon({ c }: { c: CouponDto }) {
  const { t } = useT();
  const st = COUPON_STATUS[c.status] ? { label: t(COUPON_STATUS[c.status].label), cls: COUPON_STATUS[c.status].cls } : { label: c.status, cls: 'neutral' };
  const cls = c.status === 'redeemed' ? 'used' : c.status === 'expired' || c.status === 'cancelled' ? 'expired' : '';
  return (
    <div className={`coupon ${cls}`}>
      <Ico name={c.partnerName ? 'handshake' : 'ticket'} tone="accent" size={44} />
      <div className="grow">
        <div><strong>{c.label ?? c.promotionName ?? t('Cupón')}</strong>{c.valueCents > 0 && <span className="muted"> · {pesos(c.valueCents)}</span>}</div>
        <div className="muted small">{c.partnerName ? `${c.partnerName} · ` : ''}{c.status === 'redeemed' && c.redeemedAt ? t('usado {date}', { date: fecha(c.redeemedAt) }) : t('hasta {date}', { date: fecha(c.validUntil) })}</div>
      </div>
      <div className="coupon-right"><code>{c.code}</code><span className={`pill ${st.cls}`}>{st.label}</span></div>
    </div>
  );
}
