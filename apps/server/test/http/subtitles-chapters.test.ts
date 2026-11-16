import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, openPackage, type TestApp } from './publish-flows.ts'

// The real minutes of the chapters (US3, research.md R13, contracts/http-api.md).
const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code

interface Chapter {
  id: string
  title: string
  blockIds: string[]
  startSeconds: number | null
  manual: boolean
  fromAudio?: true
}
interface Timed {
  id: string
  startSeconds: number
  manual: boolean
  fromAudio: boolean
  time: string
}
type View = Record<string, unknown> & {
  status: string
  pieces: Record<string, { version: number; content: Record<string, unknown> } | null>
  texts: { chapters: Timed[]; assembled: string | null }
}
interface Proposed {
  chapterId: string
  title: string
  estimated: number
  real: number | null
  status: 'encontrado' | 'no_encontrado'
  manual: boolean
  fromAudio: boolean
}

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View
const chaptersOf = (view: View) => view.pieces['capitulos']!.content['chapters'] as Chapter[]
const proposalOf = async (t: TestApp, scriptId: string) =>
  (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/chapters`)).body as unknown as Proposed[]

async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use })
  await call(t, 'POST', `/api/packages/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  await vi.waitFor(async () =>
    expect((await read(t, id))['job'] as { status: string } | null).not.toMatchObject({ status: 'en_curso' }),
  )
  return read(t, id)
}

const versionOf = (view: View, kind: string) => view.pieces[kind]!.version

/** Titles and thumbnails chosen and approved: what the texts are asked for after (006). */
async function approveCover(t: TestApp, id: string) {
  let view = await ask(t, id, 'titulos')
  const candidates = view.pieces['titulos']!.content['candidates'] as { id: string }[]
  view = (
    await call(t, 'PUT', `/api/packages/${id}/pieces/titulos`, {
      baseVersion: versionOf(view, 'titulos'),
      content: { ...view.pieces['titulos']!.content, main: candidates[0]!.id },
    })
  ).body as View
  view = await ask(t, id, 'miniaturas')
  const concepts = view.pieces['miniaturas']!.content['concepts'] as { id: string }[]
  view = (
    await call(t, 'PUT', `/api/packages/${id}/pieces/miniaturas`, {
      baseVersion: versionOf(view, 'miniaturas'),
      content: { ...view.pieces['miniaturas']!.content, chosen: [concepts[0]!.id] },
    })
  ).body as View
  const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
    step: 'portada',
    versions: { titulos: versionOf(view, 'titulos'), miniaturas: versionOf(view, 'miniaturas') },
  })
  expect(approved.status).toBe(200)
}

/**
 * A long video with its package and its subtitles: each block heard where the script estimated it, but `late` seconds
 * later from the chapter `lateFrom` on (the edit added a pause there); the first block of the chapter `cutChapter` is not in the audio.
 */
async function withPackage({ late = 40, lateFrom = 2, cutChapter = -1, subtitles = true } = {}) {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { scriptId, channelId, draft } = await approvedScript(t)
  const id = (await openPackage(t, scriptId)).body['id'] as string
  await approveCover(t, id)
  const view = await ask(t, id, 'descripcion')
  const chapters = chaptersOf(view)
  expect(chapters.length).toBeGreaterThan(2)
  const cut = cutChapter >= 0 ? [chapters[cutChapter]!.blockIds[0]!] : []
  const lateBlocks = new Set(chapters.slice(lateFrom).flatMap((chapter) => chapter.blockIds))
  const words: { text: string; start: number; end: number; p: number }[] = []
  let clock = 0
  let paused = false
  for (const block of draft.content.blocks) {
    if (lateBlocks.has(block.id) && !paused) {
      clock += late
      paused = true
    }
    const spoken = block.text.split(/\s+/).filter(Boolean)
    if (cut.includes(block.id)) continue
    for (const word of spoken) {
      words.push({ text: word, start: clock, end: clock + 0.35, p: 0.9 })
      clock += 0.4
    }
  }
  if (subtitles) {
    const track = t.subtitleTracks.create({ channelId, scriptId, format: 'largo' })
    t.subtitleTracks.setAudio(track.id, { file: 'audio.wav', seconds: clock + 5, sourceName: 'final.mp4' })
    t.subtitleVersions.add({
      trackId: track.id,
      origin: 'reconocimiento',
      draftVersion: draft.version,
      content: { cues: [], words, audioSeconds: clock + 5 } as never,
    })
  }
  const startOf = (blockId: string) => words.find((word) => word === wordsOfBlock(blockId))?.start
  const wordsOfBlock = (blockId: string) => {
    let index = 0
    for (const block of draft.content.blocks) {
      if (cut.includes(block.id)) continue
      if (block.id === blockId) return words[index]
      index += block.text.split(/\s+/).filter(Boolean).length
    }
    return undefined
  }
  return { t, id, scriptId, view, chapters, startOf }
}

