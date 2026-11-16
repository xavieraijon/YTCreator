import type { SubtitlesContent } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createIdeasRepo } from '../../../src/db/repos/ideas.ts'
import { createJobsRepo } from '../../../src/db/repos/jobs.ts'
import { createScriptsRepo } from '../../../src/db/repos/scripts.ts'
import { createSubtitleTracksRepo } from '../../../src/db/repos/subtitle-tracks.ts'
import { createSubtitleVersionsRepo } from '../../../src/db/repos/subtitle-versions.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

const content = (text = 'Hola', extra: Partial<SubtitlesContent> = {}): SubtitlesContent => ({
  cues: [{ id: 'c1', start: 0, end: 1.5, text, flags: [], heard: null, reviewed: false }],
  words: [{ text: 'Hola', start: 0, end: 0.4, p: 0.9 }],
  audioSeconds: 10,
  ...extra,
})

function setup() {
  const db = freshDb()
  const clock = manualClock()
  const { channelId } = seedJourney(db)
  const ideas = createIdeasRepo(db, clock.now)
  const scripts = createScriptsRepo(db, clock.now)
  const tracks = createSubtitleTracksRepo(db, clock.now)
  const versions = createSubtitleVersionsRepo(db, clock.now)
  const jobs = createJobsRepo(db, clock.now)
  const script = (format: 'largo' | 'short' = 'largo') => {
    const idea = ideas.create({ channelId, origin: 'creador', title: 'Idea', format, profileVersion: 1 })
    return scripts.create({ channelId, ideaId: idea.id, format, targetSeconds: format === 'largo' ? 600 : 60 })
  }
  const track = (format: 'largo' | 'short' = 'largo') =>
    tracks.create({ channelId, scriptId: script(format).id, format })
  const add = (trackId: string, text = 'Hola') =>
    versions.add({ trackId, origin: 'reconocimiento', content: content(text), draftVersion: 1 })
  return { db, clock, channelId, tracks, versions, jobs, script, track, add }
}

describe('subtitle tracks repo (data-model.md)', () => {
  it('creates a track and reads it by script, with nothing approved and no replacements', () => {
    const { tracks, track } = setup()
    const made = track()
    expect(tracks.get(made.id)).toMatchObject({
      format: 'largo',
      audioFile: null,
      audioSeconds: null,
      sourceName: null,
      approvedVersion: null,
      approvedAt: null,
      replacements: [],
      speedModel: null,
      jobId: null,
      jobOp: null,
    })
    expect(tracks.getByScript(made.scriptId)?.id).toBe(made.id)
    expect(tracks.getByScript('no-existe')).toBeNull()
  })

  it('a script has only one track', () => {
    const { tracks, script, channelId } = setup()
    const one = script()
    tracks.create({ channelId, scriptId: one.id, format: 'largo' })
    expect(() => tracks.create({ channelId, scriptId: one.id, format: 'largo' })).toThrow()
  })

  it('keeps the audio, and forgets the file without losing its length', () => {
    const { tracks, track, clock } = setup()
    const made = track()
    clock.advance(1000)
    const withAudio = tracks.setAudio(made.id, { file: 'audio.wav', seconds: 612.5, sourceName: 'final.mp4' })
    expect(withAudio).toMatchObject({ audioFile: 'audio.wav', audioSeconds: 612.5, sourceName: 'final.mp4' })
    expect(withAudio.updatedAt).toBe(clock.now().toISOString())
    expect(tracks.forgetAudio(made.id)).toMatchObject({ audioFile: null, audioSeconds: 612.5, sourceName: 'final.mp4' })
  })

  it('saves the approved version with its time', () => {
    const { tracks, track, add, clock } = setup()
    const made = track()
    add(made.id)
    clock.advance(1000)
    expect(tracks.approve(made.id, 1)).toMatchObject({ approvedVersion: 1, approvedAt: clock.now().toISOString() })
  })

  it('keeps the replacements, validated on the way in and out', () => {
    const { db, tracks, track } = setup()
    const made = track()
    const list = [{ from: 'ola', to: 'hola' }]
    expect(tracks.setReplacements(made.id, list).replacements).toEqual(list)
    expect(() => tracks.setReplacements(made.id, [{ from: 'a', to: 'a' }])).toThrow()
    db.prepare(`UPDATE subtitle_track SET replacements = '[{"from":"","to":"x"}]'`).run()
    expect(() => tracks.get(made.id)).toThrow()
  })

  it('remembers the model of the last recognition', () => {
    const { tracks, track } = setup()
    expect(tracks.setSpeedModel(track().id, 'ggml-large-v3-turbo-q5_0.bin').speedModel).toBe(
      'ggml-large-v3-turbo-q5_0.bin',
    )
  })

  it('points at its job without moving «último cambio»', () => {
    const { tracks, track, jobs, channelId, clock } = setup()
    const made = track()
    const job = jobs.start({ journeyId: null, channelId, kind: 'reconocer_voz' })
    clock.advance(1000)
    tracks.setJob(made.id, job.id, 'reconocer')
    expect(tracks.get(made.id)).toMatchObject({ jobId: job.id, jobOp: 'reconocer', updatedAt: made.updatedAt })
    tracks.touch(made.id)
    expect(tracks.get(made.id)?.updatedAt).toBe(clock.now().toISOString())
  })
})

