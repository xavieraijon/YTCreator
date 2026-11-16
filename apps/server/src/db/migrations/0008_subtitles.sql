-- 0008: the subtitles of a script and their versions; the recognition and the engine download become background
-- jobs, which can wait in a queue (specs/007-subtitles/data-model.md, research.md R5).
-- background_job is rebuilt while script and publish_package point at it, so the keys are off around this migration:
-- ytc:foreign-keys-off

CREATE TABLE background_job_new (
  id TEXT PRIMARY KEY,
  journey_id TEXT REFERENCES journey (id),
  channel_id TEXT REFERENCES channel (id),
  kind TEXT NOT NULL CHECK (kind IN ('medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia',
    'actualizar_lector', 'medir_ideas', 'reconocer_voz', 'descargar_motor')),
  status TEXT NOT NULL CHECK (status IN ('en_cola', 'en_curso', 'hecho', 'fallido', 'interrumpido')),
  progress TEXT NOT NULL DEFAULT '{"done":0,"total":0}',
  failure TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  CHECK (kind <> 'medir_ideas' OR channel_id IS NOT NULL),
  CHECK (kind <> 'reconocer_voz' OR channel_id IS NOT NULL)
);
INSERT INTO background_job_new (id, journey_id, channel_id, kind, status, progress, failure, started_at, finished_at)
  SELECT id, journey_id, channel_id, kind, status, progress, failure, started_at, finished_at FROM background_job;
DROP TABLE background_job;
ALTER TABLE background_job_new RENAME TO background_job;
CREATE INDEX background_job_channel ON background_job (channel_id, status);

CREATE TABLE subtitle_track (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  script_id TEXT NOT NULL UNIQUE REFERENCES script (id),
  format TEXT NOT NULL CHECK (format IN ('largo', 'short')),
  audio_file TEXT,
  audio_seconds REAL CHECK (audio_seconds IS NULL OR audio_seconds > 0),
  source_name TEXT,
  approved_version INTEGER,
  approved_at TEXT,
  replacements TEXT NOT NULL DEFAULT '[]',
  speed_model TEXT,
  job_id TEXT REFERENCES background_job (id),
  job_op TEXT CHECK (job_op IS NULL OR job_op IN ('reconocer', 'revision_ia')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX subtitle_track_channel ON subtitle_track (channel_id, updated_at);

CREATE TABLE subtitle_version (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES subtitle_track (id),
  version INTEGER NOT NULL CHECK (version >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('reconocimiento', 'edicion', 'ia', 'recuperada', 'reaplicada')),
  content TEXT NOT NULL,
  draft_version INTEGER,
  restored_from INTEGER,
  usage_id TEXT REFERENCES ai_usage (id),
  prompt_id TEXT,
  prompt_version INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (track_id, version)
);
