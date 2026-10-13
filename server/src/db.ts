import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plateKind } from './plate.js';

export type Db = DatabaseSync;

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path: string = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    // WAL deja leer mientras otra bomba escribe; NORMAL es seguro con WAL y evita un fsync por venta.
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    // Si dos escrituras chocan, esperar hasta 5 s en vez de fallar con "database is locked".
    db.exec('PRAGMA busy_timeout = 5000;');
    // ~32 MB de caché de páginas y mapeo en memoria: los reportes leen mucho la misma tabla de ventas.
    db.exec('PRAGMA cache_size = -32000;');
    db.exec('PRAGMA mmap_size = 268435456;');
    db.exec('PRAGMA temp_store = MEMORY;');
  }
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrate(db);
  // Actualiza las estadísticas que usa SQLite para elegir índices (barato si no hay cambios).
  if (path !== ':memory:') db.exec('PRAGMA optimize;');
  return db;
}

/** Columnas añadidas después de la primera versión. Se agregan si faltan (bases de desarrollo existentes). */
const COLUMN_MIGRATIONS: Array<[table: string, column: string, ddl: string]> = [
  ['stations', 'state', 'TEXT'],
  ['stations', 'city', 'TEXT'],
  ['stations', 'municipality', 'TEXT'],
  ['stations', 'region', 'TEXT'],
  ['memberships', 'customer_type', "TEXT NOT NULL DEFAULT 'particular'"],
  ['memberships', 'birthday', 'TEXT'],
  ['memberships', 'home_station_id', 'TEXT'],
  ['sales', 'payment_method', "TEXT NOT NULL DEFAULT 'efectivo'"],
  ['sales', 'wallet_spent_cents', 'INTEGER NOT NULL DEFAULT 0'],
  ['sales', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0'],
  ['sales', 'promos_json', 'TEXT'],
  ['tenants', 'meta_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['wallet_movements', 'min_purchase_cents', 'INTEGER NOT NULL DEFAULT 0'],
  ['wallet_movements', 'scope', "TEXT NOT NULL DEFAULT 'any'"],
  ['wallet_movements', 'single_use', 'INTEGER NOT NULL DEFAULT 0'],
  ['promotions', 'benefits_json', "TEXT NOT NULL DEFAULT '[]'"],
  ['sales', 'store_items_json', 'TEXT'],
];

export function migrate(db: Db): void {
  migrateVehicles(db);
  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Las primeras bases tenían `CHECK (kind IN ('auto','moto'))`; SQLite no permite quitarlo, así que
 * se reconstruye la tabla. Luego se recalcula el tipo de cada placa con las reglas vigentes.
 */
function migrateVehicles(db: Db): void {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vehicles'").get() as { sql: string } | undefined;
  if (table?.sql.includes("CHECK (kind IN ('auto','moto'))")) {
    db.exec(`BEGIN;
      CREATE TABLE vehicles_new (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), plate TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO vehicles_new SELECT id, customer_id, plate, kind, created_at FROM vehicles;
      DROP TABLE vehicles;
      ALTER TABLE vehicles_new RENAME TO vehicles;
      CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
      COMMIT;`);
  }
  const update = db.prepare('UPDATE vehicles SET kind = ? WHERE id = ? AND kind <> ?');
  for (const v of db.prepare('SELECT id, plate FROM vehicles').all() as Array<{ id: string; plate: string }>) {
    const kind = plateKind(v.plate);
    update.run(kind, v.id, kind);
  }
}

/**
 * Transacción con bloqueo de escritura inmediato. SQLite serializa escritores, así que
 * dos islas que intentan gastar los mismos puntos entran aquí una después de la otra
 * y la segunda vuelve a leer el saldo ya descontado.
 */
export function withTx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function one<T = Record<string, unknown>>(db: Db, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function all<T = Record<string, unknown>>(db: Db, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function run(db: Db, sql: string, ...params: unknown[]): void {
  db.prepare(sql).run(...(params as never[]));
}
