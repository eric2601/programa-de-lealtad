import { useMemo, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { BENEFIT_LABELS, DAY_LABELS, FUEL_LABELS, PAYMENT_LABELS, adminApi, errorText, fromCents, fromLocalInput, toCents, toLocalInput, type Benefit, type BenefitType, type Campaign, type FuelType, type Partner, type PromoLimits, type PromoRules, type PromoStatus, type PromotionInput, type PromotionView, type Tier } from '../api';
import { Checks, Field } from '../ui';

const BENEFIT_TYPES = Object.keys(BENEFIT_LABELS) as BenefitType[];
const num = (s: string): number | undefined => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));
const intOrNull = (s: string): number | null => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Math.round(Number(s)));

/** Editor de beneficio; se usa para el beneficio principal y para cada escalón. */
export function BenefitEditor({ value, onChange, partners, compact }: { value: Benefit; onChange: (b: Benefit) => void; partners: Partner[]; compact?: boolean }) {
  const { t } = useT();
  const set = (patch: Partial<Benefit>) => onChange({ ...value, ...patch });
  const kind = value.type;
  return (
    <div className="form-grid">
      <Field label={t('Tipo de beneficio')}><select value={kind} onChange={(e) => onChange({ type: e.target.value as BenefitType })}>{BENEFIT_TYPES.map((k) => <option key={k} value={k}>{t(BENEFIT_LABELS[k])}</option>)}</select></Field>
      {kind === 'points' && <Field label={t('Puntos')} className="num"><input inputMode="numeric" value={value.points ?? ''} onChange={(e) => set({ points: num(e.target.value) })} /></Field>}
      {kind === 'points_multiplier' && <Field label={t('Multiplicador (×)')} className="num"><input inputMode="decimal" value={value.multiplier ?? ''} onChange={(e) => set({ multiplier: num(e.target.value) })} placeholder="2" /></Field>}
      {(kind === 'virtual_money' || kind === 'discount_fixed' || kind === 'coupon' || kind === 'product' || kind === 'two_for_one') && <Field label={kind === 'virtual_money' ? t('Monto (MXN)') : kind === 'discount_fixed' ? t('Descuento (MXN)') : t('Valor del beneficio (MXN)')} className="num"><input inputMode="decimal" value={fromCents(value.amountCents)} onChange={(e) => set({ amountCents: toCents(e.target.value) ?? undefined })} /></Field>}
      {(kind === 'cashback_percent' || kind === 'discount_percent') && <Field label={t('Porcentaje (%)')} className="num"><input inputMode="decimal" value={value.percent ?? ''} onChange={(e) => set({ percent: num(e.target.value) })} /></Field>}
      {kind === 'discount_per_liter' && <Field label={t('Centavos por litro')} className="num"><input inputMode="numeric" value={value.centsPerLiter ?? ''} onChange={(e) => set({ centsPerLiter: num(e.target.value) })} /></Field>}
      {(kind === 'virtual_money' || kind === 'cashback_percent') && <Field label={t('Vence a los (días)')} className="num"><input inputMode="numeric" value={value.walletExpiresDays ?? ''} onChange={(e) => set({ walletExpiresDays: num(e.target.value) })} placeholder="30" /></Field>}
      {(kind === 'coupon' || kind === 'product' || kind === 'two_for_one') && <Field label={t('Etiqueta visible')}><input value={value.label ?? ''} onChange={(e) => set({ label: e.target.value || undefined })} placeholder={t('Café americano gratis')} /></Field>}
      {(kind === 'coupon' || kind === 'product' || kind === 'partner_coupon') && <Field label={t('Vigencia del cupón (días)')} className="num"><input inputMode="numeric" value={value.couponDays ?? ''} onChange={(e) => set({ couponDays: num(e.target.value) })} placeholder={kind === 'partner_coupon' ? '14' : '30'} /></Field>}
      {kind === 'partner_coupon' && (
        <Field label={t('Beneficio del asociado')} className={compact ? '' : 'span-2'}>
          <select value={value.partnerBenefitId ?? ''} onChange={(e) => set({ partnerBenefitId: e.target.value || undefined })}>
            <option value="">{t('Selecciona…')}</option>
            {partners.map((p) => <optgroup key={p.id} label={p.name}>{p.benefits.map((b) => <option key={b.id} value={b.id}>{b.name}{b.inventory.exhausted ? ` ${t('(agotado)')}` : ''}</option>)}</optgroup>)}
          </select>
        </Field>
      )}
      {kind === 'scratch' && <span className="muted small" style={{ alignSelf: 'end' }}>{t('Se emite una tarjeta Rasca y Gana con el premio que defina el programa.')}</span>}
    </div>
  );
}

