import { randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import { one } from './db.js';
import { DEFAULT_PROGRAM, type ProgramConfig } from './rules.js';
import { Notifier } from './notifier.js';

export interface Ctx {
  db: Db;
  now: () => Date;
  salt: string;
  notifier: Notifier;
  /** En desarrollo los códigos de un solo uso se devuelven en la respuesta para poder probar sin WhatsApp. */
  devMode: boolean;
}

export function makeCtx(db: Db, opts: Partial<Omit<Ctx, 'db'>> = {}): Ctx {
  return {
    db,
    now: opts.now ?? (() => new Date()),
    salt: opts.salt ?? process.env.PHONE_SALT ?? 'dev-salt-cambiar-en-produccion',
    notifier: opts.notifier ?? new Notifier(),
    devMode: opts.devMode ?? process.env.NODE_ENV !== 'production',
  };
}

export const newId = () => randomUUID();
export const iso = (d: Date) => d.toISOString();

export function loadProgram(ctx: Ctx, tenantId: string): ProgramConfig {
  const row = one<{ program_json: string }>(ctx.db, 'SELECT program_json FROM tenants WHERE id = ?', tenantId);
  if (!row) return DEFAULT_PROGRAM;
  return { ...DEFAULT_PROGRAM, ...(JSON.parse(row.program_json) as Partial<ProgramConfig>) };
}

export function audit(ctx: Ctx, tenantId: string, actorUserId: string | null, action: string, entity: string, entityId: string | null, detail?: unknown): void {
  ctx.db
    .prepare('INSERT INTO audit_log (id, tenant_id, actor_user_id, action, entity, entity_id, detail_json, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(newId(), tenantId, actorUserId, action, entity, entityId, detail === undefined ? null : JSON.stringify(detail), iso(ctx.now()));
}
