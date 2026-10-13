import { makeCtx, type Ctx } from '../src/context.js';
import { openDb } from '../src/db.js';
import { Notifier } from '../src/notifier.js';
import { seedDemo, type SeedResult } from '../src/seed.js';
import { resetLookupLimits } from '../src/services/customers.js';

export interface TestWorld { ctx: Ctx; seed: SeedResult; clock: { now: Date }; notifier: Notifier }

/** Mundo de prueba con reloj controlable. Arranca un martes a las 10:00 para evitar multiplicadores. */
export function world(start = new Date(2026, 8, 8, 10, 0, 0)): TestWorld {
  const clock = { now: start };
  const notifier = new Notifier(false);
  const ctx = makeCtx(openDb(':memory:'), { now: () => new Date(clock.now), salt: 'test-salt', notifier, devMode: true });
  resetLookupLimits();
  const seed = seedDemo(ctx);
  return { ctx, seed, clock, notifier };
}

export const luis = { userId: 'u-luis', tenantId: 'demo', stationId: 'st-centro', role: 'attendant' as const };
export const manager = { userId: 'u-manager', tenantId: 'demo', stationId: 'st-centro', role: 'manager' as const };

/** Extrae el último código de 4 dígitos enviado a un teléfono. */
export function lastCode(notifier: Notifier, e164: string): string {
  const msgs = notifier.outbox.filter((m) => m.to === e164 && m.kind === 'auth');
  const last = msgs[msgs.length - 1];
  const match = last?.text.match(/\b(\d{4})\b/);
  if (!match) throw new Error('No hay código en la bandeja');
  return match[1];
}

export function advance(w: TestWorld, minutes: number): void {
  w.clock.now = new Date(w.clock.now.getTime() + minutes * 60_000);
}