interface FormState {
  name: string; type: string; objective: string; campaignId: string; status: PromoStatus; priority: string; stackable: boolean; excludes: string[];
  startsAt: string; endsAt: string; daysOfWeek: number[]; hourFrom: string; hourTo: string; stationIds: string[]; states: string[]; cities: string[]; fuelTypes: FuelType[];
  minFuel: string; minTotal: string; minLiters: string; paymentMethods: string[]; customerTypes: string[]; vehicleKinds: string[]; segments: string[];
  visitsCount: string; visitsPeriod: 'month' | 'week'; minMonthly: string; minLifetime: string; requiresStore: boolean; tiers: Tier[];
  benefit: Benefit; maxUses: string; maxPerCustomer: string; maxPerDay: string; maxPerMonth: string; maxDiscount: string; maxPerTransaction: string;
  inventoryInitial: string; partnerId: string;
}

function fromPromotion(p: Partial<PromotionInput> | null, defaults: { type: string; objective: string; campaignId: string | null }): FormState {
  const r: PromoRules = p?.rules ?? {}; const l: PromoLimits = p?.limits ?? {};
  return {
    name: p?.name ?? '', type: p?.type ?? defaults.type, objective: p?.objective ?? defaults.objective, campaignId: p?.campaignId ?? defaults.campaignId ?? '', status: p?.status ?? 'draft',
    priority: String(p?.priority ?? 0), stackable: p?.stackable ?? true, excludes: p?.excludes ?? [],
    startsAt: toLocalInput(r.startsAt), endsAt: toLocalInput(r.endsAt), daysOfWeek: r.daysOfWeek ?? [], hourFrom: r.hourFrom === undefined ? '' : String(r.hourFrom), hourTo: r.hourTo === undefined ? '' : String(r.hourTo),
    stationIds: r.stationIds ?? [], states: r.states ?? [], cities: r.cities ?? [], fuelTypes: r.fuelTypes ?? [],
    minFuel: fromCents(r.minFuelCents), minTotal: fromCents(r.minTotalCents), minLiters: r.minLitersMl === undefined ? '' : String(r.minLitersMl / 1000),
    paymentMethods: r.paymentMethods ?? [], customerTypes: r.customerTypes ?? [], vehicleKinds: r.vehicleKinds ?? [], segments: r.segments ?? [],
    visitsCount: r.visitsInPeriod ? String(r.visitsInPeriod.count) : '', visitsPeriod: r.visitsInPeriod?.period === 'week' ? 'week' : 'month',
    minMonthly: fromCents(r.minMonthlyCents), minLifetime: fromCents(r.minLifetimeCents), requiresStore: r.requiresStore ?? false, tiers: r.tiers ?? [],
    benefit: p?.benefit ?? { type: 'points', points: 10 },
    maxUses: l.maxUses ? String(l.maxUses) : '', maxPerCustomer: l.maxPerCustomer ? String(l.maxPerCustomer) : '', maxPerDay: l.maxPerDay ? String(l.maxPerDay) : '', maxPerMonth: l.maxPerMonth ? String(l.maxPerMonth) : '',
    maxDiscount: fromCents(l.maxDiscountCents), maxPerTransaction: l.maxPerTransaction ? String(l.maxPerTransaction) : '',
    inventoryInitial: p?.inventoryInitial ? String(p.inventoryInitial) : '', partnerId: p?.partnerId ?? '',
  };
}

