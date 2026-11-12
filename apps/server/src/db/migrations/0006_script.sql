-- 0006: the script of an idea, its versions and the voice of each channel (specs/005-script-and-outline).
-- Additive: no table is rebuilt.

CREATE TABLE channel_script_settings (
  channel_id TEXT PRIMARY KEY REFERENCES channel (id),
  address TEXT NOT NULL DEFAULT 'tu' CHECK (address IN ('tu', 'usted')),
  register TEXT NOT NULL DEFAULT 'cercano' CHECK (register IN ('cercano', 'sobrio', 'energico')),
  sample TEXT NOT NULL DEFAULT '' CHECK (length(sample) <= 4000),
  words_per_minute INTEGER NOT NULL DEFAULT 150 CHECK (words_per_minute BETWEEN 100 AND 220),
  updated_at TEXT NOT NULL
);

CREATE TABLE script (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  idea_id TEXT NOT NULL UNIQUE REFERENCES idea (id),
  format TEXT NOT NULL CHECK (format IN ('largo', 'short')),
  -- The most a Short can last lives in shorts.json: the service checks it.
  target_seconds INTEGER NOT NULL CHECK (
    target_seconds >= 15 AND (format <> 'largo' OR target_seconds BETWEEN 180 AND 1800)
  ),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  outline_approved_version INTEGER,
  draft_approved_version INTEGER,
  draft_approved_at TEXT,
  draft_approved_pending INTEGER CHECK (draft_approved_pending IS NULL OR draft_approved_pending >= 0),
  source_script_id TEXT REFERENCES script (id),
  source_block_id TEXT,
  source_draft_version INTEGER,
  short_angles TEXT,
  job_id TEXT REFERENCES background_job (id),
  job_op TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX script_channel ON script (channel_id, updated_at);

CREATE TABLE script_version (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES script (id),
  kind TEXT NOT NULL CHECK (kind IN ('hechos', 'escaleta', 'guion')),
  version INTEGER NOT NULL CHECK (version >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('ia', 'edicion', 'bloque_ia', 'recuperada', 'comprobacion', 'marcas', 'heredada')),
  content TEXT NOT NULL,
  facts_version INTEGER,
  outline_version INTEGER,
  idea_revision INTEGER NOT NULL,
  profile_version INTEGER NOT NULL,
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 500),
  prompt_id TEXT,
  prompt_version INTEGER,
  usage_id TEXT REFERENCES ai_usage (id),
  restored_from INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (script_id, kind, version)
);

ALTER TABLE ai_usage ADD COLUMN web_searches INTEGER NOT NULL DEFAULT 0;
