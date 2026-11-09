import { describe, expect, it } from 'vitest'
import { createIdeasRepo } from '../../../src/db/repos/ideas.ts'
import { MarksUpdateError, createScriptVersionsRepo } from '../../../src/db/repos/script-versions.ts'
import { createScriptsRepo } from '../../../src/db/repos/scripts.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

const block = (id: string, text: string) => ({ id, type: 'acto' as const, title: 'Uno', text, visual: '' })
const draft = (text: string, status: 'pendiente' | 'confirmada' = 'pendiente') => ({
  blocks: [block('b1', text)],
  claims: [
    { id: 'c1', blockId: 'b1', text: 'dato', status, reason: 'sin_respaldo' as const, factId: null, check: null },
  ],
})

function setup() {
  const db = freshDb()
  const clock = manualClock()
  const { channelId } = seedJourney(db)
  const ideas = createIdeasRepo(db, clock.now)
  const scripts = createScriptsRepo(db, clock.now)
  const versions = createScriptVersionsRepo(db, clock.now)
  const idea = (title = 'Idea') =>
    ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1 })
  const script = (ideaId = idea().id) => scripts.create({ channelId, ideaId, format: 'largo', targetSeconds: 600 })
  const addDraft = (scriptId: string, origin: 'edicion' | 'marcas', text = 'dato') =>
    versions.add({ scriptId, kind: 'guion', origin, content: draft(text), ideaRevision: 1, profileVersion: 1 })
  return { db, clock, channelId, scripts, versions, idea, script, addDraft }
}

describe('scripts repo (data-model.md)', () => {
  it('creates a script and reads it by idea', () => {
    const { scripts, script, idea } = setup()
    const made = script(idea('Una').id)
    expect(scripts.get(made.id)).toMatchObject({ format: 'largo', targetSeconds: 600, notes: '', jobId: null })
    expect(scripts.getByIdea(made.ideaId)?.id).toBe(made.id)
  })

  it('an idea has only one script', () => {
    const { script, idea } = setup()
    const one = idea()
    script(one.id)
    expect(() => script(one.id)).toThrow()
  })

  it('lists the channel with the last one touched first', () => {
    const { scripts, script, clock, channelId } = setup()
    const a = script()
    clock.advance(1000)
    const b = script()
    clock.advance(1000)
    scripts.touch(a.id)
    expect(scripts.listByChannel(channelId).map((s) => s.id)).toEqual([a.id, b.id])
  })

  it('saves and reads the voice of the channel', () => {
    const { scripts, channelId } = setup()
    expect(scripts.settings(channelId)).toBeNull()
    const voice = { address: 'usted', register: 'sobrio', sample: 'Hola', wordsPerMinute: 130 } as const
    scripts.saveSettings(channelId, voice)
    expect(scripts.settings(channelId)).toEqual(voice)
  })
})

describe('script versions repo (R1, R10)', () => {
  it('numbers the versions per kind and gives the latest', () => {
    const { versions, script, addDraft } = setup()
    const { id } = script()
    addDraft(id, 'edicion')
    addDraft(id, 'edicion', 'otro')
    versions.add({ scriptId: id, kind: 'hechos', origin: 'edicion', content: { facts: [] }, ideaRevision: 1, profileVersion: 1 })
    expect(versions.latest(id, 'guion')?.version).toBe(2)
    expect(versions.latest(id, 'hechos')?.version).toBe(1)
    expect(versions.list(id, 'guion').map((v) => v.version)).toEqual([2, 1])
    expect(versions.get(id, 'guion', 1)?.content.blocks[0]?.text).toBe('dato')
  })

  it('does not save or read a content outside its schema', () => {
    const { db, versions, script, addDraft } = setup()
    const { id } = script()
    expect(() =>
      versions.add({
        scriptId: id,
        kind: 'guion',
        origin: 'edicion',
        content: { blocks: 'no' } as never,
        ideaRevision: 1,
        profileVersion: 1,
      }),
    ).toThrow()
    addDraft(id, 'edicion')
    db.prepare(`UPDATE script_version SET content = '{"blocks":1}'`).run()
    expect(() => versions.latest(id, 'guion')).toThrow()
  })

  it('updates only the latest marks version, keeping the number', () => {
    const { versions, script, addDraft } = setup()
    const { id } = script()
    addDraft(id, 'marcas')
    const changed = versions.updateMarks(id, draft('dato', 'confirmada'))
    expect(changed.version).toBe(1)
    expect(changed.content.claims[0]?.status).toBe('confirmada')
    expect(versions.list(id, 'guion')).toHaveLength(1)
  })

  it('refuses a change of text, another origin, an older version and an approved one', () => {
    const { scripts, versions, script, addDraft } = setup()
    const { id } = script()
    addDraft(id, 'marcas')
    expect(() => versions.updateMarks(id, draft('otro texto'))).toThrow(MarksUpdateError)
    const original = draft('dato')
    const retitled = { ...original, blocks: [{ ...original.blocks[0]!, title: 'Otro' }] }
    expect(() => versions.updateMarks(id, retitled)).toThrow(MarksUpdateError)
    expect(() => versions.updateMarks(id, { ...original, claims: [] })).toThrow(MarksUpdateError)
    const reworded = { ...original, claims: [{ ...original.claims[0]!, text: 'otro dato' }] }
    expect(() => versions.updateMarks(id, reworded)).toThrow(MarksUpdateError)
    addDraft(id, 'edicion')
    expect(() => versions.updateMarks(id, draft('dato'))).toThrow(MarksUpdateError)
    const approved = script()
    addDraft(approved.id, 'marcas')
    scripts.approveDraft(approved.id, 1, 0)
    expect(() => versions.updateMarks(approved.id, draft('dato'))).toThrow(MarksUpdateError)
  })
})
