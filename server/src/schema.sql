-- Esquema del MVP. Dinero en centavos enteros, volumen en mililitros enteros.
-- Escrito para SQLite; los tipos y restricciones migran directo a PostgreSQL.

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  program_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT REFERENCES stations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','attendant')),
  pin_hash TEXT NOT NULL,
  phone_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- Identidad global del cliente. El teléfono es un atributo, no la llave.
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  phone_hash TEXT NOT NULL UNIQUE,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

-- Un cliente participa en un grupo gasolinero mediante una membresía; los puntos viven aquí.
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  first_name TEXT NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  stamps INTEGER NOT NULL DEFAULT 0,
  last_purchase_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('program','marketing')),
  channel TEXT NOT NULL,
  granted INTEGER NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  station_id TEXT NOT NULL REFERENCES stations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  pos_reference TEXT NOT NULL,
  pump_number INTEGER,
  fuel_type TEXT CHECK (fuel_type IN ('regular','premium','diesel')),
  liters_ml INTEGER NOT NULL DEFAULT 0,
  price_per_liter_cents INTEGER NOT NULL DEFAULT 0,
  fuel_cents INTEGER NOT NULL DEFAULT 0,
  store_cents INTEGER NOT NULL DEFAULT 0,
  reward_cents INTEGER NOT NULL DEFAULT 0,
  returned_cents INTEGER NOT NULL DEFAULT 0,
  fuel_points INTEGER NOT NULL DEFAULT 0,
  store_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  stamp_awarded INTEGER NOT NULL DEFAULT 0,
  stamps_before INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('manual','pos')),
  status TEXT NOT NULL CHECK (status IN ('confirmed','void')),
  idempotency_key TEXT NOT NULL,
  dispensed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, station_id, pos_reference)
);

-- Libro de movimientos: solo inserción. Reversas y ajustes apuntan al asiento original.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  kind TEXT NOT NULL CHECK (kind IN ('earn','redeem','reverse','adjust','expire','release')),
  points_delta INTEGER NOT NULL,
  sale_id TEXT,
  reverses_entry_id TEXT,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  points INTEGER NOT NULL,
  value_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','applied','expired','cancelled')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sale_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- "Carga, Rasca y Gana": una tarjeta por carga que supere el mínimo. El premio se sortea y se
-- guarda al emitir la tarjeta; el cliente solo lo descubre al rascar, así no puede manipularse.
CREATE TABLE IF NOT EXISTS scratch_cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  sale_id TEXT NOT NULL REFERENCES sales(id),
  status TEXT NOT NULL CHECK (status IN ('available','revealed','expired','cancelled')),
  prize_points INTEGER NOT NULL,
  prize_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revealed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_scratch_membership ON scratch_cards (tenant_id, membership_id, status);

-- Cupones: de promoción, de producto o de asociado. Un código, un uso, una vigencia.
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  value_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('issued','reserved','redeemed','expired','cancelled')),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  promotion_id TEXT,
  partner_benefit_id TEXT,
  sale_id TEXT,
  redeemed_at TEXT,
  redeemed_sale_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_coupons_member ON coupons (tenant_id, membership_id, status);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','portal')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  token TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------------------
-- Plataforma de campañas y promociones
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','active','paused','ended')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  budget_cents INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT REFERENCES campaigns(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','paused','exhausted','ended')),
  priority INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 1,
  excludes_json TEXT NOT NULL DEFAULT '[]',
  rules_json TEXT NOT NULL,
  benefit_json TEXT NOT NULL,
  limits_json TEXT NOT NULL DEFAULT '{}',
  inventory_initial INTEGER,
  inventory_used INTEGER NOT NULL DEFAULT 0,
  exhausted_at TEXT,
  partner_id TEXT,
  restrictions_text TEXT NOT NULL DEFAULT '',
  terms_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_promotions_tenant_status ON promotions (tenant_id, status);

CREATE TABLE IF NOT EXISTS promotion_usages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  promotion_id TEXT NOT NULL REFERENCES promotions(id),
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  sale_id TEXT NOT NULL REFERENCES sales(id),
  station_id TEXT NOT NULL,
  benefit_json TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_usages_promo ON promotion_usages (tenant_id, promotion_id, created_at);
CREATE INDEX IF NOT EXISTS ix_usages_member ON promotion_usages (tenant_id, membership_id, promotion_id, created_at);

-- Dinero virtual: cada abono es un movimiento con saldo restante propio y su propia expiración.
CREATE TABLE IF NOT EXISTS wallet_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  kind TEXT NOT NULL CHECK (kind IN ('earn','spend','expire','cancel','reverse')),
  amount_cents INTEGER NOT NULL,
  remaining_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','partial','used','expired','cancelled','done')),
  source_type TEXT NOT NULL,
  promotion_id TEXT,
  station_id TEXT,
  sale_id TEXT,
  expires_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_wallet_member ON wallet_movements (tenant_id, membership_id, status, expires_at);

CREATE TABLE IF NOT EXISTS wallet_allocations (
  id TEXT PRIMARY KEY,
  spend_id TEXT NOT NULL REFERENCES wallet_movements(id),
  earn_id TEXT NOT NULL REFERENCES wallet_movements(id),
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partner_benefits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value_cents INTEGER NOT NULL DEFAULT 0,
  code_prefix TEXT NOT NULL DEFAULT 'AL',
  inventory_initial INTEGER,
  inventory_used INTEGER NOT NULL DEFAULT 0,
  valid_from TEXT,
  valid_until TEXT,
  stations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  competitor TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  benefit TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  region TEXT,
  state TEXT,
  city TEXT,
  station TEXT,
  audience TEXT,
  validity_text TEXT,
  result_rating INTEGER,
  result_notes TEXT,
  estimated_cost_cents INTEGER,
  source_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, kind, ref)
);

CREATE INDEX IF NOT EXISTS ix_memberships_tenant_customer ON memberships (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_sales_membership_day ON sales (tenant_id, membership_id, dispensed_at);
CREATE INDEX IF NOT EXISTS ix_sales_station_day ON sales (tenant_id, station_id, dispensed_at);
CREATE INDEX IF NOT EXISTS ix_ledger_membership ON ledger_entries (tenant_id, membership_id, created_at);
CREATE INDEX IF NOT EXISTS ix_redemptions_membership_status ON redemptions (tenant_id, membership_id, status);
CREATE INDEX IF NOT EXISTS ix_users_phone ON users (tenant_id, phone_hash);

-- Vehículos del cliente. La placa identifica al cliente en la bomba igual que su teléfono.
-- El tipo (auto, moto, camión…) se deduce del formato de la placa en plate.ts.
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plate TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