function toInput(f: FormState): PromotionInput {
  const rules: PromoRules = {};
  const sa = fromLocalInput(f.startsAt); if (sa) rules.startsAt = sa;
  const ea = fromLocalInput(f.endsAt); if (ea) rules.endsAt = ea;
  if (f.daysOfWeek.length && f.daysOfWeek.length < 7) rules.daysOfWeek = [...f.daysOfWeek].sort();
  const hf = num(f.hourFrom); const ht = num(f.hourTo); if (hf !== undefined && ht !== undefined) { rules.hourFrom = hf; rules.hourTo = ht; }
  if (f.stationIds.length) rules.stationIds = f.stationIds;
  if (f.states.length) rules.states = f.states;
  if (f.cities.length) rules.cities = f.cities;
  if (f.fuelTypes.length) rules.fuelTypes = f.fuelTypes;
  const mf = toCents(f.minFuel); if (mf) rules.minFuelCents = mf;
  const mt = toCents(f.minTotal); if (mt) rules.minTotalCents = mt;
  const ml = num(f.minLiters); if (ml) rules.minLitersMl = Math.round(ml * 1000);
  if (f.paymentMethods.length) rules.paymentMethods = f.paymentMethods;
  if (f.customerTypes.length) rules.customerTypes = f.customerTypes;
  if (f.vehicleKinds.length) rules.vehicleKinds = f.vehicleKinds;
  if (f.segments.length) rules.segments = f.segments;
  const vc = num(f.visitsCount); if (vc) rules.visitsInPeriod = { count: Math.round(vc), period: f.visitsPeriod };
  const mm = toCents(f.minMonthly); if (mm) rules.minMonthlyCents = mm;
  const mlf = toCents(f.minLifetime); if (mlf) rules.minLifetimeCents = mlf;
  if (f.requiresStore) rules.requiresStore = true;
  if (f.tiers.length) rules.tiers = f.tiers;
  const limits: PromoLimits = {
    maxUses: intOrNull(f.maxUses), maxPerCustomer: intOrNull(f.maxPerCustomer), maxPerDay: intOrNull(f.maxPerDay), maxPerMonth: intOrNull(f.maxPerMonth),
    maxDiscountCents: toCents(f.maxDiscount), maxPerTransaction: intOrNull(f.maxPerTransaction),
  };
  return {
    campaignId: f.campaignId || null, name: f.name.trim(), type: f.type, objective: f.objective, status: f.status, priority: Math.round(num(f.priority) ?? 0), stackable: f.stackable,
    excludes: f.excludes, rules, benefit: cleanBenefit(f.benefit), limits, inventoryInitial: intOrNull(f.inventoryInitial), partnerId: f.partnerId || null,
  };
}
/** Quita campos vacíos para que el esquema del servidor no rechace `undefined`/NaN. */
const cleanBenefit = (b: Benefit): Benefit => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)))) as unknown as Benefit;