describe('subtitle versions repo (data-model.md)', () => {
  it('numbers the versions of a track from 1 and gives the last one', () => {
    const { versions, track, add } = setup()
    const a = track()
    const b = track()
    expect(versions.latest(a.id)).toBeNull()
    expect(versions.latestNumber(a.id)).toBeNull()
    expect(add(a.id).version).toBe(1)
    expect(add(a.id, 'Adiós').version).toBe(2)
    expect(add(b.id).version).toBe(1)
    expect(versions.latest(a.id)).toMatchObject({ version: 2, origin: 'reconocimiento', draftVersion: 1 })
    expect(versions.latest(a.id)?.content.cues[0]?.text).toBe('Adiós')
    expect(versions.latestNumber(a.id)).toBe(2)
  })

  it('never changes an earlier version', () => {
    const { versions, track, add } = setup()
    const made = track()
    add(made.id, 'Primera')
    add(made.id, 'Segunda')
    expect(versions.get(made.id, 1)?.content.cues[0]?.text).toBe('Primera')
    expect(versions.get(made.id, 3)).toBeNull()
  })

  it('keeps who made it: the AI with its prompt and usage, a restore with where it came from', () => {
    const { versions, track, add } = setup()
    const made = track()
    add(made.id)
    const restored = versions.add({
      trackId: made.id,
      origin: 'recuperada',
      content: content(),
      draftVersion: 1,
      restoredFrom: 1,
    })
    expect(restored).toMatchObject({ origin: 'recuperada', restoredFrom: 1, usageId: null, promptId: null })
    const ai = versions.add({
      trackId: made.id,
      origin: 'ia',
      content: content(),
      draftVersion: 1,
      promptId: 'revision_subtitulos',
      promptVersion: 1,
    })
    expect(ai).toMatchObject({ origin: 'ia', promptId: 'revision_subtitulos', promptVersion: 1, restoredFrom: null })
    expect(versions.summaries(made.id).map((s) => [s.version, s.origin, s.restoredFrom, s.cueCount])).toEqual([
      [3, 'ia', null, 1],
      [2, 'recuperada', 1, 1],
      [1, 'reconocimiento', null, 1],
    ])
  })

  it('validates the content on the way in, by the format of its track', () => {
    const { versions, track } = setup()
    const short = track('short')
    expect(() =>
      versions.add({ trackId: short.id, origin: 'edicion', content: content('Una\nDos'), draftVersion: 1 }),
    ).toThrow()
    expect(() =>
      versions.add({ trackId: short.id, origin: 'edicion', content: content('Una línea'), draftVersion: 1 }),
    ).not.toThrow()
    expect(() =>
      versions.add({ trackId: 'no-existe', origin: 'edicion', content: content(), draftVersion: 1 }),
    ).toThrow()
  })

  it('validates the content on the way out, and the list still works without it', () => {
    const { db, versions, track, add } = setup()
    const made = track()
    add(made.id)
    db.prepare(`UPDATE subtitle_version SET content = '{"cues":[],"words":[],"audioSeconds":-1}'`).run()
    expect(() => versions.latest(made.id)).toThrow()
    expect(versions.latestNumber(made.id)).toBe(1)
    expect(versions.summaries(made.id)).toMatchObject([{ version: 1, cueCount: 0 }])
    db.prepare(`UPDATE subtitle_version SET content = 'esto no es JSON'`).run()
    expect(versions.summaries(made.id)).toMatchObject([{ version: 1, cueCount: 0 }])
  })

  it('a version without a draft keeps it empty', () => {
    const { versions, track } = setup()
    const made = track()
    expect(versions.add({ trackId: made.id, origin: 'edicion', content: content() }).draftVersion).toBeNull()
  })
})
