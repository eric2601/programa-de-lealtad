// Agrega la campaña demo "Por tipo de vehículo" a una base que ya existe (las nuevas la traen
// desde la siembra). Usa la API como lo haría un gerente.
// Uso, con el servidor corriendo: npx tsx scripts/add-vehicle-promos.ts [http://localhost:8787]
import { VEHICLE_PROMOS } from '../src/demo/vehiclePromos.js';

const base = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '') + '/v1';

async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json as T;
}

const { token } = await call<{ token: string }>('/auth/pin', { stationCode: 'EST-01', pin: '1234' });
const existing = await fetch(base + '/admin/campaigns', { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json()) as Array<{ name: string }>;
if (existing.some((c) => c.name === 'Por tipo de vehículo')) {
  console.log('La campaña "Por tipo de vehículo" ya existe; no se hizo nada.');
  process.exit(0);
}
const now = new Date();
const campaign = await call<{ id: string }>('/admin/campaigns', {
  name: 'Por tipo de vehículo',
  description: 'Beneficios según la placa registrada: motos, servicio público, carga pesada, emergencia y ecológicos.',
  objective: 'litros', status: 'active', startsAt: now.toISOString(), endsAt: new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString(), budgetCents: null,
}, token);
for (const p of VEHICLE_PROMOS) {
  await call('/admin/promotions', { ...p, campaignId: campaign.id, status: 'active', limits: p.limits ?? {} }, token);
  console.log(`+ ${p.name}`);
}
console.log('Listo.');
