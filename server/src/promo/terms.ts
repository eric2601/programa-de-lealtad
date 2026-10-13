import { describeBenefit } from './engine.js';
import { VEHICLE_KIND_LABELS } from '../plate.js';
import type { Benefit, PromoRules, Promotion } from './types.js';

const pesos = (c: number) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} MXN`;
const FUEL: Record<string, string> = { regular: 'gasolina Regular', premium: 'gasolina Premium', diesel: 'Diésel' };
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export interface StationLookup { (id: string): string | undefined }

/** Frase de condición en lenguaje del cliente: "Carga $700 o más de gasolina Regular los martes de 14:00 a 18:00". */
export function conditionSentence(r: PromoRules, benefit: Benefit, extra?: Benefit[]): string {
  const parts: string[] = [];
  if (r.tiers?.length) {
    const sorted = [...r.tiers].sort((a, b) => a.minAmountCents - b.minAmountCents);
    return `Entre más cargues, más ganas: ${sorted.map((t) => `${pesos(t.minAmountCents)} → ${describeBenefit(t.benefit)}`).join(' · ')}`;
  }
  if (r.personalized) {
    const p = r.personalized;
    return `Carga cerca de ${p.upliftPercent} % más de lo que normalmente cargas (tu meta se calcula con tu historial) y recibe dinero virtual para tu próxima visita, válido ${p.validDays} días`;
  }
  if (r.returnStreak) {
    const s = r.returnStreak;
    return `Carga${s.minFuelCents ? ` ${pesos(s.minFuelCents)} o más` : ''} y regresa cada ${s.withinDays} días: ${s.rewardsCents.map((c, i) => `${i + 1}.º regreso ${pesos(c)}`).join(', ')} de dinero virtual`;
  }
  if (r.visitsInPeriod) parts.push(`Realiza ${r.visitsInPeriod.count} cargas${r.visitsInPeriod.qualifyingMinFuelCents ? ` de ${pesos(r.visitsInPeriod.qualifyingMinFuelCents)} o más` : ''} ${r.visitsInPeriod.period === 'week' ? 'en la semana' : 'durante el mes'}`);
  else if (r.minMonthlyCents) parts.push(`Acumula ${pesos(r.minMonthlyCents)} en cargas durante el mes`);
  else if (r.minFuelCents) parts.push(`Carga ${pesos(r.minFuelCents)} o más`);
  else if (r.minLitersMl) parts.push(`Carga ${r.minLitersMl / 1000} litros o más`);
  else if (r.minTotalCents) parts.push(`Compra ${pesos(r.minTotalCents)} o más`);
  else parts.push('Carga combustible');
  if (r.fuelTypes?.length) parts.push(`de ${r.fuelTypes.map((f) => FUEL[f]).join(' o ')}`);
  if (r.minStoreCents) parts.push(`y compra ${pesos(r.minStoreCents)} en tienda`);
  else if (r.requiresItems?.length) parts.push(`y compra ${r.requiresItems.join(' y ')}`);
  else if (r.requiresStore) parts.push('y compra en tienda');
  if (r.returnWithinDays) parts.push(`habiendo cargado${r.returnWithinDays.minPrevFuelCents ? ` ${pesos(r.returnWithinDays.minPrevFuelCents)} o más` : ''} en los últimos ${r.returnWithinDays.days} días`);
  if (r.daysOfWeek?.length && r.daysOfWeek.length < 7) parts.push(`los ${r.daysOfWeek.map((d) => DAYS[d]).join(', ')}`);
  if (r.hourFrom !== undefined && r.hourTo !== undefined) parts.push(`entre ${String(r.hourFrom).padStart(2, '0')}:00 y ${String(r.hourTo).padStart(2, '0')}:00`);
  if (r.paymentMethods?.length) parts.push(`pagando con ${r.paymentMethods.map((m) => ({ efectivo: 'efectivo', tarjeta: 'tarjeta', digital: 'pago digital', flotilla: 'cuenta de flotilla' })[m]).join(' o ')}`);
  return `${parts.join(' ')} y recibe ${describeBenefit(benefit, extra)}`;
}

/** Condiciones de uso del dinero virtual entregado por un beneficio. */
function walletConditions(b: Benefit): string[] {
  const out: string[] = [];
  if (b.type !== 'virtual_money' && b.type !== 'cashback_percent') return out;
  if (b.minNextPurchaseCents) out.push(`El dinero virtual solo puede usarse en una compra posterior de ${pesos(b.minNextPurchaseCents)} o más.`);
  if (b.scope === 'store') out.push('El dinero virtual solo aplica en tienda y servicios.');
  if (b.scope === 'fuel') out.push('El dinero virtual solo aplica en combustible.');
  if (b.singleUse) out.push('El dinero virtual es de uso único: se consume completo en una compra y el sobrante no se conserva.');
  return out;
}

/** Restricciones obligatorias generadas a partir de las reglas (sección 5). */
export function restrictions(p: Pick<Promotion, 'rules' | 'limits' | 'stackable' | 'inventoryInitial' | 'benefit'> & { benefits?: Benefit[] }, stationName: StationLookup = () => undefined): string[] {
  const r = p.rules; const out: string[] = [];
  if (r.minStoreCents) out.push(`Requiere compra mínima de ${pesos(r.minStoreCents)} en tienda o servicios en la misma visita.`);
  if (r.requiresItems?.length) out.push(`Requiere incluir ${r.requiresItems.join(' y ')} en el ticket; el despachador lo registra al cobrar.`);
  if (r.returnWithinDays) out.push(`Aplica solo si la carga anterior${r.returnWithinDays.minPrevFuelCents ? ` de ${pesos(r.returnWithinDays.minPrevFuelCents)} o más` : ''} ocurrió en los últimos ${r.returnWithinDays.days} días con el mismo número de teléfono.`);
  if (r.returnStreak) out.push(`La cadena de regresos se reinicia si pasan más de ${r.returnStreak.withinDays} días entre cargas; el nivel máximo es ${pesos(r.returnStreak.rewardsCents[r.returnStreak.rewardsCents.length - 1])}.`);
  if (r.personalized) out.push(`La meta se calcula con el ticket habitual de cada cliente (historial de cargas identificadas) más ${r.personalized.upliftPercent} %, redondeada a ${pesos(r.personalized.roundToCents)}, entre ${pesos(r.personalized.minTargetCents)} y ${pesos(r.personalized.maxTargetCents)}; el beneficio depende de la meta y solo puede usarse en una compra posterior de al menos ${r.personalized.minNextPurchasePercent} % de la meta, dentro de ${r.personalized.validDays} días.`);
  for (const b of [p.benefit, ...(p.benefits ?? [])]) out.push(...walletConditions(b));
  if (p.benefits?.length) out.push('Los beneficios divididos se entregan por separado y cada uno tiene su propio ámbito y vigencia.');
  out.push(r.stationIds?.length ? `Válida únicamente en estaciones participantes: ${r.stationIds.map((id) => stationName(id) ?? id).join(', ')}.` : 'Válida únicamente en estaciones participantes.');
  if (r.states?.length) out.push(`Aplica en ${r.states.join(', ')}.`);
  if (r.cities?.length) out.push(`Aplica en ${r.cities.join(', ')}.`);
  if (r.fuelTypes?.length) out.push(`Aplica únicamente para ${r.fuelTypes.map((f) => FUEL[f]).join(' y ')}.`);
  if (r.minFuelCents) out.push(`Compra mínima de ${pesos(r.minFuelCents)} en combustible en una sola transacción.`);
  if (r.minTotalCents) out.push(`Compra mínima de ${pesos(r.minTotalCents)}.`);
  if (r.minLitersMl) out.push(`Mínimo ${r.minLitersMl / 1000} litros por carga.`);
  if (r.tiers?.length) out.push(`Se entrega únicamente el beneficio del escalón más alto alcanzado; los escalones no se suman.`);
  if (r.daysOfWeek?.length && r.daysOfWeek.length < 7) out.push(`Aplica únicamente los días ${r.daysOfWeek.map((d) => DAYS[d]).join(', ')}.`);
  if (r.hourFrom !== undefined && r.hourTo !== undefined) out.push(`Horario de ${String(r.hourFrom).padStart(2, '0')}:00 a ${String(r.hourTo).padStart(2, '0')}:00 horas.`);
  if (r.paymentMethods?.length) out.push(`Aplica solo pagando con ${r.paymentMethods.join(' o ')}.`);
  if (r.customerTypes?.length) out.push(`Exclusiva para clientes registrados como ${r.customerTypes.join(', ')}.`);
  if (r.vehicleKinds?.length) out.push(`Exclusiva para ${r.vehicleKinds.map((k) => VEHICLE_KIND_LABELS[k] ?? k).join(' o ')}. El tipo de vehículo se identifica por la placa registrada en la cuenta del cliente.`);
  if (r.segments?.length) out.push(`Dirigida a ${r.segments.join(', ')}; el sistema determina la elegibilidad al momento de la compra.`);
  if (r.visitsInPeriod) out.push(`Solo cuentan cargas registradas con el número de teléfono del cliente; el beneficio se entrega una vez por ${r.visitsInPeriod.period === 'week' ? 'semana' : 'mes'}.`);
  if (r.minMonthlyCents) out.push(`El consumo se calcula por mes natural con cargas identificadas con el teléfono del cliente.`);
  out.push(p.stackable ? 'Acumulable con otras promociones marcadas como acumulables.' : 'No acumulable con otras promociones.');
  if (p.limits.maxPerDay) out.push(`Máximo ${p.limits.maxPerDay === 1 ? 'una promoción' : `${p.limits.maxPerDay} promociones`} por cliente al día.`);
  if (p.limits.maxPerMonth) out.push(`Máximo ${p.limits.maxPerMonth} por cliente al mes.`);
  if (p.limits.maxPerCustomer) out.push(`Máximo ${p.limits.maxPerCustomer} por cliente durante la vigencia.`);
  if (p.limits.maxUses) out.push(`Limitada a ${p.limits.maxUses.toLocaleString('es-MX')} beneficios en total.`);
  if (p.limits.maxDiscountCents) out.push(`Beneficio máximo de ${pesos(p.limits.maxDiscountCents)} por transacción.`);
  if (p.inventoryInitial !== null) out.push('Beneficio sujeto a disponibilidad y hasta agotar existencias.');
  if (['virtual_money', 'cashback_percent'].includes(p.benefit.type)) out.push(`El dinero virtual se abona a la cuenta del cliente${p.benefit.walletExpiresDays ? ` y vence a los ${p.benefit.walletExpiresDays} días` : ''}; no es canjeable por efectivo ni transferible.`);
  if (['coupon', 'product', 'partner_coupon'].includes(p.benefit.type)) out.push(`El cupón tiene vigencia de ${p.benefit.couponDays ?? 30} días y se canjea una sola vez.`);
  out.push('Requiere identificarse con número de teléfono registrado en el programa. No aplica en compras con recompensas, dinero virtual o puntos sobre la parte cubierta.');
  return out;
}

export function termsText(p: Pick<Promotion, 'rules' | 'limits' | 'stackable' | 'inventoryInitial' | 'benefit' | 'name'>, stationName?: StationLookup): string {
  const r = p.rules;
  const vig = r.startsAt && r.endsAt ? `Vigencia del ${fmtDate(r.startsAt)} al ${fmtDate(r.endsAt)}.` : r.endsAt ? `Vigente hasta el ${fmtDate(r.endsAt)}.` : 'Vigencia sujeta a cambios sin previo aviso.';
  return [`Promoción "${p.name}".`, vig, ...restrictions(p, stationName), 'Consulta términos y condiciones completos en el portal del cliente.'].join(' ');
}

/** Contenido publicitario por formato (sección 10). */
export interface AdContent {
  title: string; subtitle: string; description: string; cta: string; terms: string; validity: string; shortText: string;
  formats: Record<string, string>;
}

export function adContent(p: Promotion, stationName?: StationLookup): AdContent {
  const cond = conditionSentence(p.rules, p.benefit, p.benefits);
  const benefit = describeBenefit(p.rules.tiers?.length ? [...p.rules.tiers].sort((a, b) => b.minAmountCents - a.minAmountCents)[0].benefit : p.benefit);
  const r = p.rules;
  const validity = r.startsAt && r.endsAt ? `Del ${fmtDate(r.startsAt)} al ${fmtDate(r.endsAt)}` : r.endsAt ? `Hasta el ${fmtDate(r.endsAt)}` : 'Vigencia limitada';
  const title = p.name;
  const subtitle = `${cond}.`;
  const description = `${cond}. ${validity}. Solo di tu número de teléfono en la isla; sin app y sin tarjetas.`;
  const cta = ['virtual_money', 'cashback_percent'].includes(p.benefit.type) ? 'Carga hoy y acumula dinero virtual' : p.benefit.type.startsWith('discount') ? 'Aprovecha el descuento hoy' : 'Di tu número y gana';
  const terms = termsText(p, stationName);
  const shortText = `${cond}. ${validity}.`;
  const hashtags = '#Gasolinera #Promoción #Lealtad';
  const formats: Record<string, string> = {
    app: `${title}\n${subtitle}\n${validity}. Toca para ver tu progreso.`,
    web: `<h2>${title}</h2><p>${subtitle}</p><p><small>${validity}. Aplican restricciones.</small></p>`,
    banner: `${title} · ${benefit.toUpperCase()} · ${validity}`,
    pantalla_estacion: `${title}\n${cond}\n${validity} · Pregunta al despachador`,
    pantalla_surtidor: `${benefit.toUpperCase()}\n${cond}\nDi tu teléfono al despachador`,
    ticket: `*** ${title.toUpperCase()} ***\n${cond}.\n${validity}. Aplican restricciones. Consulta lealtad.mx/c`,
    whatsapp: `🎉 *${title}*\n${cond}.\n📅 ${validity}.\nSolo di tu número al cargar. Responde BAJA para no recibir promociones.`,
    sms: `${title}: ${cond}. ${validity}. Aplican restricciones. Responde BAJA para salir.`,
    email: `Asunto: ${title}\n\nHola,\n\n${cond}. ${validity}.\n\nSolo di tu número de teléfono en la isla y el beneficio se aplica automáticamente.\n\n${terms}`,
    facebook: `🎉 ${title}\n${cond}. ${validity}.\nDi tu número al cargar y listo. ${hashtags}`,
    instagram: `${title} ✨\n${cond}.\n${validity} 📅\n${hashtags} #México`,
    tiktok: `POV: cargas gasolina y te regalan ${benefit} 🤯 ${cond}. ${validity}. #gasolinera #promo #mexico`,
    push: `${title}: ${benefit}. ${cond.length > 70 ? `${cond.slice(0, 67)}…` : cond}.`,
    qr: `https://lealtad.mx/p/${p.id.slice(0, 8)}`,
    cartel: `${title.toUpperCase()}\n\n${benefit.toUpperCase()}\n\n${cond}\n\n${validity}\n\nAplican restricciones. Consulta términos y condiciones.`,
  };
  return { title, subtitle, description, cta, terms, validity, shortText, formats };
}
