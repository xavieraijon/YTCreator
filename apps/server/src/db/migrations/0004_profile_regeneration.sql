-- «Reescribir con la IA» (entry 119, P33): a proposal already paid for waits here until the creator saves it or leaves
-- it, so closing the page or restarting YTCreator does not lose it. Additive: no table that existed changes.
CREATE TABLE profile_regeneration (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channel (id),
  base_version INTEGER NOT NULL CHECK (base_version >= 1),
  part TEXT NOT NULL CHECK (part IN ('promesa', 'temas', 'publico')),
  proposed TEXT NOT NULL,
  claims_trimmed INTEGER NOT NULL CHECK (claims_trimmed IN (0, 1)),
  usage_id TEXT REFERENCES ai_usage (id),
  created_at TEXT NOT NULL
);

CREATE INDEX profile_regeneration_channel ON profile_regeneration (channel_id, created_at);
