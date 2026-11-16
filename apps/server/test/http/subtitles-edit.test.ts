import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, type TestApp } from './publish-flows.ts'

// What the creator changes in the subtitles, the history and the AI's review (US2, contracts/http-api.md).
const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const base = (scriptId: string) => `/api/scripts/${scriptId}/subtitles`
const read = async (t: TestApp, scriptId: string) => (await call(t, 'GET', base(scriptId))).body

interface Cue {
  id: string
  start: number
  end: number
  text: string
  flags: string[]
  heard: string | null
  reviewed: boolean
}
const cue = (id: string, start: number, text: string, extra: Partial<Cue> = {}): Cue => ({
  id,
  start,
  end: start + 2,
  text,
  flags: [],
  heard: null,
  reviewed: false,
  ...extra,
})

const CUES: Cue[] = [
  cue('c1', 0, 'hoy hacemos pan sin amasar'),
  cue('c2', 2.5, 'con harina agua y sal', { flags: ['del_guion'], heard: 'con arina agua y sal' }),
  cue('c3', 5, 'el pan sale bien'),
]

// An approved script and its subtitles as a recognition left them (version 1).
async function withSubtitles(fakeAi = 'ok', cues: Cue[] = CUES) {
  const t = makeTestApp({ fakeAi })
  const { scriptId, channelId, draft } = await approvedScript(t)
  const track = t.subtitleTracks.create({ channelId, scriptId, format: 'largo' })
  t.subtitleTracks.setAudio(track.id, { file: 'audio.wav', seconds: 2000, sourceName: 'final.mp4' })
  t.subtitleVersions.add({
    trackId: track.id,
    origin: 'reconocimiento',
    draftVersion: draft.version,
    content: { cues, words: [{ text: 'hoy', start: 0, end: 0.4, p: 0.9 }], audioSeconds: 2000 } as never,
  })
  return { t, scriptId, trackId: track.id, draft }
}

const latestCues = (view: Record<string, unknown>) => (view['latest'] as { content: { cues: Cue[] } }).content.cues

describe('saving what the creator wrote (FR-008, FR-010)', () => {
  it('makes a version `edicion` with the words and the audio as they were', async () => {
    const { t, scriptId } = await withSubtitles()
    const cues = [{ ...CUES[0]!, text: 'Hoy hacemos pan sin amasar.', reviewed: true }, ...CUES.slice(1)]
    const saved = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues } })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ status: 'borrador', latest: { version: 2, origin: 'edicion' } })
    const latest = saved.body['latest'] as { content: { words: unknown[]; audioSeconds: number; cues: Cue[] } }
    expect(latest.content.cues[0]!.text).toBe('Hoy hacemos pan sin amasar.')
    expect(latest.content).toMatchObject({ audioSeconds: 2000, words: [{ text: 'hoy' }] })
  })

  it('an overlap or a cue past the limits is saved, with its mark worked out', async () => {
    const { t, scriptId } = await withSubtitles()
    const cues = [CUES[0]!, { ...CUES[1]!, start: 1, end: 1.3 }, CUES[2]!]
    const saved = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues } })
    expect(saved.status).toBe(200)
    expect((saved.body['marks'] as Record<string, string[]>)['c2']).toEqual(
      expect.arrayContaining(['fuera_de_limites', 'solapado']),
    )
  })

  it('saving the same subtitles makes no version: approved ones stay approved', async () => {
    const { t, scriptId } = await withSubtitles()
    await call(t, 'POST', `${base(scriptId)}/approve`, { version: 1 })
    const same = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES } })
    expect(same.body).toMatchObject({ status: 'aprobados', latest: { version: 1 } })
  })

  it('from an old version: 409 `version_cambiada`, and nothing changes', async () => {
    const { t, scriptId } = await withSubtitles()
    await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    const stale = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES } })
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')
    expect((await read(t, scriptId))['latest']).toMatchObject({ version: 2 })
  })

  it('what does not fit the subtitles is a 400, never a 500', async () => {
    const { t, scriptId } = await withSubtitles()
    for (const content of [
      null,
      { cues: 'no' },
      { cues: [{ ...CUES[0]!, text: '   ' }] },
      { cues: [{ ...CUES[0]!, end: 3000 }] },
      { cues: [CUES[1]!, CUES[0]!] },
    ]) {
      const sent = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content })
      expect(sent.status, JSON.stringify(content)).toBe(400)
    }
    expect((await read(t, scriptId))['latest']).toMatchObject({ version: 1 })
  })

  it('subtitles that are not started yet: there is nothing to save over', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const sent = await call(t, 'PUT', base(scriptId), { baseVersion: 0, content: { cues: CUES } })
    expect(sent.status).toBe(409)
  })
})

