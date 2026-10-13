import { useState } from 'react';
import { api, errorMessage, formatPlateInput, isPlateComplete, type Vehicle } from '../api';
import { plateKind, VEHICLE_KIND_LABELS, type VehicleKind } from '../plates';
import { useT } from '../i18n';
import { Alert } from './Visual';

/** Placa dibujada como las de Edomex: letras grandes, guiones y franja con el tipo de vehículo. */
export function PlateTag({ plate, kind }: { plate: string; kind: VehicleKind }) {
  const { t } = useT();
  return <span className={`plate-tag ${kind}`} aria-label={plate}><i>{t(VEHICLE_KIND_LABELS[kind] ?? 'Auto')}</i><b>{plate}</b></span>;
}

/** Vehículos del cliente: cada placa lo identifica en la bomba igual que su celular. */
export function Vehicles({ vehicles, token, onChange }: { vehicles: Vehicle[]; token: string; onChange: () => void }) {
  const { t } = useT();
  const [plate, setPlate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true); setError(null);
    try { await api('/portal/vehicles', { body: { plate }, token }); setPlate(''); onChange(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError(null);
    try { await api(`/portal/vehicles/${id}`, { method: 'DELETE', token }); onChange(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="card vehicles">
      <div className="step-title"><h2 className="friendly">{t('Mis vehículos')}</h2><p>{t('Con tu placa te identifican en la bomba, igual que con tu celular. También puedes escanearla desde la app.')}</p></div>
      {vehicles.length === 0 && <p className="muted">{t('Todavía no agregas ninguno.')}</p>}
      <ul className="vehicle-list">
        {vehicles.map((v) => (
          <li key={v.id}><PlateTag plate={v.plate} kind={v.kind} /><button className="link danger" disabled={busy} onClick={() => void remove(v.id)}>{t('Quitar')}</button></li>
        ))}
      </ul>
      <form className="vehicle-add" onSubmit={(e) => { e.preventDefault(); if (isPlateComplete(plate)) void add(); }}>
        <input className="plate-input" aria-label={t('Placa del vehículo')} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABC-123-D" value={plate} onChange={(e) => setPlate(formatPlateInput(e.target.value))} />
        {plateKind(plate) && <span className="pill ok">{t(VEHICLE_KIND_LABELS[plateKind(plate)!])}</span>}
        <button className="btn primary" disabled={busy || !isPlateComplete(plate)}>{t('Agregar')}</button>
      </form>
      {error && <Alert kind="error">{error}</Alert>}
    </section>
  );
}
