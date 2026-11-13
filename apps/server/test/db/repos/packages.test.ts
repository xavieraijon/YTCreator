import { describe, expect, it } from 'vitest'
import { createIdeasRepo } from '../../../src/db/repos/ideas.ts'
import { createPackageVersionsRepo } from '../../../src/db/repos/package-versions.ts'
import { createPackagesRepo } from '../../../src/db/repos/packages.ts'
import { createScriptsRepo } from '../../../src/db/repos/scripts.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

const tags = (...values: string[]) => ({ tags: values })

function setup() {
  const db = freshDb()
  const clock = manualClock()
  const { channelId } = seedJourney(db)
  const ideas = createIdeasRepo(db, clock.now)
  const scripts = createScriptsRepo(db, clock.now)
  const packages = createPackagesRepo(db, clock.now)
  const versions = createPackageVersionsRepo(db, clock.now)
  const script = () => {
    const idea = ideas.create({ channelId, origin: 'creador', title: 'Idea', format: 'largo', profileVersion: 1 })
    return scripts.create({ channelId, ideaId: idea.id, format: 'largo', targetSeconds: 600 })
  }
  const pkg = (scriptId = script().id) => packages.create({ channelId, scriptId, format: 'largo' })
  const addTags = (packageId: string, ...values: string[]) =>
    versions.add({ packageId, kind: 'etiquetas', origin: 'edicion', content: tags(...values), draftVersion: 1 })
  return { db, clock, channelId, packages, versions, script, pkg, addTags }
}

describe('packages repo (data-model.md)', () => {
  it('creates a package and reads it by script', () => {
    const { packages, pkg, script } = setup()
    const made = pkg(script().id)
    expect(packages.get(made.id)).toMatchObject({
      format: 'largo',
      coverApproved: null,
      textsApproved: null,
      packageApproved: null,
      studioDone: [],
      jobId: null,
    })
    expect(packages.getByScript(made.scriptId)?.id).toBe(made.id)
  })

  it('a script has only one package', () => {
    const { pkg, script } = setup()
    const one = script()
    pkg(one.id)
    expect(() => pkg(one.id)).toThrow()
  })

  it('lists the channel with the last one touched first', () => {
    const { packages, pkg, clock, channelId } = setup()
    const a = pkg()
    clock.advance(1000)
    const b = pkg()
    clock.advance(1000)
    packages.touch(a.id)
    expect(packages.listByChannel(channelId).map((p) => p.id)).toEqual([a.id, b.id])
  })

  it('saves the approvals of each step and of the package', () => {
    const { packages, pkg } = setup()
    const made = pkg()
    packages.approveStep(made.id, 'portada', { titulos: 1, miniaturas: 2 })
    packages.approveStep(made.id, 'textos', { descripcion: 1 })
    const done = packages.approvePackage(made.id, { titulos: 1, miniaturas: 2, descripcion: 1 }, 2, 4)
    expect(done).toMatchObject({
      coverApproved: { titulos: 1, miniaturas: 2 },
      textsApproved: { descripcion: 1 },
      packageApproved: { titulos: 1, miniaturas: 2, descripcion: 1 },
      packageApprovedWarnings: 2,
      packageApprovedDraft: 4,
    })
    expect(done.packageApprovedAt).not.toBeNull()
  })

  it('saves the marks of the guided list and the job without moving the last change', () => {
    const { db, packages, pkg, clock, channelId } = setup()
    const made = pkg()
    db.prepare(
      `INSERT INTO background_job (id, channel_id, kind, status, progress, started_at)
       VALUES ('job', ?, 'ia', 'en_curso', 0, ?)`,
    ).run(channelId, '2026-11-13T10:00:00.000Z')
    clock.advance(1000)
    expect(packages.setStudioDone(made.id, ['idioma', 'categoria']).studioDone).toEqual(['idioma', 'categoria'])
    const before = packages.get(made.id)!.updatedAt
    clock.advance(1000)
    packages.setJob(made.id, 'job', 'titulos')
    expect(packages.get(made.id)).toMatchObject({ jobId: 'job', jobOp: 'titulos', updatedAt: before })
  })

  it('saves and reads the publishing settings of the channel', () => {
    const { packages, channelId } = setup()
    expect(packages.settings(channelId)).toBeNull()
    packages.saveSettings(channelId, { fixedText: 'Suscríbete', category: 'Educación' })
    expect(packages.settings(channelId)).toEqual({ fixedText: 'Suscríbete', category: 'Educación' })
    packages.saveSettings(channelId, { fixedText: '', category: null })
    expect(packages.settings(channelId)).toEqual({ fixedText: '', category: null })
  })
})

describe('package versions repo (research.md R1)', () => {
  it('numbers each kind on its own', () => {
    const { versions, pkg, addTags } = setup()
    const { id } = pkg()
    expect(addTags(id, 'a').version).toBe(1)
    expect(addTags(id, 'b').version).toBe(2)
    const comment = versions.add({
      packageId: id,
      kind: 'comentario',
      origin: 'ia',
      content: { text: '¿Y tú?' },
      draftVersion: 3,
      mainTitle: 'El pan',
      instructions: 'más corto',
      promptId: 'descripcion',
      promptVersion: 1,
    })
    expect(comment).toMatchObject({ version: 1, draftVersion: 3, mainTitle: 'El pan', instructions: 'más corto' })
    expect(versions.latest(id, 'etiquetas')?.content).toEqual(tags('b'))
    expect(versions.latestNumbers(id)).toEqual({ etiquetas: 2, comentario: 1 })
  })

  it('validates the content on the way in', () => {
    const { pkg, versions } = setup()
    const { id } = pkg()
    expect(() =>
      versions.add({ packageId: id, kind: 'etiquetas', origin: 'ia', content: { tags: [''] }, draftVersion: 1 }),
    ).toThrow()
  })

  it('validates the content on the way out', () => {
    const { db, pkg, versions, addTags } = setup()
    const { id } = pkg()
    addTags(id, 'a')
    db.prepare(`UPDATE package_version SET content = '{"tags":[""]}'`).run()
    expect(() => versions.latest(id, 'etiquetas')).toThrow()
    // The number and the list of the history do not need the content.
    expect(versions.latestNumbers(id)).toEqual({ etiquetas: 1 })
    expect(versions.summaries(id, 'etiquetas')).toHaveLength(1)
  })

  it('lists the history, newest first, and reads any version', () => {
    const { pkg, versions, addTags, clock } = setup()
    const { id } = pkg()
    addTags(id, 'a')
    clock.advance(1000)
    addTags(id, 'b')
    expect(versions.summaries(id, 'etiquetas').map((s) => s.version)).toEqual([2, 1])
    expect(versions.get(id, 'etiquetas', 1)?.content).toEqual(tags('a'))
    expect(versions.get(id, 'etiquetas', 9)).toBeNull()
  })

  it('a version cannot be changed: there is no way to', () => {
    const { versions } = setup()
    expect(Object.keys(versions).filter((name) => /update|set|edit/i.test(name))).toEqual([])
  })
})