describe('«Cambiar en todos» (FR-009)', () => {
  it('says how many first, then changes them and keeps the correction', async () => {
    const { t, scriptId } = await withSubtitles()
    const dry = await call(t, 'POST', `${base(scriptId)}/replace`, {
      baseVersion: 1,
      from: 'pan',
      to: 'bollo',
      dryRun: true,
    })
    expect(dry.body).toEqual({ count: 2 })
    expect((await read(t, scriptId))['latest']).toMatchObject({ version: 1 })

    const done = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 1, from: 'pan', to: 'bollo' })
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({
      latest: { version: 2, origin: 'edicion' },
      replacements: [{ from: 'pan', to: 'bollo' }],
    })
    expect(latestCues(done.body).map((one) => one.text)).toEqual([
      'hoy hacemos bollo sin amasar',
      'con harina agua y sal',
      'el bollo sale bien',
    ])
    // The same word again replaces its correction.
    const again = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 2, from: 'bollo', to: 'pan' })
    const twice = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 3, from: 'pan', to: 'hogaza' })
    expect(again.status).toBe(200)
    expect(twice.body['replacements']).toEqual([
      { from: 'bollo', to: 'pan' },
      { from: 'pan', to: 'hogaza' },
    ])
  })

  it('with the list of corrections full, nothing is changed', async () => {
    const { t, scriptId, trackId } = await withSubtitles()
    t.subtitleTracks.setReplacements(
      trackId,
      Array.from({ length: 200 }, (_, i) => ({ from: `p${i}`, to: `q${i}` })),
    )
    const full = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 1, from: 'pan', to: 'bollo' })
    expect(full.status).toBe(400)
    expect((await read(t, scriptId))['latest']).toMatchObject({ version: 1 })
  })

  it('a word that is in none of them, or the same text twice, is a 400', async () => {
    const { t, scriptId } = await withSubtitles()
    const none = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 1, from: 'queso', to: 'pan' })
    expect(none.status).toBe(400)
    const same = await call(t, 'POST', `${base(scriptId)}/replace`, { baseVersion: 1, from: 'pan', to: 'pan' })
    expect(same.status).toBe(400)
    expect((await read(t, scriptId))['replacements']).toEqual([])
  })
})