export function PromoEditor({ initial, promotionId, campaigns, promotions, partners, onSaved, onCancel }: {
  initial: Partial<PromotionInput> | null; promotionId: string | null; campaigns: Campaign[]; promotions: PromotionView[]; partners: Partner[];
  onSaved: (p: PromotionView) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const { token, catalog, stations } = useAdmin();
  const [f, setF] = useState<FormState>(() => fromPromotion(initial, { type: catalog.promoTypes[0]?.key ?? 'puntos', objective: catalog.objectives[0]?.key ?? 'ticket_promedio', campaignId: initial?.campaignId ?? null }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));
  const states = useMemo(() => [...new Set(stations.map((s) => s.state).filter((x): x is string => !!x))].sort(), [stations]);
  const cities = useMemo(() => [...new Set(stations.map((s) => s.city).filter((x): x is string => !!x))].sort(), [stations]);
  const others = promotions.filter((p) => p.id !== promotionId);
  const multiHint = t('Ctrl/Cmd + clic para varias');

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    const body = toInput(f);
    try {
      const saved = promotionId ? await adminApi<PromotionView>(`/promotions/${promotionId}`, token, { method: 'PATCH', body }) : await adminApi<PromotionView>('/promotions', token, { body });
      onSaved(saved);
    } catch (err) { setError(errorText(err)); } finally { setSaving(false); }
  }

  const tierSet = (i: number, tier: Tier) => set({ tiers: f.tiers.map((x, k) => (k === i ? tier : x)) });

  return (
    <form className="card accent" onSubmit={submit} style={{ gap: '1rem' }}>
      <div className="row between"><h2>{promotionId ? t('Editar promoción') : t('Nueva promoción')}</h2><button type="button" className="btn sm" onClick={onCancel}>{t('Cancelar')}</button></div>

      <fieldset className="sect"><legend>{t('Datos generales')}</legend>
        <div className="form-grid">
          <Field label={t('Nombre')} className="span-2"><input required maxLength={120} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('Carga $500 y llévate $20')} /></Field>
          <Field label={t('Tipo')}><select value={f.type} onChange={(e) => set({ type: e.target.value })}>{catalog.promoTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
          <Field label={t('Objetivo')}><select value={f.objective} onChange={(e) => set({ objective: e.target.value })}>{catalog.objectives.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
          <Field label={t('Campaña')}><select value={f.campaignId} onChange={(e) => set({ campaignId: e.target.value })}><option value="">{t('Sin campaña')}</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label={t('Estado')}><select value={f.status} onChange={(e) => set({ status: e.target.value as PromoStatus })}><option value="draft">{t('Borrador')}</option><option value="active">{t('Activa')}</option><option value="paused">{t('Pausada')}</option><option value="ended">{t('Terminada')}</option></select></Field>
          <Field label={t('Prioridad')} className="num" hint={t('Mayor número se evalúa primero')}><input inputMode="numeric" value={f.priority} onChange={(e) => set({ priority: e.target.value })} /></Field>
          <div className="field" style={{ justifyContent: 'end' }}><span>{t('Acumulable')}</span><label className="switch"><input type="checkbox" checked={f.stackable} onChange={(e) => set({ stackable: e.target.checked })} />{f.stackable ? t('Sí, con otras acumulables') : t('No acumulable')}</label></div>
          <Field label={t('Excluye a (no se combina con)')} className="span-all" hint={multiHint}>
            <select multiple value={f.excludes} onChange={(e) => set({ excludes: [...e.target.selectedOptions].map((o) => o.value) })}>{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="sect"><legend>{t('Reglas y condiciones')}</legend>
        <div className="form-grid">
          <Field label={t('Fecha inicial')}><input type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
          <Field label={t('Fecha final')}><input type="datetime-local" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
          <Field label={t('Hora desde (0–23)')} className="num"><input inputMode="numeric" min={0} max={23} value={f.hourFrom} onChange={(e) => set({ hourFrom: e.target.value })} /></Field>
          <Field label={t('Hora hasta (1–24)')} className="num"><input inputMode="numeric" min={1} max={24} value={f.hourTo} onChange={(e) => set({ hourTo: e.target.value })} /></Field>
        </div>
        <div className="field"><span>{t('Días de la semana (vacío = todos)')}</span><Checks options={DAY_LABELS.map((l, i) => ({ key: i, label: t(l) }))} value={f.daysOfWeek} onChange={(v) => set({ daysOfWeek: v })} /></div>
        <div className="field"><span>{t('Combustibles')}</span><Checks options={(Object.keys(FUEL_LABELS) as FuelType[]).map((k) => ({ key: k, label: t(FUEL_LABELS[k]) }))} value={f.fuelTypes} onChange={(v) => set({ fuelTypes: v })} /></div>
        <div className="form-grid">
          <Field label={t('Estaciones (vacío = todas)')} hint={multiHint}><select multiple value={f.stationIds} onChange={(e) => set({ stationIds: [...e.target.selectedOptions].map((o) => o.value) })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
          <Field label={t('Estados')}><select multiple value={f.states} onChange={(e) => set({ states: [...e.target.selectedOptions].map((o) => o.value) })}>{states.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label={t('Ciudades')}><select multiple value={f.cities} onChange={(e) => set({ cities: [...e.target.selectedOptions].map((o) => o.value) })}>{cities.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <div className="form-grid">
          <Field label={t('Monto mínimo de combustible (MXN)')} className="num"><input inputMode="decimal" value={f.minFuel} onChange={(e) => set({ minFuel: e.target.value })} /></Field>
          <Field label={t('Compra mínima total (MXN)')} className="num"><input inputMode="decimal" value={f.minTotal} onChange={(e) => set({ minTotal: e.target.value })} /></Field>
          <Field label={t('Litros mínimos')} className="num"><input inputMode="decimal" value={f.minLiters} onChange={(e) => set({ minLiters: e.target.value })} /></Field>
          <Field label={t('Consumo mensual mínimo (MXN)')} className="num"><input inputMode="decimal" value={f.minMonthly} onChange={(e) => set({ minMonthly: e.target.value })} /></Field>
          <Field label={t('Consumo histórico mínimo (MXN)')} className="num"><input inputMode="decimal" value={f.minLifetime} onChange={(e) => set({ minLifetime: e.target.value })} /></Field>
          <Field label={t('Visitas en el periodo')} className="num" hint={t('N-ésima carga válida dispara el beneficio')}><input inputMode="numeric" value={f.visitsCount} onChange={(e) => set({ visitsCount: e.target.value })} /></Field>
          <Field label={t('Periodo de visitas')}><select value={f.visitsPeriod} onChange={(e) => set({ visitsPeriod: e.target.value as 'month' | 'week' })}><option value="month">{t('Mes natural')}</option><option value="week">{t('Semana')}</option></select></Field>
          <div className="field" style={{ justifyContent: 'end' }}><span>{t('Tienda')}</span><label className="switch"><input type="checkbox" checked={f.requiresStore} onChange={(e) => set({ requiresStore: e.target.checked })} />{t('Requiere compra en tienda')}</label></div>
        </div>
        <div className="field"><span>{t('Métodos de pago (vacío = todos)')}</span><Checks options={catalog.paymentMethods.map((m) => ({ key: m, label: PAYMENT_LABELS[m] ? t(PAYMENT_LABELS[m]) : m }))} value={f.paymentMethods} onChange={(v) => set({ paymentMethods: v })} /></div>
        <div className="field"><span>{t('Tipos de cliente')}</span><Checks options={catalog.customerTypes.map((c) => ({ key: c.key, label: c.label }))} value={f.customerTypes} onChange={(v) => set({ customerTypes: v })} /></div>
        <div className="field"><span>{t('Tipos de vehículo (vacío = todos)')}</span><Checks options={(catalog.vehicleKinds ?? []).map((c) => ({ key: c.key, label: t(c.label) }))} value={f.vehicleKinds} onChange={(v) => set({ vehicleKinds: v })} /><small className="muted">{t('Se reconoce por la placa registrada del cliente.')}</small></div>
        <div className="field"><span>{t('Segmentos')}</span><Checks options={catalog.segments.map((c) => ({ key: c.key, label: c.label }))} value={f.segments} onChange={(v) => set({ segments: v })} /></div>
      </fieldset>

      <fieldset className="sect"><legend>{t('Escalones (promoción escalonada)')}</legend>
        <p className="muted small" style={{ margin: 0 }}>{t('Se entrega el beneficio del escalón más alto alcanzado. Si hay escalones, el beneficio principal se usa como referencia para la publicidad.')}</p>
        <div className="tiers">
          {f.tiers.map((tier, i) => (
            <div key={i} className="card" style={{ gap: '.5rem' }}>
              <div className="row between"><Field label={t('Monto mínimo (MXN)')} className="num"><input inputMode="decimal" value={fromCents(tier.minAmountCents)} onChange={(e) => tierSet(i, { ...tier, minAmountCents: toCents(e.target.value) ?? 0 })} /></Field><button type="button" className="btn sm danger" onClick={() => set({ tiers: f.tiers.filter((_, k) => k !== i) })}>{t('Quitar escalón')}</button></div>
              <BenefitEditor compact value={tier.benefit} onChange={(b) => tierSet(i, { ...tier, benefit: b })} partners={partners} />
            </div>
          ))}
        </div>
        <div><button type="button" className="btn sm" onClick={() => set({ tiers: [...f.tiers, { minAmountCents: (f.tiers[f.tiers.length - 1]?.minAmountCents ?? 30_000) + 10_000, benefit: { type: 'points', points: 10 } }] })}>{t('Agregar escalón')}</button></div>
      </fieldset>

      <fieldset className="sect"><legend>{t('Beneficio')}</legend>
        <BenefitEditor value={f.benefit} onChange={(b) => set({ benefit: b })} partners={partners} />
      </fieldset>

      <fieldset className="sect"><legend>{t('Límites y existencias')}</legend>
        <div className="form-grid">
          <Field label={t('Usos totales')} className="num"><input inputMode="numeric" value={f.maxUses} onChange={(e) => set({ maxUses: e.target.value })} placeholder={t('Sin límite')} /></Field>
          <Field label={t('Por cliente')} className="num"><input inputMode="numeric" value={f.maxPerCustomer} onChange={(e) => set({ maxPerCustomer: e.target.value })} placeholder={t('Sin límite')} /></Field>
          <Field label={t('Por cliente al día')} className="num"><input inputMode="numeric" value={f.maxPerDay} onChange={(e) => set({ maxPerDay: e.target.value })} placeholder={t('Sin límite')} /></Field>
          <Field label={t('Por cliente al mes')} className="num"><input inputMode="numeric" value={f.maxPerMonth} onChange={(e) => set({ maxPerMonth: e.target.value })} placeholder={t('Sin límite')} /></Field>
          <Field label={t('Descuento máximo por transacción (MXN)')} className="num"><input inputMode="decimal" value={f.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} placeholder={t('Sin tope')} /></Field>
          <Field label={t('Existencias iniciales')} className="num" hint={t('Beneficios disponibles; al agotarse pasa a Agotada')}><input inputMode="numeric" value={f.inventoryInitial} onChange={(e) => set({ inventoryInitial: e.target.value })} placeholder={t('Ilimitadas')} /></Field>
        </div>
      </fieldset>

      <fieldset className="sect"><legend>{t('Asociado')}</legend>
        <div className="form-grid">
          <Field label={t('Asociado comercial')}><select value={f.partnerId} onChange={(e) => set({ partnerId: e.target.value })}><option value="">{t('Ninguno')}</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.typeLabel}</option>)}</select></Field>
          <span className="muted small" style={{ alignSelf: 'end' }}>{t('Para entregar cupones del asociado elige el beneficio “Cupón de asociado” y su beneficio específico.')}</span>
        </div>
      </fieldset>

      {error && <div className="alert error">{error}</div>}
      <div className="row"><button className="btn primary big" disabled={saving}>{saving ? t('Guardando…') : promotionId ? t('Guardar cambios') : t('Crear promoción')}</button><span className="muted small">{t('Las restricciones y los términos y condiciones se generan automáticamente a partir de las reglas.')}</span></div>
    </form>
  );
}
