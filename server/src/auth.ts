import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Ctx } from './context.js';
import { audit } from './context.js';
import { all, one } from './db.js';
import { unauthorized } from './errors.js';
import type { Actor } from './services/sales.js';

export interface Session extends Actor { token: string; name: string; stationCode: string; stationName: string; tenantName: string; createdAt: number }

const sessions = new Map<string, Session>();
const SESSION_HOURS = 12;

export const hashPin = (pin: string, salt: string) => createHash('sha256').update(`${salt}:pin:${pin}`).digest('hex');

function pinMatches(pin: string, hash: string, salt: string): boolean {
  const a = Buffer.from(hashPin(pin, salt));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface UserRow { id: string; tenant_id: string; station_id: string | null; name: string; role: Actor['role']; pin_hash: string }

/** Inicio de sesión de despachador, gerente o administrador con código de estación y NIP personal. */
export function loginWithPin(ctx: Ctx, stationCode: string, pin: string): Session {
  const station = one<{ id: string; tenant_id: string; code: string; name: string }>(ctx.db, 'SELECT * FROM stations WHERE code = ?', stationCode.trim().toUpperCase());
  if (!station) throw unauthorized('Código de estación o NIP incorrectos.');
  const users = all<UserRow>(ctx.db, 'SELECT * FROM users WHERE tenant_id = ? AND active = 1 AND (station_id IS NULL OR station_id = ?)', station.tenant_id, station.id);
  const user = users.find((u) => pinMatches(pin, u.pin_hash, ctx.salt));
  if (!user) {
    audit(ctx, station.tenant_id, null, 'auth.failed', 'station', station.id);
    throw unauthorized('Código de estación o NIP incorrectos.');
  }
  const tenant = one<{ name: string }>(ctx.db, 'SELECT name FROM tenants WHERE id = ?', station.tenant_id);
  const token = randomBytes(24).toString('hex');
  const session: Session = {
    token, userId: user.id, tenantId: user.tenant_id, stationId: station.id, role: user.role, name: user.name,
    stationCode: station.code, stationName: station.name, tenantName: tenant?.name ?? '', createdAt: Date.now(),
  };
  sessions.set(token, session);
  audit(ctx, station.tenant_id, user.id, 'auth.login', 'station', station.id);
  return session;
}

export function sessionFromToken(token: string | undefined): Session | undefined {
  if (!token) return undefined;
  const s = sessions.get(token);
  if (!s) return undefined;
  if (Date.now() - s.createdAt > SESSION_HOURS * 3_600_000) { sessions.delete(token); return undefined; }
  return s;
}

export function logout(token: string): void {
  sessions.delete(token);
}

const RANK: Record<Actor['role'], number> = { attendant: 0, manager: 1, admin: 2, owner: 3 };
export const atLeast = (role: Actor['role'], min: Actor['role']) => RANK[role] >= RANK[min];
