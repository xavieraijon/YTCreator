-- 0001: wizard state, AI connections, subscription accounts, spending limits and settings (data-model.md).

CREATE TABLE onboarding_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  step TEXT NOT NULL CHECK (step IN ('bienvenida', 'elegir', 'conectar', 'limites', 'listo', 'completado')),
  chosen_kind TEXT CHECK (chosen_kind IS NULL OR chosen_kind IN ('suscripcion', 'pago_por_uso')),
  postponed INTEGER NOT NULL DEFAULT 0 CHECK (postponed IN (0, 1)),
  completed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT INTO onboarding_state (id, step, updated_at)
VALUES (1, 'bienvenida', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE ai_connection (
  kind TEXT PRIMARY KEY CHECK (kind IN ('suscripcion', 'pago_por_uso')),
  provider_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('sin_comprobar', 'conectada', 'sin_sesion', 'cupo_agotado',
    'tiempo_agotado', 'contenido_filtrado', 'no_disponible')),
  status_reason TEXT,
  resets_at TEXT,
  last_checked_at TEXT,
  secret_ref TEXT,
  secret_hint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- At most one active connection.
CREATE UNIQUE INDEX ai_connection_one_active ON ai_connection (is_active) WHERE is_active = 1;

CREATE TABLE subscription_account (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  identity_fingerprint TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  status TEXT NOT NULL CHECK (status IN ('sin_comprobar', 'conectada', 'sin_sesion', 'cupo_agotado',
    'tiempo_agotado', 'contenido_filtrado', 'no_disponible')),
  status_reason TEXT,
  resets_at TEXT,
  last_checked_at TEXT,
  last_call_at TEXT,
  secret_ref TEXT NOT NULL,
  secret_hint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider_id, identity_fingerprint)
);

CREATE TABLE spending_limits (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  per_operation_cents INTEGER NOT NULL CHECK (per_operation_cents > 0),
  daily_cents INTEGER NOT NULL CHECK (daily_cents >= per_operation_cents),
  monthly_cents INTEGER NOT NULL CHECK (monthly_cents >= daily_cents AND monthly_cents <= 100000),
  accepted_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
