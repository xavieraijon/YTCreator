-- 0009: the AI's review of the subtitles waits as a proposal the creator accepts cue by cue; it is never a version on
-- its own (specs/007-subtitles/research.md R11, decisions.md). Only a column is added: nothing is rebuilt or lost.

ALTER TABLE subtitle_track ADD COLUMN ai_proposal TEXT;
