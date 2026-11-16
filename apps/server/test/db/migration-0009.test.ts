import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'
import { createSubtitleTracksRepo } from '../../src/db/repos/subtitle-tracks.ts'

const NOW = '2026-11-16T10:00:00.000Z'

// 0009 only adds where the AI's proposal waits (R11): what a 0008 installation had stays as it was.
describe('migration 0009', () => {
  it('keeps every track and starts them with no proposal', () => {
    const db = openDatabase(':memory:')
    migrate(
      db,
      MIGRATIONS.filter((m) => m.version <= 8),
    )
    db.prepare(
      `INSERT INTO channel (id, origin, name_status, created_at, updated_at) VALUES ('c', 'nuevo', 'provisional', ?, ?)`,
    ).run(NOW, NOW)
    db.prepare(
      `INSERT INTO idea (id, channel_id, origin, title, format, status, position, original, profile_version,
         created_at, updated_at) VALUES ('i', 'c', 'creador', 'Idea', 'largo', 'banco', 1, '{}', 1, ?, ?)`,
    ).run(NOW, NOW)
    db.prepare(
      `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, created_at, updated_at)
       VALUES ('s', 'c', 'i', 'largo', 600, ?, ?)`,
    ).run(NOW, NOW)
    db.prepare(
      `INSERT INTO subtitle_track (id, channel_id, script_id, format, replacements, created_at, updated_at)
       VALUES ('t', 'c', 's', 'largo', '[{"from":"pan","to":"bollo"}]', ?, ?)`,
    ).run(NOW, NOW)
    migrate(db, MIGRATIONS)
    const tracks = createSubtitleTracksRepo(db)
    expect(tracks.get('t')).toMatchObject({ replacements: [{ from: 'pan', to: 'bollo' }], aiProposal: null })

    const proposal = {
      baseVersion: 1,
      changes: [{ cueId: 'c1', text: 'Hola.', reason: 'falta el punto final' }],
      usageIds: ['u'],
      promptId: 'revision_subtitulos',
      promptVersion: 1,
    }
    tracks.setAiProposal('t', proposal)
    expect(tracks.get('t')!.aiProposal).toEqual(proposal)
    // A row that no longer fits is no proposal, never half of one.
    db.prepare(`UPDATE subtitle_track SET ai_proposal = '{"baseVersion":0}' WHERE id = 't'`).run()
    expect(tracks.get('t')!.aiProposal).toBeNull()
    tracks.setAiProposal('t', null)
    expect(tracks.get('t')!.aiProposal).toBeNull()
  })
})
