-- 0002: channel, guided journeys, AI proposals, profile versions, market measures, name checks, channel readings,
-- background jobs, AI usage and the YouTube cache and quota (data-model.md of 003).

CREATE TABLE channel (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL CHECK (origin IN ('nuevo', 'existente')),
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 100),
  handle TEXT CHECK (handle IS NULL OR (length(handle) BETWEEN 3 AND 30
    AND handle NOT GLOB '*[^A-Za-z0-9._-]*')),
  name_status TEXT NOT NULL DEFAULT 'provisional' CHECK (name_status IN ('provisional', 'elegido')),
  youtube_channel_id TEXT CHECK (youtube_channel_id IS NULL OR (length(youtube_channel_id) = 24
    AND substr(youtube_channel_id, 1, 2) = 'UC' AND youtube_channel_id NOT GLOB '*[^A-Za-z0-9_-]*')),
  language TEXT NOT NULL DEFAULT 'es',
  audience_region TEXT NOT NULL DEFAULT 'espana' CHECK (audience_region IN ('espana', 'latam', 'mixto')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX channel_youtube_id ON channel (youtube_channel_id) WHERE youtube_channel_id IS NOT NULL;

CREATE TABLE journey (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  kind TEXT NOT NULL CHECK (kind IN ('nuevo', 'existente')),
  step TEXT NOT NULL CHECK (step IN ('intereses', 'preguntas', 'nichos', 'ritmo', 'conceptos', 'nombres', 'hecho',
    'enlace', 'confirmar', 'lectura', 'posicionamiento')),
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'terminado', 'abandonado')),
  state TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- At most one active journey per channel.
CREATE UNIQUE INDEX journey_one_active ON journey (channel_id) WHERE status = 'activo';

CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  journey_id TEXT REFERENCES journey (id),
  use TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  estimated_cents INTEGER NOT NULL CHECK (estimated_cents >= 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  pricing_version INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ai_usage_created_at ON ai_usage (created_at);

CREATE TABLE proposal (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journey (id),
  kind TEXT NOT NULL CHECK (kind IN ('preguntas', 'nichos', 'recomendacion', 'conceptos', 'nombres', 'perfil_actual',
    'posicionamiento')),
  payload TEXT NOT NULL,
  edited_payload TEXT,
  selected_index INTEGER CHECK (selected_index IS NULL OR selected_index >= 0),
  status TEXT NOT NULL DEFAULT 'propuesta' CHECK (status IN ('propuesta', 'aprobada', 'descartada')),
  parent_id TEXT REFERENCES proposal (id),
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 500),
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  claims_trimmed INTEGER NOT NULL DEFAULT 0 CHECK (claims_trimmed IN (0, 1)),
  usage_id TEXT REFERENCES ai_usage (id),
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE INDEX proposal_journey ON proposal (journey_id, kind);

CREATE TABLE channel_profile (
  channel_id TEXT PRIMARY KEY REFERENCES channel (id),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE profile_version (
  channel_id TEXT NOT NULL REFERENCES channel (id),
  version INTEGER NOT NULL CHECK (version >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('ia', 'manual', 'restaurada')),
  restored_from INTEGER,
  proposal_id TEXT REFERENCES proposal (id),
  profile TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, version),
  CHECK ((origin = 'restaurada') = (restored_from IS NOT NULL))
);

CREATE TABLE market_measure (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journey (id),
  niche_label TEXT NOT NULL,
  queries TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ytdlp', 'data_api', 'fake')),
  status TEXT NOT NULL CHECK (status IN ('en_curso', 'medida', 'fallida')),
  failure TEXT,
  demand_median_views INTEGER,
  demand_level TEXT CHECK (demand_level IS NULL OR demand_level IN ('alta', 'media', 'baja')),
  entry_channels INTEGER,
  entry_level TEXT CHECK (entry_level IS NULL OR entry_level IN ('abierta', 'entreabierta', 'cerrada')),
  concentration REAL CHECK (concentration IS NULL OR concentration BETWEEN 0 AND 1),
  concentration_level TEXT CHECK (concentration_level IS NULL OR concentration_level IN ('alta', 'media', 'baja')),
  recent_videos INTEGER,
  recent_share REAL CHECK (recent_share IS NULL OR recent_share BETWEEN 0 AND 1),
  sample_size INTEGER,
  shorts_in_sample INTEGER,
  shorts_median_views INTEGER,
  unknown_format_videos INTEGER,
  small_channels INTEGER,
  hidden_subscribers INTEGER,
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('conviene', 'con_reservas', 'no_conviene')),
  thresholds_version INTEGER NOT NULL,
  measured_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (status != 'fallida' OR (failure IS NOT NULL AND verdict IS NULL AND demand_median_views IS NULL))
);

CREATE TABLE reference_channel (
  id TEXT PRIMARY KEY,
  measure_id TEXT NOT NULL REFERENCES market_measure (id),
  youtube_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT,
  subscribers INTEGER,
  top_video_views INTEGER NOT NULL,
  median_views INTEGER,
  best_ratio REAL,
  best_video_id TEXT,
  best_video_title TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('puerta_de_entrada', 'mejor_video', 'anadido_por_ti')),
  fetched_at TEXT NOT NULL,
  UNIQUE (measure_id, youtube_channel_id)
);

CREATE TABLE name_check (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journey (id),
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('ia', 'creador')),
  semaphore TEXT NOT NULL CHECK (semaphore IN ('rojo', 'ambar', 'verde', 'sin_comprobar')),
  reasons TEXT NOT NULL DEFAULT '[]',
  handle_status TEXT NOT NULL CHECK (handle_status IN ('libre', 'ocupado', 'sin_comprobar')),
  similar_channels TEXT NOT NULL DEFAULT '[]',
  title_hits INTEGER,
  checked_at TEXT NOT NULL
);

CREATE TABLE channel_reading (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  youtube_channel_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ytdlp', 'data_api', 'fake')),
  title TEXT NOT NULL,
  handle TEXT,
  description TEXT NOT NULL,
  subscribers INTEGER,
  video_count INTEGER,
  videos TEXT NOT NULL,
  summary TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE background_job (
  id TEXT PRIMARY KEY,
  journey_id TEXT REFERENCES journey (id),
  kind TEXT NOT NULL CHECK (kind IN ('medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia',
    'actualizar_lector')),
  status TEXT NOT NULL CHECK (status IN ('en_curso', 'hecho', 'fallido', 'interrumpido')),
  progress TEXT NOT NULL DEFAULT '{"done":0,"total":0}',
  failure TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE yt_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE yt_quota (
  day TEXT PRIMARY KEY CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0)
);