describe('GET /scripts/:id/subtitles/chapters', () => {
  it('each chapter with its estimated minute and the real one, within 2 s of where its first block is heard', async () => {
    const { t, scriptId, chapters, view, startOf } = await withPackage()
    const proposal = await proposalOf(t, scriptId)
    expect(proposal.map((one) => one.chapterId)).toEqual(chapters.map((chapter) => chapter.id))
    expect(proposal[0]).toMatchObject({ estimated: 0, real: 0, status: 'encontrado', manual: false, fromAudio: false })
    proposal.slice(1).forEach((one, index) => {
      const chapter = chapters[index + 1]!
      expect(one.estimated).toBe(view.texts.chapters[index + 1]!.startSeconds)
      expect(one.status).toBe('encontrado')
      expect(Math.abs(one.real! - startOf(chapter.blockIds[0]!)!)).toBeLessThanOrEqual(2)
    })
    // From the third chapter on, the video is 40 s longer than the script said.
    expect(proposal[2]!.real! - proposal[2]!.estimated).toBeGreaterThanOrEqual(35)
  })

  it('a chapter whose first block was cut in the edit is «no_encontrado», without a minute', async () => {
    const { t, scriptId } = await withPackage({ cutChapter: 1 })
    expect((await proposalOf(t, scriptId))[1]).toMatchObject({ real: null, status: 'no_encontrado' })
  })

  it('404 without a package, or without subtitles', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const none = await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/chapters`)
    expect(none.status).toBe(404)
    const { t: other, scriptId: withoutSubtitles } = await withPackage({ subtitles: false })
    expect((await call(other, 'GET', `/api/scripts/${withoutSubtitles}/subtitles/chapters`)).status).toBe(404)
  })
})

describe('POST /packages/:id/chapters/from-audio', () => {
  const accept = (t: TestApp, id: string, body: object) =>
    call(t, 'POST', `/api/packages/${id}/chapters/from-audio`, body)

  it('makes a version `edicion` of the chapters: the accepted ones with their real minute, the rest as they were', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const proposal = await proposalOf(t, scriptId)
    const third = proposal[2]!
    const saved = await accept(t, id, {
      baseVersion: view.pieces['capitulos']!.version,
      accept: [{ chapterId: third.chapterId, seconds: third.real }],
    })
    expect(saved.status).toBe(200)
    const after = saved.body as View
    expect(after.pieces['capitulos']!.version).toBe(view.pieces['capitulos']!.version + 1)
    const versions = (await call(t, 'GET', `/api/packages/${id}/versions?kind=capitulos`)).body as unknown as {
      origin: string
    }[]
    expect(versions[0]).toMatchObject({ origin: 'edicion' })
    const chapters = chaptersOf(after)
    expect(chapters[2]).toMatchObject({ startSeconds: third.real, manual: false, fromAudio: true })
    expect(chapters[1]).toEqual(chaptersOf(view)[1])
    expect(after.texts.chapters[2]).toMatchObject({ startSeconds: third.real, fromAudio: true })
    // The description as it is copied carries the real minute.
    const minutes = Math.floor(third.real! / 60)
    const seconds = String(third.real! % 60).padStart(2, '0')
    expect(after.texts.assembled).toContain(`${minutes}:${seconds}`)
    // Asked again, it says the chapter has its real minute now.
    expect((await proposalOf(t, scriptId))[2]).toMatchObject({ estimated: third.real, fromAudio: true })
  })

  it('another edit heard later proposes the chapters again, also one with its real minute already (US5)', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const third = (await proposalOf(t, scriptId))[2]!
    await accept(t, id, {
      baseVersion: view.pieces['capitulos']!.version,
      accept: [{ chapterId: third.chapterId, seconds: third.real }],
    })
    // The new edit: the same words, 10 s later from the third chapter on.
    const track = t.subtitleTracks.getByScript(scriptId)!
    const heard = t.subtitleVersions.latest(track.id)!
    const moved = heard.content.words.map((word) =>
      word.start >= third.real! ? { ...word, start: word.start + 10, end: word.end + 10 } : word,
    )
    t.subtitleVersions.add({
      trackId: track.id,
      origin: 'reconocimiento',
      draftVersion: heard.draftVersion,
      content: { ...heard.content, words: moved, audioSeconds: heard.content.audioSeconds + 10 },
    })
    const again = (await proposalOf(t, scriptId))[2]!
    expect(again).toMatchObject({ estimated: third.real, fromAudio: true, status: 'encontrado' })
    expect(Math.abs(again.real! - (third.real! + 10))).toBeLessThanOrEqual(1)
  })

  it('a minute other than the real one is written by the creator (`manual`)', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const third = (await proposalOf(t, scriptId))[2]!
    const saved = await accept(t, id, {
      baseVersion: view.pieces['capitulos']!.version,
      accept: [{ chapterId: third.chapterId, seconds: third.real! + 3 }],
    })
    expect(chaptersOf(saved.body as View)[2]).toEqual(expect.not.objectContaining({ fromAudio: true }))
    expect(chaptersOf(saved.body as View)[2]).toMatchObject({ startSeconds: third.real! + 3, manual: true })
  })

  it('a chapter written by hand stays as it was unless it is accepted', async () => {
    const { t, id, view } = await withPackage()
    const chapters = chaptersOf(view)
    const handMinute = view.texts.chapters[1]!.startSeconds + 1
    const edited = chapters.map((chapter, index) =>
      index === 1 ? { ...chapter, startSeconds: handMinute, manual: true } : chapter,
    )
    const saved = await call(t, 'PUT', `/api/packages/${id}/pieces/capitulos`, {
      baseVersion: view.pieces['capitulos']!.version,
      content: { chapters: edited },
    })
    expect(saved.status).toBe(200)
    const before = saved.body as View
    const scriptId = (before['scriptId'] ?? (before['script'] as { id?: string } | undefined)?.id) as string | undefined
    const proposal = (await call(t, 'GET', `/api/scripts/${scriptId ?? ''}/subtitles/chapters`))
      .body as unknown as Proposed[]
    expect(proposal[1]).toMatchObject({ manual: true, estimated: handMinute })
    const third = proposal[2]!
    const after = (
      await accept(t, id, {
        baseVersion: before.pieces['capitulos']!.version,
        accept: [{ chapterId: third.chapterId, seconds: third.real }],
      })
    ).body as View
    expect(chaptersOf(after)[1]).toMatchObject({ startSeconds: handMinute, manual: true })
  })

  it('an approved step goes back to draft', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const texts = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'textos',
      versions: Object.fromEntries(
        ['descripcion', 'capitulos', 'etiquetas', 'comentario'].map((kind) => [kind, versionOf(view, kind)]),
      ),
    })
    expect(texts.status).toBe(200)
    expect((texts.body as View).status).toBe('textos_aprobados')
    const third = (await proposalOf(t, scriptId))[2]!
    const after = await accept(t, id, {
      baseVersion: versionOf(view, 'capitulos'),
      accept: [{ chapterId: third.chapterId, seconds: third.real }],
    })
    expect(after.status).toBe(200)
    expect((after.body as View).status).toBe('textos_borrador')
  })

  it('from an old version of the chapters: 409 `version_cambiada`, and nothing changes', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const third = (await proposalOf(t, scriptId))[2]!
    const stale = await accept(t, id, {
      baseVersion: view.pieces['capitulos']!.version - 1,
      accept: [{ chapterId: third.chapterId, seconds: third.real }],
    })
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')
    expect((await read(t, id)).pieces['capitulos']!.version).toBe(view.pieces['capitulos']!.version)
  })

  it('refuses an unknown chapter, a first one not at 0:00 and an order YouTube would not take', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const proposal = await proposalOf(t, scriptId)
    const baseVersion = view.pieces['capitulos']!.version
    const unknown = await accept(t, id, { baseVersion, accept: [{ chapterId: 'nada', seconds: 10 }] })
    expect(unknown.status).toBe(400)
    const first = await accept(t, id, { baseVersion, accept: [{ chapterId: proposal[0]!.chapterId, seconds: 5 }] })
    expect(first.status).toBe(400)
    const order = await accept(t, id, {
      baseVersion,
      accept: [
        { chapterId: proposal[1]!.chapterId, seconds: proposal[2]!.real! + 30 },
        { chapterId: proposal[2]!.chapterId, seconds: proposal[2]!.real! },
      ],
    })
    expect(order.status).toBe(400)
    expect(code(order.body)).toBe('validacion')
    expect((await read(t, id)).pieces['capitulos']!.version).toBe(baseVersion)
  })

  it('a chapter left too short by a real minute is saved, the review warns of it and 006 can still edit them', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const proposal = await proposalOf(t, scriptId)
    const real = proposal[2]!.real!
    const saved = await accept(t, id, {
      baseVersion: versionOf(view, 'capitulos'),
      accept: [
        // Written by hand 3 s before the real minute of the next one.
        { chapterId: proposal[1]!.chapterId, seconds: real - 3 },
        { chapterId: proposal[2]!.chapterId, seconds: real },
      ],
    })
    expect(saved.status).toBe(200)
    const after = saved.body as View
    const timed = after.texts.chapters
    expect(timed[2]!.startSeconds - timed[1]!.startSeconds).toBe(3)
    // The review of 006, worked out as its screen does, warns of it like of any other chapter (AS5).
    const { reviewPackage } = await import('@ytcreator/core')
    const rules = (await call(t, 'GET', `/api/packages/${id}/review`)).body['rules'] as Parameters<
      typeof reviewPackage
    >[1]
    const notices = reviewPackage(
      {
        format: 'largo',
        pieces: { capitulos: { chapters: chaptersOf(after) } } as never,
        chapters: timed,
        scriptSeconds: timed.at(-1)!.startSeconds + 60,
        assembled: after.texts.assembled,
      },
      rules,
    )
    expect(notices).toContainEqual(expect.objectContaining({ rule: 'capitulo_corto', chapterId: timed[1]!.id }))
    // Editing the chapters in 006 afterwards still works: next to a real minute only the order counts.
    const renamed = chaptersOf(after).map((chapter, index) =>
      index === 0 ? { ...chapter, title: 'Al empezar' } : chapter,
    )
    const edited = await call(t, 'PUT', `/api/packages/${id}/pieces/capitulos`, {
      baseVersion: versionOf(after, 'capitulos'),
      content: { chapters: renamed },
    })
    expect(edited.status).toBe(200)
    expect(chaptersOf(edited.body as View)[2]).toMatchObject({ fromAudio: true, startSeconds: real })
  })

  it('a minute written by hand keeps the minimum of 006', async () => {
    const { t, id, scriptId, view } = await withPackage()
    const proposal = await proposalOf(t, scriptId)
    const close = await accept(t, id, {
      baseVersion: versionOf(view, 'capitulos'),
      accept: [{ chapterId: proposal[2]!.chapterId, seconds: proposal[1]!.estimated + 3 }],
    })
    expect(close.status).toBe(400)
    expect(code(close.body)).toBe('validacion')
  })

  it('removes a chapter not in the audio: its blocks join the chapter before (AS3)', async () => {
    const { t, id, scriptId, view } = await withPackage({ cutChapter: 1 })
    const proposal = await proposalOf(t, scriptId)
    expect(proposal[1]).toMatchObject({ status: 'no_encontrado' })
    const before = chaptersOf(view)
    const saved = await accept(t, id, {
      baseVersion: versionOf(view, 'capitulos'),
      accept: [],
      remove: [proposal[1]!.chapterId],
    })
    expect(saved.status).toBe(200)
    const after = chaptersOf(saved.body as View)
    expect(after).toHaveLength(before.length - 1)
    expect(after[0]!.blockIds).toEqual([...before[0]!.blockIds, ...before[1]!.blockIds])
    // The first one is never removed, nor one given a minute at once.
    const first = await accept(t, id, {
      baseVersion: versionOf(saved.body as View, 'capitulos'),
      accept: [],
      remove: [after[0]!.id],
    })
    expect(first.status).toBe(400)
  })

  it('refuses a minute past the end of the audio', async () => {
    const { t, id, scriptId, view } = await withPackage({ cutChapter: 1 })
    const proposal = await proposalOf(t, scriptId)
    const late = await accept(t, id, {
      baseVersion: versionOf(view, 'capitulos'),
      accept: [{ chapterId: proposal[1]!.chapterId, seconds: 36_000 }],
    })
    expect(late.status).toBe(400)
  })

  it('006 never takes a real minute that did not come from the subtitles', async () => {
    const { t, id, view } = await withPackage()
    const forged = chaptersOf(view).map((chapter, index) =>
      index === 2 ? { ...chapter, startSeconds: 123, manual: false, fromAudio: true } : chapter,
    )
    const saved = await call(t, 'PUT', `/api/packages/${id}/pieces/capitulos`, {
      baseVersion: versionOf(view, 'capitulos'),
      content: { chapters: forged },
    })
    expect(saved.status).toBe(400)
  })
})
