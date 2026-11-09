-- 0005: the idea bank of each channel, its AI batches and the measures of each idea (specs/004-idea-bank).
-- Additive: background_job is rebuilt to admit 'medir_ideas' and channel_id, keeping every row.

CREATE TABLE background_job_new (
  id TEXT PRIMARY KEY,
  journey_id TEXT REFERENCES journey (id),
  channel_id TEXT REFERENCES channel (id),
  kind TEXT NOT NULL CHECK (kind IN ('medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia',
    'actualizar_lector', 'medir_ideas')),
  status TEXT NOT NULL CHECK (status IN ('en_curso', 'hecho', 'fallido', 'interrumpido')),
  progress TEXT NOT NULL DEFAULT '{"done":0,"total":0}',
  failure TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  -- A measure of ideas belongs to a channel, or it would never show as running in its bank.
  CHECK (kind <> 'medir_ideas' OR channel_id IS NOT NULL)
);
INSERT INTO background_job_new (id, journey_id, kind, status, progress, failure, started_at, finished_at)
  SELECT id, journey_id, kind, status, progress, failure, started_at, finished_at FROM background_job;
DROP TABLE background_job;
ALTER TABLE background_job_new RENAME TO background_job;
CREATE INDEX background_job_channel ON background_job (channel_id, status);

CREATE TABLE idea_batch (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  kind TEXT NOT NULL CHECK (kind IN ('ideas', 'otro_enfoque')),
  source_idea_id TEXT REFERENCES idea (id),
  payload TEXT NOT NULL,
  decisions TEXT NOT NULL DEFAULT '{}',
  removed_repeats INTEGER NOT NULL DEFAULT 0 CHECK (removed_repeats >= 0),
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 500),
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  claims_trimmed INTEGER NOT NULL DEFAULT 0 CHECK (claims_trimmed IN (0, 1)),
  usage_id TEXT REFERENCES ai_usage (id),
  profile_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((kind = 'otro_enfoque') = (source_idea_id IS NOT NULL))
);
CREATE INDEX idea_batch_channel ON idea_batch (channel_id, created_at);

CREATE TABLE idea (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  origin TEXT NOT NULL CHECK (origin IN ('ia', 'creador', 'otro_enfoque')),
  batch_id TEXT REFERENCES idea_batch (id),
  source_idea_id TEXT REFERENCES idea (id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  hook TEXT NOT NULL DEFAULT '' CHECK (length(hook) <= 300),
  pillar TEXT,
  format TEXT NOT NULL CHECK (format IN ('largo', 'short')),
  query TEXT CHECK (query IS NULL OR length(query) BETWEEN 1 AND 120),
  broad_query TEXT CHECK (broad_query IS NULL OR length(broad_query) BETWEEN 1 AND 120),
  query_en TEXT CHECK (query_en IS NULL OR length(query_en) BETWEEN 1 AND 120),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'banco' CHECK (status IN ('banco', 'elegida', 'hecha', 'archivada')),
  position INTEGER NOT NULL,
  queue_position INTEGER CHECK (queue_position IS NULL OR queue_position >= 1),
  original TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  profile_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'elegida') = (queue_position IS NOT NULL))
);
CREATE INDEX idea_channel_status ON idea (channel_id, status, position);
CREATE INDEX idea_channel_queue ON idea (channel_id, queue_position);

CREATE TABLE idea_measure (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES idea (id),
  idea_revision INTEGER NOT NULL CHECK (idea_revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('medida', 'fallida')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('hueco', 'competido', 'quemado', 'frio')),
  reason TEXT,
  figures TEXT,
  similar_videos TEXT NOT NULL DEFAULT '[]',
  opportunity TEXT,
  queries TEXT NOT NULL,
  failure TEXT,
  source TEXT NOT NULL CHECK (source IN ('ytdlp', 'data_api', 'fake')),
  partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1)),
  thresholds_version INTEGER NOT NULL,
  measured_at TEXT NOT NULL,
  CHECK ((status = 'medida') = (verdict IS NOT NULL)),
  CHECK ((status = 'fallida') = (failure IS NOT NULL))
);
CREATE INDEX idea_measure_idea ON idea_measure (idea_id, measured_at);
