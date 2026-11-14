-- 0007: the publishing package of an approved script, its versions and the publishing settings of each channel
-- (specs/006-publishing-package). Additive: no table is rebuilt.

CREATE TABLE channel_publish_settings (
  channel_id TEXT PRIMARY KEY REFERENCES channel (id),
  fixed_text TEXT NOT NULL CHECK (length(fixed_text) <= 1500),
  -- One of studio.json; the service checks it. NULL: the suggested one, as an assumption.
  category TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE publish_package (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  script_id TEXT NOT NULL UNIQUE REFERENCES script (id),
  format TEXT NOT NULL CHECK (format IN ('largo', 'short')),
  cover_approved TEXT,
  texts_approved TEXT,
  package_approved TEXT,
  package_approved_at TEXT,
  package_approved_warnings INTEGER CHECK (package_approved_warnings IS NULL OR package_approved_warnings >= 0),
  package_approved_draft INTEGER,
  studio_done TEXT NOT NULL DEFAULT '[]',
  job_id TEXT REFERENCES background_job (id),
  job_op TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX publish_package_channel ON publish_package (channel_id, updated_at);

CREATE TABLE package_version (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES publish_package (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('titulos', 'miniaturas', 'portada_short', 'descripcion', 'capitulos', 'etiquetas', 'comentario')
  ),
  version INTEGER NOT NULL CHECK (version >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('ia', 'edicion', 'parte_ia', 'recuperada')),
  content TEXT NOT NULL,
  draft_version INTEGER NOT NULL,
  main_title TEXT,
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 500),
  prompt_id TEXT,
  prompt_version INTEGER,
  usage_id TEXT REFERENCES ai_usage (id),
  restored_from INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (package_id, kind, version)
);