describe('the history, «Volver a esta» and approving (FR-011, FR-012)', () => {
  it('restoring makes a version `recuperada`, and none is lost', async () => {
    const { t, scriptId } = await withSubtitles()
    await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    const restored = await call(t, 'POST', `${base(scriptId)}/restore`, { baseVersion: 2, version: 1 })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ latest: { version: 3, origin: 'recuperada', restoredFrom: 1 } })
    expect(latestCues(restored.body)).toEqual(CUES)

    const list = await call(t, 'GET', `${base(scriptId)}/versions`)
    expect(list.body).toMatchObject([
      { version: 3, origin: 'recuperada', restoredFrom: 1, cueCount: 3 },
      { version: 2, origin: 'edicion', cueCount: 2 },
      { version: 1, origin: 'reconocimiento', cueCount: 3 },
    ])
    const one = await call(t, 'GET', `${base(scriptId)}/versions/2`)
    expect(one.body).toMatchObject({ version: 2, origin: 'edicion', content: { cues: CUES.slice(1) } })
    expect((await call(t, 'GET', `${base(scriptId)}/versions/9`)).status).toBe(404)
    expect((await call(t, 'GET', `${base(scriptId)}/versions/x`)).status).toBe(404)
    expect((await call(t, 'POST', `${base(scriptId)}/restore`, { baseVersion: 3, version: 9 })).status).toBe(404)
  })

  it('approving the last one; any change after it makes them a draft again', async () => {
    const { t, scriptId } = await withSubtitles()
    const approved = await call(t, 'POST', `${base(scriptId)}/approve`, { version: 1 })
    expect(approved.body).toMatchObject({ status: 'aprobados', approvedVersion: 1 })
    expect(approved.body['approvedAt']).toEqual(expect.any(String))

    const edited = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    expect(edited.body).toMatchObject({ status: 'borrador', approvedVersion: 1 })
    await call(t, 'POST', `${base(scriptId)}/approve`, { version: 2 })
    const restored = await call(t, 'POST', `${base(scriptId)}/restore`, { baseVersion: 2, version: 1 })
    expect(restored.body).toMatchObject({ status: 'borrador', approvedVersion: 2 })
  })

  it('approving one that is not the last: 409 `version_cambiada`', async () => {
    const { t, scriptId } = await withSubtitles()
    await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    const old = await call(t, 'POST', `${base(scriptId)}/approve`, { version: 1 })
    expect(old.status).toBe(409)
    expect(code(old.body)).toBe('version_cambiada')
  })
})

async function review(t: TestApp, scriptId: string, baseVersion = 1) {
  const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `${base(scriptId)}/generate`, {
    use: 'revision_subtitulos',
    estimateId: estimate.body['estimateId'],
    baseVersion,
  })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => {
    const job = (await read(t, scriptId))['job'] as { status: string } | null
    expect(job?.status).not.toBe('en_curso')
  })
  return { estimate: estimate.body, view: await read(t, scriptId) }
}

