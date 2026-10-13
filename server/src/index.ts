import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx } from './context.js';
import { openDb } from './db.js';
import { createApp } from './http/app.js';
import { Notifier } from './notifier.js';
import { seedDemo } from './seed.js';
import { seedRich } from './demo/seedRich.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, 'lealtad.db'));
const ctx = makeCtx(db, { notifier: new Notifier(true) });
seedDemo(ctx);
if (process.env.DEMO !== 'lite') {
  const started = Date.now();
  // La siembra de demostración no imprime los miles de mensajes que generaría.
  const rich = seedRich({ ...ctx, notifier: new Notifier(false) });
  if (rich) console.log(`Datos de demostración: ${rich.customers} clientes y ${rich.sales} cargas generadas en ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const webDist = resolve(here, '..', '..', 'web', 'dist');
const app = createApp(ctx, { webDist });
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Lealtad para gasolineras · API en http://localhost:${port}/v1`);
  console.log('Demo: estación EST-01 · NIP despachador 1111 · NIP gerente 1234 · cliente Ana 55 4433 4317');
  if (ctx.devMode) console.log('Modo desarrollo: los códigos de un solo uso se muestran en la respuesta y en /v1/dev/outbox');
});
