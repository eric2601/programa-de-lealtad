import { useMemo, useState, type FormEvent } from 'react';
import { pesos } from '../../api';
import { translate, useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { FUEL_LABELS, adminApi, describeBenefit, errorText, toCents, type FuelType, type GeneratorInput, type Proposal, type PromotionInput, type PromotionView } from '../api';
import { Checks, Empty, Field, Head } from '../ui';

/** Restricciones que el servidor generará; se muestran como anticipo (mismas reglas que promo/terms.ts). Se evalúa al dibujar. */
function previewRestrictions(p: Proposal): string[] {
  const r = p.rules; const out: string[] = [translate('Válida únicamente en estaciones participantes.')];
  if (r.fuelTypes?.length) out.push(translate('Aplica únicamente para {fuels}.', { fuels: r.fuelTypes.map((f) => translate(FUEL_LABELS[f])).join(translate(' y ')) }));
  if (r.minFuelCents) out.push(translate('Compra mínima de {amount} en combustible en una sola transacción.', { amount: pesos(r.minFuelCents) }));
  if (r.minLitersMl) out.push(translate('Mínimo {n} litros por carga.', { n: r.minLitersMl / 1000 }));
  if (r.tiers?.length) out.push(translate('Se entrega únicamente el beneficio del escalón más alto alcanzado.'));
  if (r.paymentMethods?.length) out.push(translate('Aplica solo pagando con {methods}.', { methods: r.paymentMethods.join(translate(' o ')) }));
  if (r.customerTypes?.length) out.push(translate('Exclusiva para clientes {types}.', { types: r.customerTypes.join(', ') }));
  if (r.segments?.length) out.push(translate('Dirigida a {segments}.', { segments: r.segments.join(', ') }));
  if (r.visitsInPeriod) out.push(r.visitsInPeriod.period === 'week' ? translate('El beneficio se entrega una vez por semana.') : translate('El beneficio se entrega una vez por mes.'));
  if (r.minMonthlyCents) out.push(translate('El consumo se calcula por mes natural con cargas identificadas.'));
  out.push(p.stackable ? translate('Acumulable con otras promociones acumulables.') : translate('No acumulable con otras promociones.'));
  if (p.limits.maxPerDay) out.push(translate('Máximo {n} por cliente al día.', { n: p.limits.maxPerDay }));
  if (p.limits.maxPerMonth) out.push(translate('Máximo {n} por cliente al mes.', { n: p.limits.maxPerMonth }));
  if (p.limits.maxPerCustomer) out.push(translate('Máximo {n} por cliente durante la vigencia.', { n: p.limits.maxPerCustomer }));
  if (p.limits.maxDiscountCents) out.push(translate('Beneficio máximo de {amount} por transacción.', { amount: pesos(p.limits.maxDiscountCents) }));
  if (p.inventoryInitial !== null) out.push(translate('Hasta agotar existencias.'));
  return out;
}

export function Generador() {
  const { t, locale } = useT();
  const { token, catalog, stations, go } = useAdmin();
  const [f, setF] = useState({ objective: catalog.objectives[0]?.key ?? 'ticket_promedio', fuelTypes: [] as FuelType[], states: [] as string[], cities: [] as string[], stationIds: [] as string[], customerTypes: [] as string[], segments: [] as string[], minAmount: '', minLiters: '', visits: '', monthly: '' });
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, PromotionView | 'saving' | string>>({});
  const states = useMemo(() => [...new Set(stations.map((s) => s.state).filter((x): x is string => !!x))].sort(), [stations]);
  const cities = useMemo(() => [...new Set(stations.map((s) => s.city).filter((x): x is string => !!x))].sort(), [stations]);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  async function generate(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError(null); setCreated({});
    const body: GeneratorInput = {
      objective: f.objective, fuelTypes: f.fuelTypes.length ? f.fuelTypes : undefined,
      location: { stationIds: f.stationIds.length ? f.stationIds : undefined, states: f.states.length ? f.states : undefined, cities: f.cities.length ? f.cities : undefined },
      customerTypes: f.customerTypes.length ? f.customerTypes : undefined, segments: f.segments.length ? f.segments : undefined,
      consumption: { minAmountCents: toCents(f.minAmount) ?? undefined, minLitersMl: f.minLiters ? Math.round(Number(f.minLiters) * 1000) : undefined, visits: f.visits ? Number(f.visits) : undefined, monthlyCents: toCents(f.monthly) ?? undefined },
    };
    try { setProposals(await adminApi<Proposal[]>('/generator', token, { body })); } catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }

  async function createDraft(p: Proposal) {
    setCreated((c) => ({ ...c, [p.key]: 'saving' }));
    const body: PromotionInput = { campaignId: null, name: p.name, type: p.type, objective: p.objective, status: 'draft', priority: p.priority, stackable: p.stackable, excludes: [], rules: p.rules, benefit: p.benefit, limits: p.limits, inventoryInitial: p.inventoryInitial, partnerId: null };
    try { const saved = await adminApi<PromotionView>('/promotions', token, { body }); setCreated((c) => ({ ...c, [p.key]: saved })); }
    catch (err) { setCreated((c) => ({ ...c, [p.key]: t('Error: {msg}', { msg: errorText(err) }) })); }
  }

  const objectiveLabel = catalog.objectives.find((o) => o.key === f.objective)?.label ?? f.objective;

  return (
    <div className="admin-main">
      <Head title={t('Ideas de promociones')} sub={t('Describe el objetivo y el contexto; el sistema propone promociones con condición, beneficio, restricciones, costo, indicador y riesgo.')}
        desc={t('Elige qué quieres lograr (por ejemplo, que los clientes carguen más litros) y te proponemos varias promociones listas. Cada una se puede guardar como borrador y ajustar después.')} />
      <form className="card" onSubmit={generate}>
        <div className="form-grid">
          <Field label={t('Objetivo comercial')} className="span-2"><select value={f.objective} onChange={(e) => set({ objective: e.target.value })}>{catalog.objectives.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
          <div className="field span-2"><span>{t('Combustibles')}</span><Checks options={(Object.keys(FUEL_LABELS) as FuelType[]).map((k) => ({ key: k, label: t(FUEL_LABELS[k]) }))} value={f.fuelTypes} onChange={(v) => set({ fuelTypes: v })} /></div>
        </div>
        <fieldset className="sect"><legend>{t('Ubicación')}</legend>
          <div className="form-grid">
            <Field label={t('Estados')} hint={t('Ctrl/Cmd + clic para varios')}><select multiple value={f.states} onChange={(e) => set({ states: [...e.target.selectedOptions].map((o) => o.value) })}>{states.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label={t('Ciudades')}><select multiple value={f.cities} onChange={(e) => set({ cities: [...e.target.selectedOptions].map((o) => o.value) })}>{cities.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label={t('Estaciones')}><select multiple value={f.stationIds} onChange={(e) => set({ stationIds: [...e.target.selectedOptions].map((o) => o.value) })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
          </div>
        </fieldset>
        <fieldset className="sect"><legend>{t('Cliente')}</legend>
          <div className="field"><span>{t('Tipo de cliente')}</span><Checks options={catalog.customerTypes.map((c) => ({ key: c.key, label: c.label }))} value={f.customerTypes} onChange={(v) => set({ customerTypes: v })} /></div>
          <div className="field"><span>{t('Segmentos')}</span><Checks options={catalog.segments.map((c) => ({ key: c.key, label: c.label }))} value={f.segments} onChange={(v) => set({ segments: v })} /></div>
        </fieldset>
        <fieldset className="sect"><legend>{t('Consumo')}</legend>
          <div className="form-grid">
            <Field label={t('Monto mínimo por carga (MXN)')} className="num"><input inputMode="decimal" value={f.minAmount} onChange={(e) => set({ minAmount: e.target.value })} placeholder="500" /></Field>
            <Field label={t('Litros mínimos')} className="num"><input inputMode="decimal" value={f.minLiters} onChange={(e) => set({ minLiters: e.target.value })} placeholder="30" /></Field>
            <Field label={t('Visitas en el mes')} className="num"><input inputMode="numeric" value={f.visits} onChange={(e) => set({ visits: e.target.value })} placeholder="5" /></Field>
            <Field label={t('Consumo mensual (MXN)')} className="num"><input inputMode="decimal" value={f.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="1500" /></Field>
          </div>
        </fieldset>
        {error && <div className="alert error">{error}</div>}
        <div className="row"><button className="btn primary big" disabled={loading}>{loading ? t('Generando…') : t('Generar propuestas')}</button></div>
      </form>

      {proposals && proposals.length === 0 && <Empty icon="bulb" title={t('No encontramos propuestas para esa combinación')} text={t('Prueba con otro objetivo o con menos filtros.')} />}
      {proposals && proposals.length > 0 && (
        <div className="grid-2">
          {proposals.map((p) => {
            const st = created[p.key];
            return (
              <div key={p.key} className="card">
                <div className="row between"><h2>{p.name}</h2><span className="pill violet">{catalog.promoTypes.find((x) => x.key === p.type)?.label ?? p.type}</span></div>
                <div className="flow">
                  <div className="step"><b>{t('Objetivo')}</b><span>{objectiveLabel}</span></div>
                  <div className="step"><b>{t('Condición')}</b><span>{p.condition}</span></div>
                  <div className="step"><b>{t('Beneficio')}</b><span>{p.rules.tiers?.length ? p.rules.tiers.map((tier) => `${pesos(tier.minAmountCents)} → ${describeBenefit(tier.benefit)}`).join(' · ') : describeBenefit(p.benefit)}</span></div>
                  <div className="step"><b>{t('Restricciones')}</b><ul className="restr" style={{ paddingLeft: '1rem' }}>{previewRestrictions(p).map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                  <div className="step"><b>{t('Costo estimado')}</b><span><span className="mono">{pesos(p.estimatedCostCents)}</span> {t('por beneficio entregado')}{p.inventoryInitial !== null && <> · {t('hasta {n} existencias', { n: p.inventoryInitial.toLocaleString(locale) })} ({t('máx.')} <span className="mono">{pesos(p.estimatedCostCents * p.inventoryInitial)}</span>)</>}</span></div>
                  <div className="step"><b>{t('Indicador')}</b><span>{p.kpi}</span></div>
                  <div className="step"><b>{t('Riesgo')}</b><span>{p.risk}</span></div>
                  <div className="step"><b>{t('Por qué')}</b><span className="muted">{p.rationale}</span></div>
                </div>
                <div className="badge-row"><span className="pill neutral">{p.stackable ? t('Acumulable') : t('No acumulable')}</span><span className="pill neutral">{t('Prioridad {n}', { n: p.priority })}</span>{p.limits.maxPerDay && <span className="pill neutral">{t('{n}/día', { n: p.limits.maxPerDay })}</span>}{p.limits.maxPerMonth && <span className="pill neutral">{t('{n}/mes', { n: p.limits.maxPerMonth })}</span>}{p.limits.maxPerCustomer && <span className="pill neutral">{t('{n}/cliente', { n: p.limits.maxPerCustomer })}</span>}</div>
                {typeof st === 'object' ? (
                  <div className="alert ok row between"><span>{t('Creada como borrador.')}</span><button className="link" onClick={() => go('promociones', st.id)}>{t('Abrir y ajustar')}</button></div>
                ) : typeof st === 'string' && st !== 'saving' ? <div className="alert error">{st}</div> : (
                  <div><button className="btn primary" disabled={st === 'saving'} onClick={() => createDraft(p)}>{st === 'saving' ? t('Creando…') : t('Crear como borrador')}</button></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