describe('the review of the AI (R11)', () => {
  it('ends in a proposal, never a version, and the subtitles stay as they were', async () => {
    const { t, scriptId } = await withSubtitles()
    const { estimate, view } = await review(t, scriptId)
    expect(estimate).toMatchObject({ use: 'revision_subtitulos', blockedBy: null })
    expect(view).toMatchObject({
      latest: { version: 1 },
      job: { op: 'revision_ia', status: 'hecho' },
      // Only the recognition makes them «en marcha».
      status: 'borrador',
    })
    expect(view['aiProposal']).toEqual([
      { cueId: 'c1', text: 'hoy hacemos pan sin amasar.', reason: 'falta el punto final' },
      { cueId: 'c2', text: 'con harina agua y sal.', reason: 'falta el punto final' },
      { cueId: 'c3', text: 'El pan sale bien', reason: 'mayúscula' },
    ])
    expect(latestCues(view)).toEqual(CUES)
  })

  it('accepting some makes a version `ia` with the times as they were and the mark `cambio_ia`', async () => {
    const { t, scriptId } = await withSubtitles()
    await review(t, scriptId)
    const decided = await call(t, 'POST', `${base(scriptId)}/ai-proposal`, { baseVersion: 1, accept: ['c2', 'c3'] })
    expect(decided.status).toBe(200)
    expect(decided.body).toMatchObject({ latest: { version: 2, origin: 'ia' }, aiProposal: null })
    const [first, second, third] = latestCues(decided.body)
    expect(first).toEqual(CUES[0])
    expect(second).toEqual({
      ...CUES[1],
      text: 'con harina agua y sal.',
      flags: ['del_guion', 'cambio_ia'],
      heard: 'con arina agua y sal',
    })
    expect(third).toEqual({ ...CUES[2], text: 'El pan sale bien', flags: ['cambio_ia'], heard: 'el pan sale bien' })
    // Which AI wrote it is kept with the version.
    const row = t.subtitleVersions.get(t.subtitleTracks.getByScript(scriptId)!.id, 2)!
    expect(row).toMatchObject({ promptId: 'revision_subtitulos', usageId: expect.any(String) })
  })

  it('`accept: []` discards it, and a cue that was not proposed is a 400', async () => {
    const { t, scriptId } = await withSubtitles()
    await review(t, scriptId)
    const wrong = await call(t, 'POST', `${base(scriptId)}/ai-proposal`, { baseVersion: 1, accept: ['nada'] })
    expect(wrong.status).toBe(400)
    const discarded = await call(t, 'POST', `${base(scriptId)}/ai-proposal`, { baseVersion: 1, accept: [] })
    expect(discarded.body).toMatchObject({ latest: { version: 1 }, aiProposal: null })
    expect((await call(t, 'POST', `${base(scriptId)}/ai-proposal`, { baseVersion: 1, accept: [] })).status).toBe(409)
  })

  it('a change made after it leaves the proposal behind', async () => {
    const { t, scriptId } = await withSubtitles()
    await review(t, scriptId)
    const cues = [{ ...CUES[0]!, reviewed: true }, ...CUES.slice(1)]
    const saved = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues } })
    expect(saved.body['aiProposal']).toBeNull()
  })

  it('a long video goes in batches of 200: one cost for all of them, and a proposal from each', async () => {
    const many = Array.from({ length: 450 }, (_, i) => cue(`c${i + 1}`, i * 4, `pan número ${i + 1}`))
    const { t, scriptId } = await withSubtitles('ok', many)
    const runs: number[] = []
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = ((request: Parameters<typeof original>[0]) => {
      runs.push((request.input['cues'] as unknown[]).length)
      return original(request)
    }) as never
    const { estimate, view } = await review(t, scriptId)
    expect(estimate['cents']).toEqual(expect.any(Number))
    expect(runs).toEqual([200, 200, 50])
    // Two changes of a point and one of a capital in each of the three batches.
    expect(view['aiProposal']).toHaveLength(9)
  })

  it('the whole review is one operation: the batches together must fit the limits, checked before paying', async () => {
    const many = Array.from({ length: 450 }, (_, i) => cue(`c${i + 1}`, i * 4, `pan número ${i + 1}`))
    const { t, scriptId } = await withSubtitles('ok', many)
    const reserved: number[] = []
    const reservedFor = t.channel.aiRun.reservedFor
    t.channel.aiRun.reservedFor = ((...args: Parameters<typeof reservedFor>) => {
      const cents = reservedFor(...args)
      reserved.push(cents)
      return cents
    }) as never
    await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    const [one, two, three] = reserved
    const total = one! + two! + three!
    // Each batch fits on its own; all three do not.
    expect(Math.max(one!, two!, three!)).toBeLessThan(total - 1)
    await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: total - 1,
      dailyCents: 10_000,
      monthlyCents: 10_000,
    })
    const runs: unknown[] = []
    const run = t.channel.aiRun.run
    t.channel.aiRun.run = ((request: Parameters<typeof run>[0]) => {
      runs.push(request)
      return run(request)
    }) as never
    const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    expect(estimate.body['blockedBy']).toBe('por_operacion')
    await call(t, 'POST', `${base(scriptId)}/generate`, {
      use: 'revision_subtitulos',
      estimateId: estimate.body['estimateId'],
      baseVersion: 1,
    })
    await vi.waitFor(async () => {
      expect((await read(t, scriptId))['job']).toMatchObject({ status: 'fallido', failure: 'limite_de_gasto' })
    })
    expect(runs).toEqual([])
  })

  it('each later batch asks for its own estimate when it starts, so a long review never finds one expired', async () => {
    const many = Array.from({ length: 450 }, (_, i) => cue(`c${i + 1}`, i * 4, `pan número ${i + 1}`))
    const { t, scriptId } = await withSubtitles('ok', many)
    const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    const asked: string[] = []
    const original = t.channel.aiRun.estimate
    t.channel.aiRun.estimate = ((request: Parameters<typeof original>[0]) => {
      asked.push(request.scope ?? '')
      return original(request)
    }) as never
    await call(t, 'POST', `${base(scriptId)}/generate`, {
      use: 'revision_subtitulos',
      estimateId: estimate.body['estimateId'],
      baseVersion: 1,
    })
    await vi.waitFor(async () => {
      expect((await read(t, scriptId))['job']).toMatchObject({ status: 'hecho' })
    })
    expect(asked.map((scope) => scope.split('/').pop())).toEqual(['1', '2'])
  })

  it('an estimate for another version, spent or made up is refused', async () => {
    const { t, scriptId } = await withSubtitles()
    const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    const made = await call(t, 'POST', `${base(scriptId)}/generate`, {
      use: 'revision_subtitulos',
      estimateId: 'inventado',
      baseVersion: 1,
    })
    expect(made.status).toBe(400)
    await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    const stale = await call(t, 'POST', `${base(scriptId)}/generate`, {
      use: 'revision_subtitulos',
      estimateId: estimate.body['estimateId'],
      baseVersion: 2,
    })
    expect(stale.status).toBe(400)
  })

  it('while it runs nothing else changes: `en_curso`', async () => {
    const { t, scriptId } = await withSubtitles()
    let release = () => {}
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (...args: Parameters<typeof original>) => {
      await new Promise<void>((resolve) => (release = resolve))
      return original(...args)
    }) as never
    const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    await call(t, 'POST', `${base(scriptId)}/generate`, {
      use: 'revision_subtitulos',
      estimateId: estimate.body['estimateId'],
      baseVersion: 1,
    })
    const busy = await call(t, 'PUT', base(scriptId), { baseVersion: 1, content: { cues: CUES.slice(1) } })
    expect(busy.status).toBe(409)
    expect(code(busy.body)).toBe('en_curso')
    // Nor a new recognition, which would take the review's place in the track.
    const listen = await call(t, 'POST', `${base(scriptId)}/recognize`)
    expect(listen.status).toBe(409)
    expect(code((await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })).body)).toBe(
      'en_curso',
    )
    release()
    await vi.waitFor(async () => {
      expect(((await read(t, scriptId))['job'] as { status: string }).status).toBe('hecho')
    })
  })

  it('an answer that rewrites what was said, or names a cue not in the batch, is refused', async () => {
    for (const scenario of ['reescribe', 'id_inventado', 'cifra_inventada']) {
      const { t, scriptId } = await withSubtitles(scenario)
      const { view } = await review(t, scriptId)
      expect(view, scenario).toMatchObject({
        job: { status: 'fallido', failure: 'respuesta_invalida' },
        aiProposal: null,
        latest: { version: 1 },
      })
    }
  })

  it.each(['sin_sesion', 'cupo_agotado', 'tiempo_agotado', 'contenido_filtrado', 'no_disponible', 'limite_de_gasto'])(
    'failing with %s leaves the subtitles as they were and no proposal',
    async (failure) => {
      const { t, scriptId } = await withSubtitles()
      t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
      const { view } = await review(t, scriptId)
      expect(view).toMatchObject({ job: { status: 'fallido', failure }, aiProposal: null, latest: { version: 1 } })
      expect(latestCues(view)).toEqual(CUES)
    },
  )

  it('without subtitles there is nothing to review', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const estimate = await call(t, 'POST', `${base(scriptId)}/estimate`, { use: 'revision_subtitulos' })
    expect(estimate.status).toBe(409)
  })
})
