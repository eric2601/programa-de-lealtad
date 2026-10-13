import { useState, type FormEvent } from 'react';
import { pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, errorText, fmtNum, toCents, type Partner, type PartnerBenefitInput, type PartnerInput } from '../api';
import { Empty, ErrorBox, Field, Head, InventoryBar, Loading, useLoad, vigencia } from '../ui';

export function Asociados() {
  const { t } = useT();
  const { token, stations } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => adminApi<Partner[]>('/partners', token), [token]);
  const [adding, setAdding] = useState(false);
  const [benefitFor, setBenefitFor] = useState<string | null>(null);
  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  if (error) return <><Head title={t('Asociados comerciales')} /><ErrorBox text={error} onRetry={reload} /></>;
  if (!data) return <><Head title={t('Asociados comerciales')} /><Loading /></>;

  return (
    <div className={`admin-main${loading ? ' dim' : ''}`}>
      <Head title={t('Asociados comerciales')} sub={t('Negocios aliados cuyos beneficios se entregan como cupones con código y existencias controladas.')}
        desc={t('Por ejemplo, un autolavado que regala $20 a tus clientes. Tú registras el negocio y su beneficio; el cliente recibe un cupón con código que el negocio valida.')}>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? t('Cerrar formulario') : t('Nuevo asociado')}</button>
      </Head>
      {adding && <PartnerForm onDone={() => { setAdding(false); reload(); }} />}
      {data.length === 0 && <Empty icon="handshake" title={t('Todavía no hay negocios aliados')} text={t('Registra el primero para ofrecer cupones de otros negocios a tus clientes.')} action={<button className="btn sm primary" onClick={() => setAdding(true)}>{t('Nuevo asociado')}</button>} />}
      <div className="list">
        {data.map((p) => (
          <div key={p.id} className="item">
            <div className="row between">
              <div className="row"><span className="title">{p.name}</span><span className="pill violet">{p.typeLabel}</span><span className={`pill ${p.active ? 'ok' : 'neutral'}`}>{p.active ? t('Activo') : t('Inactivo')}</span></div>
              <button className="btn sm" onClick={() => setBenefitFor(benefitFor === p.id ? null : p.id)}>{benefitFor === p.id ? t('Cerrar') : t('Agregar beneficio')}</button>
            </div>
            {p.contact && <div className="muted small">{t('Contacto:')} {p.contact}</div>}
            {benefitFor === p.id && <BenefitForm partnerId={p.id} onDone={() => { setBenefitFor(null); reload(); }} />}
            {p.benefits.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{t('Sin beneficios configurados.')}</p> : (
              <div className="tbl"><table>
                <thead><tr><th>{t('Beneficio')}</th><th className="num">{t('Valor')}</th><th>{t('Código')}</th><th>{t('Vigencia')}</th><th>{t('Estaciones')}</th><th>{t('Existencias')}</th><th className="num">{t('Cupones emitidos')}</th></tr></thead>
                <tbody>{p.benefits.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b>{b.description && <div className="muted small">{b.description}</div>}<div className="muted small">id <span className="mono-code">{b.id.slice(0, 8)}</span></div></td>
                    <td className="num">{pesos(b.valueCents)}</td><td><span className="mono-code">{b.codePrefix}-XXXXXX</span></td>
                    <td className="small">{vigencia(b.validFrom, b.validUntil)}</td>
                    <td className="small">{b.stationIds.length ? b.stationIds.map(stationName).join(', ') : t('Todas')}</td>
                    <td><InventoryBar inv={b.inventory} compact /></td><td className="num">{fmtNum(b.usesCount)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnerForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const { token, catalog } = useAdmin();
  const [f, setF] = useState<PartnerInput>({ name: '', type: catalog.partnerTypes[0]?.key ?? 'cafeteria', contact: '', active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await adminApi('/partners', token, { body: f }); onDone(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  }
  return (
    <form className="card accent" onSubmit={submit}>
      <h3>{t('Nuevo asociado')}</h3>
      <div className="form-grid">
        <Field label={t('Nombre')}><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('AutoSpa Lavado')} /></Field>
        <Field label={t('Tipo')}><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{catalog.partnerTypes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
        <Field label={t('Contacto')}><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder={t('Nombre, teléfono o correo')} /></Field>
        <div className="field" style={{ justifyContent: 'end' }}><span>{t('Estado')}</span><label className="switch"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t('Activo')}</label></div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row"><button className="btn primary" disabled={saving}>{saving ? t('Guardando…') : t('Crear asociado')}</button></div>
    </form>
  );
}

function BenefitForm({ partnerId, onDone }: { partnerId: string; onDone: () => void }) {
  const { t } = useT();
  const { token, stations } = useAdmin();
  const [f, setF] = useState({ name: '', description: '', value: '', codePrefix: 'AL', inventory: '', validFrom: '', validUntil: '', stationIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    const body: PartnerBenefitInput = {
      name: f.name, description: f.description, valueCents: toCents(f.value) ?? 0, codePrefix: f.codePrefix.trim().toUpperCase() || 'AL',
      inventoryInitial: f.inventory ? Math.round(Number(f.inventory)) : null, validFrom: f.validFrom ? new Date(f.validFrom).toISOString() : null, validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null, stationIds: f.stationIds,
    };
    try { await adminApi(`/partners/${partnerId}/benefits`, token, { body }); onDone(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>{t('Nuevo beneficio del asociado')}</h3>
      <div className="form-grid">
        <Field label={t('Nombre')} className="span-2"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('$20 de descuento en lavado')} /></Field>
        <Field label={t('Valor (MXN)')} className="num"><input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label={t('Prefijo del código')} hint={t('Hasta 6 letras')}><input maxLength={6} value={f.codePrefix} onChange={(e) => setF({ ...f, codePrefix: e.target.value })} /></Field>
        <Field label={t('Existencias')} className="num"><input inputMode="numeric" value={f.inventory} onChange={(e) => setF({ ...f, inventory: e.target.value })} placeholder={t('Ilimitadas')} /></Field>
        <Field label={t('Válido desde')}><input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
        <Field label={t('Válido hasta')}><input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
        <Field label={t('Estaciones (vacío = todas)')} hint={t('Ctrl/Cmd + clic para varias')}><select multiple value={f.stationIds} onChange={(e) => setF({ ...f, stationIds: [...e.target.selectedOptions].map((o) => o.value) })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
        <Field label={t('Descripción')} className="span-all"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row"><button className="btn primary" disabled={saving}>{saving ? t('Guardando…') : t('Crear beneficio')}</button></div>
    </form>
  );
}
