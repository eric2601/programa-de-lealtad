import { useState, type FormEvent } from 'react';
import { api, errorMessage, type Session } from '../api';
import { Keypad } from '../components/Keypad';
import { Alert } from '../components/Visual';
import { PumpPhone } from '../components/Illustrations';
import { LangToggle, useT } from '../i18n';

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const { t } = useT();
  const [stationCode, setStationCode] = useState('EST-01');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeStation, setChangeStation] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pin.length < 4) return;
    setBusy(true); setError(null);
    try {
      onLogin(await api<Session>('/auth/pin', { body: { stationCode, pin } }));
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
    <div className="login-side">
      <PumpPhone width={300} />
      <h2 className="hero-title">{t('Tus clientes')} <span className="ac">{t('regresan')}</span> {t('por sus puntos.')}</h2>
      <p className="muted">{t('Identifícalos por su celular en la bomba, entrégales beneficios al momento y mide qué promociones funcionan.')}</p>
    </div>
    <form className="card" onSubmit={submit} style={{ maxWidth: 440, width: '100%' }} aria-labelledby="login-title">
      <div className="step-title">
        <div className="row between" style={{ alignItems: 'flex-start', gap: '.5rem' }}><h2 id="login-title" className="hero-title" style={{ fontSize: '1.6rem' }}>{t('Escribe tu')} <em className="ac">{t('NIP')}</em> {t('para entrar')}</h2><LangToggle compact /></div>
        <p>{t('Estación')} <b style={{ color: 'var(--ink)' }}>{stationCode}</b>. {!changeStation && <button type="button" className="link" onClick={() => setChangeStation(true)}>{t('Cambiar estación')}</button>}</p>
      </div>
      {changeStation && (
        <label className="field">{t('Código de estación')}
          <input value={stationCode} onChange={(e) => setStationCode(e.target.value.toUpperCase())} autoComplete="off" autoFocus />
        </label>
      )}
      <label className="field">{t('NIP')}
        <input className="code-input" type="password" inputMode="numeric" value={pin} placeholder="••••" aria-label={t('NIP')} autoComplete="current-password"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus={!changeStation} />
      </label>
      <Keypad compact onDigit={(d) => setPin((p) => (p + d).slice(0, 6))} onDelete={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin('')} disabled={busy} />
      {error && <Alert kind="error">{error}</Alert>}
      <button className="btn primary big" disabled={busy || pin.length < 4}>{t(busy ? 'Entrando…' : 'Entrar')}</button>
      <p className="muted small">{t('Demo: estación EST-01, NIP 1111 (despachador) o 1234 (gerente).')}</p>
    </form>
    </div>
  );
}
