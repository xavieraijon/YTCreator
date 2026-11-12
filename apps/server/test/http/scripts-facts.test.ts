import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

interface Source {
  id: string
  url: string | null
  reference: string | null
  title: string
  accessedAt: string
  link: string | null
}
interface Fact {
  id: string
  text: string
  label: string
  origin: string
  sources: Source[]
  alternatives: string | null
}
interface Facts {
  version: number
  origin: string
  content: { facts: Fact[] }
}
interface Claim {
  id: string
  text: string
  status: string
  check: { verdict: string; proposal: string | null; sources: Source[]; checkedAt: string } | null
}
interface Draft {
  version: number
  origin: string
  content: { blocks: { id: string; text: string }[]; claims: Claim[] }
}

const FIRST = 'https://fuente-uno.example/masa-madre'
const BROKEN = 'https://enlace-roto.example/pagina'

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body
async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use })
  const started = await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}
const factsOf = (body: Record<string, unknown>) => body['facts'] as Facts

async function withScript(fakeAi = 'ok') {
  const t = makeTestApp({ fakeAi })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan sin amasar', format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  return { t, id, channelId }
}

async function withDraft() {
  const made = await withScript()
  const outline = (await ask(made.t, made.id, 'escaleta'))['outline'] as { version: number }
  await call(made.t, 'POST', `/api/scripts/${made.id}/outline/approve`, { version: outline.version })
  return { ...made, draft: (await ask(made.t, made.id, 'guion'))['draft'] as Draft }
}

const addClaims = async (t: TestApp, id: string, draft: Draft) => {
  // Three pending marks: the fake answers each one differently.
  const claims = ['uno', 'dos', 'tres']
  const text = claims.map((word) => `Frase ${word}.`).join(' ')
  const blockId = draft.content.blocks[0]!.id
  const row = t.scriptVersions.latest(id, 'guion')!
  t.scriptVersions.add({
    scriptId: id,
    kind: 'guion',
    origin: 'edicion',
    ideaRevision: row.ideaRevision,
    profileVersion: row.profileVersion,
    factsVersion: row.factsVersion,
    outlineVersion: row.outlineVersion,
    content: {
      blocks: row.content.blocks.map((block) => (block.id === blockId ? { ...block, text } : block)),
      claims: claims.map((word) => ({
        id: `marca-${word}`,
        blockId,
        text: `Frase ${word}`,
        status: 'pendiente' as const,
        reason: 'sin_respaldo' as const,
        factId: null,
        check: null,
      })),
    },
  })
  return (await read(t, id))['draft'] as Draft
}

describe('researching a topic', () => {
  it('checks every link and works the labels out itself', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    expect(facts.origin).toBe('ia')
    const [two, one, invented] = facts.content.facts
    expect(two!.label).toBe('comprobado')
    expect(two!.sources.map((source) => source.link)).toEqual(['abre', 'abre'])
    expect(one!.label).toBe('una_fuente')
    expect(one!.sources.map((source) => source.link)).toEqual(['abre', 'no_abre', 'sin_comprobar'])
    expect(Number.isNaN(Date.parse(two!.sources[0]!.accessedAt))).toBe(false)
    expect(invented!.sources).toEqual([])
    expect(invented!.label).toBe('sin_confirmar')
    expect(invented!.alternatives).toBe('Otra versión la sitúa en un molino.')
  })

  it('sends only the idea and the notes (R20)', async () => {
    const { t, id } = await withScript()
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'investigacion')
    const { input } = run.mock.calls[0]![0]
    expect(Object.keys(input).sort()).toEqual(['idea', 'language', 'notes', 'reliable'])
    expect(Object.keys(input['idea'] as object).sort()).toEqual(['hook', 'query', 'queryEn', 'title'])
  })

  it('writes down the searches and what they cost', async () => {
    const { t, id } = await withScript()
    await ask(t, id, 'investigacion')
    const [row] = t.usage.list().filter((one) => one.use === 'investigacion')
    expect(row!.webSearches).toBe(2)
    expect(row!.costCents).toBeGreaterThan(0)
  })

  it('says the most it will search with the price', async () => {
    const { t, id } = await withScript()
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'investigacion' })
    expect(estimate.body['searches']).toBe(8)
    expect(estimate.body['maxCents']).toBeGreaterThanOrEqual(estimate.body['cents'] as number)
  })

  it('refuses when the connection cannot search', async () => {
    const { t, id } = await withScript('sin_web')
    expect((await read(t, id))['webResearch']).toBe(false)
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'investigacion' })
    expect(estimate.status).toBe(409)
    expect((estimate.body['error'] as { code: string }).code).toBe('sin_internet')
  })

  it('tells when it can', async () => {
    const { t, id } = await withScript()
    expect((await read(t, id))['webResearch']).toBe(true)
  })

  it('keeps the facts of the creator when asked again, and the rest in the history', async () => {
    const { t, id } = await withScript()
    const first = factsOf(await ask(t, id, 'investigacion'))
    const mine = {
      id: 'mio',
      text: 'Lo vi en casa de mi abuela.',
      label: 'del_creador',
      origin: 'creador',
      sources: [],
      alternatives: null,
    }
    await call(t, 'PUT', `/api/scripts/${id}/facts`, {
      baseVersion: first.version,
      content: { facts: [...first.content.facts, mine] },
    })
    const again = factsOf(await ask(t, id, 'investigacion'))
    expect(again.content.facts.filter((fact) => fact.id === 'mio')).toHaveLength(1)
    expect(again.content.facts).toHaveLength(4)
    expect(again.content.facts.filter((fact) => first.content.facts.some((one) => one.id === fact.id))).toEqual([])
    const history = (await call(t, 'GET', `/api/scripts/${id}/versions?kind=hechos`)).body as unknown as unknown[]
    expect(history).toHaveLength(3)
  })

  it('takes the latest list to the outline and remembers which it was', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const body = await ask(t, id, 'escaleta')
    const sent = run.mock.calls[0]![0].input['facts'] as { id: string }[]
    expect(sent.map((fact) => fact.id)).toEqual(facts.content.facts.map((fact) => fact.id))
    expect((body['outline'] as { factsVersion: number }).factsVersion).toBe(facts.version)
  })

  it('leaves the list as it was when the search fails', async () => {
    const { t, id } = await withScript()
    t.channel.aiRun.run = (async () => ({ ok: false, failure: 'no_disponible' })) as never
    const body = await ask(t, id, 'investigacion')
    expect(body['facts']).toBeNull()
    expect((body['job'] as { failure: string }).failure).toBe('no_disponible')
  })
})

describe('the list of the creator', () => {
  const source = (url: string | null, reference: string | null = null): Source => ({
    id: `s-${url ?? reference}`,
    url,
    reference,
    title: 'Mi fuente',
    accessedAt: 'cualquiera',
    link: 'abre',
  })
  const fact = (over: Partial<Fact>): Fact => ({
    id: 'nuevo',
    text: 'Un hecho mío.',
    label: 'comprobado',
    origin: 'ia',
    sources: [],
    alternatives: null,
    ...over,
  })
  const save = (t: TestApp, id: string, baseVersion: number, facts: Fact[]) =>
    call(t, 'PUT', `/api/scripts/${id}/facts`, { baseVersion, content: { facts } })

  it('marks what is new as theirs, whatever the page says', async () => {
    const { t, id } = await withScript()
    const saved = await save(t, id, 0, [fact({})])
    expect(saved.status).toBe(200)
    expect(factsOf(saved.body).origin).toBe('edicion')
    expect(factsOf(saved.body).content.facts[0]).toMatchObject({ origin: 'creador', label: 'del_creador' })
  })

  it('checks the new links, and saves them even if they do not open', async () => {
    const { t, id } = await withScript()
    const saved = await save(t, id, 0, [fact({ sources: [source(BROKEN), source(FIRST)] })])
    const stored = factsOf(saved.body).content.facts[0]!.sources
    expect(stored.map((one) => one.link)).toEqual(['no_abre', 'abre'])
    expect(stored[0]!.accessedAt).not.toBe('cualquiera')
  })

  it('leaves a written reference without a link to try', async () => {
    const { t, id } = await withScript()
    const saved = await save(t, id, 0, [
      fact({ text: '', origin: 'creador', sources: [source(null, 'El libro de mi madre, página tal')] }),
    ])
    expect(saved.status).toBe(200)
    expect(factsOf(saved.body).content.facts[0]!.sources[0]!.link).toBeNull()
  })

  it('does not ask again for the links it already knows', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const check = vi.spyOn(t.links, 'checkAll')
    await save(t, id, facts.version, facts.content.facts.slice(1))
    expect(check).not.toHaveBeenCalled()
  })

  it('keeps a fact of the AI as it was when it only loses a neighbour', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const saved = factsOf((await save(t, id, facts.version, facts.content.facts.slice(0, 1))).body)
    expect(saved.content.facts).toEqual(facts.content.facts.slice(0, 1))
  })

  it('cannot raise a label by saying so', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const forged = facts.content.facts.map((one) => ({ ...one, label: 'comprobado' }))
    const saved = factsOf((await save(t, id, facts.version, forged)).body)
    expect(saved.content.facts[1]!.label).toBe('una_fuente')
  })

  it('cannot make a link open by saying so', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const forged = facts.content.facts.map((one) => ({
      ...one,
      sources: one.sources.map((item) => ({ ...item, link: 'abre' })),
    }))
    const saved = factsOf((await save(t, id, facts.version, forged)).body)
    expect(saved.content.facts[1]!.sources[1]!.link).toBe('no_abre')
  })

  it('takes a sentence of the AI that is rewritten as theirs', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const changed = facts.content.facts.map((one, index) =>
      index === 0 ? { ...one, text: 'Dicho a mi manera.' } : one,
    )
    const saved = factsOf((await save(t, id, facts.version, changed)).body)
    expect(saved.content.facts[0]).toMatchObject({ origin: 'creador', label: 'del_creador' })
  })

  it('works the label out again when the sources of a fact change', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const changed = facts.content.facts.map((one, index) =>
      index === 0 ? { ...one, sources: one.sources.slice(0, 1) } : one,
    )
    const saved = factsOf((await save(t, id, facts.version, changed)).body)
    expect(saved.content.facts[0]).toMatchObject({ origin: 'ia', label: 'una_fuente' })
  })

  it('never raises the label the AI gave when sources are taken away', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const row = t.scriptVersions.latest(id, 'hechos')!
    const lowered = row.content.facts.map((one, index) =>
      index === 0 ? { ...one, label: 'sin_confirmar' as const } : one,
    )
    t.scriptVersions.add({ ...row, origin: 'edicion', content: { facts: lowered } })
    const fewer = lowered.map((one, index) => (index === 0 ? { ...one, sources: one.sources.slice(0, 1) } : one))
    const saved = factsOf((await save(t, id, facts.version + 1, fewer)).body)
    expect(saved.content.facts[0]).toMatchObject({ origin: 'ia', label: 'sin_confirmar' })
  })

  it('takes as theirs a fact of the AI they add a source to, and keeps it after another search', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const changed = facts.content.facts.map((one, index) =>
      index === 1 ? { ...one, sources: [...one.sources, source(null, 'Mi libro')] } : one,
    )
    const saved = factsOf((await save(t, id, facts.version, changed)).body)
    expect(saved.content.facts[1]).toMatchObject({ origin: 'creador', label: 'del_creador' })
    const again = factsOf(await ask(t, id, 'investigacion'))
    expect(again.content.facts.filter((one) => one.origin === 'creador')).toHaveLength(1)
  })

  it('does not count a reference as a change when nothing changed', async () => {
    const { t, id } = await withScript()
    const first = factsOf((await save(t, id, 0, [fact({ sources: [source(null, 'Mi libro')] })])).body)
    const again = factsOf(
      (
        await save(
          t,
          id,
          first.version,
          first.content.facts.map((one) => ({
            ...one,
            sources: one.sources.map((item) => ({ ...item, id: 'otro', accessedAt: 'otra' })),
          })),
        )
      ).body,
    )
    expect(again.version).toBe(first.version)
  })

  it('leaves the list alone when the search finds nothing reliable', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const run = t.channel.aiRun.run
    t.channel.aiRun.run = (async (...args: Parameters<typeof run>) => {
      const result = await run(...args)
      return result.ok ? { ...result, value: { facts: [] } } : result
    }) as never
    const after = factsOf(await ask(t, id, 'investigacion'))
    expect(after.version).toBe(facts.version)
    expect(after.content.facts).toEqual(facts.content.facts)
  })

  it('does not count a domain of the unreliable list', async () => {
    const { t, id } = await withScript()
    const run = t.channel.aiRun.run
    t.channel.aiRun.run = (async (...args: Parameters<typeof run>) => {
      const result = await run(...args)
      if (!result.ok) return result
      const sources = [
        { url: 'https://fuente-uno.example/masa-madre', title: 'Una' },
        { url: 'https://es.wikipedia.org/wiki/Pan', title: 'Otra' },
      ]
      const facts = [{ text: 'Un dato.', label: 'comprobado', sources, alternatives: null }]
      return { ...result, value: { facts }, seenUrls: undefined }
    }) as never
    expect(factsOf(await ask(t, id, 'investigacion')).content.facts[0]!.label).toBe('una_fuente')
  })

  it('refuses a stale list', async () => {
    const { t, id } = await withScript()
    await save(t, id, 0, [fact({})])
    const stale = await save(t, id, 0, [fact({ text: 'Otro.' })])
    expect(stale.status).toBe(409)
    expect((stale.body['error'] as { code: string }).code).toBe('version_cambiada')
  })

  it('refuses two facts with the same id', async () => {
    const { t, id } = await withScript()
    expect((await save(t, id, 0, [fact({}), fact({})])).status).toBe(400)
  })

  it('makes no version when nothing changes', async () => {
    const { t, id } = await withScript()
    const facts = factsOf(await ask(t, id, 'investigacion'))
    const saved = factsOf((await save(t, id, facts.version, facts.content.facts)).body)
    expect(saved.version).toBe(facts.version)
  })

  it('refuses while something is being written', async () => {
    const { t, id } = await withScript()
    t.scripts.setJob(
      id,
      t.jobsRepo.start({ journeyId: null, channelId: t.scripts.get(id)!.channelId, kind: 'ia' }).id,
      'guion',
    )
    expect((await save(t, id, 0, [fact({})])).status).toBe(409)
  })
})

describe('checking a script with the internet', () => {
  it('adds a version with the verdicts, without touching the text', async () => {
    const { t, id, draft } = await withDraft()
    const before = await addClaims(t, id, draft)
    const after = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    expect(after.origin).toBe('comprobacion')
    expect(after.version).toBe(before.version + 1)
    expect(after.content.blocks).toEqual(before.content.blocks)
    expect(after.content.claims.map((claim) => claim.status)).toEqual(['pendiente', 'pendiente', 'pendiente'])
    expect(after.content.claims[0]!.check).toMatchObject({
      verdict: 'matizar',
      proposal: 'Una redacción con más cuidado',
    })
  })

  it('tries each link and does not trust a verdict with none that opens', async () => {
    const { t, id, draft } = await withDraft()
    await addClaims(t, id, draft)
    const after = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    expect(after.content.claims[1]!.check).toMatchObject({ verdict: 'correcto' })
    expect(after.content.claims[1]!.check!.sources.map((one) => one.link)).toEqual(['abre', 'abre'])
    expect(after.content.claims[2]!.check).toMatchObject({ verdict: 'sin_fuente', proposal: null })
    expect(after.content.claims[2]!.check!.sources.map((one) => one.link)).toEqual(['no_abre'])
  })

  it('changes the text only when a proposal is accepted', async () => {
    const { t, id, draft } = await withDraft()
    await addClaims(t, id, draft)
    const checked = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    const accepted = await call(t, 'POST', `/api/scripts/${id}/claims/marca-uno`, {
      baseVersion: checked.version,
      action: 'aceptar_propuesta',
    })
    const after = accepted.body['draft'] as Draft
    expect(after.content.blocks[0]!.text).toContain('Una redacción con más cuidado')
    expect(after.content.claims[0]!.status).toBe('corregida')
  })

  it('puts a proposal for a figure in its place, and the sentence stays whole', async () => {
    const { t, id, draft } = await withDraft()
    await addClaims(t, id, draft)
    const checked = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    const row = t.scriptVersions.latest(id, 'guion')!
    const blockId = row.content.blocks[0]!.id
    t.scriptVersions.add({
      ...row,
      origin: 'edicion',
      content: {
        blocks: row.content.blocks.map((block) =>
          block.id === blockId ? { ...block, text: 'Eran 300 soldados.' } : block,
        ),
        claims: row.content.claims.map((claim, index) =>
          index === 0 ? { ...claim, text: '300', check: { ...claim.check!, proposal: 'unos 250' } } : claim,
        ),
      },
    } as never)
    const accepted = await call(t, 'POST', `/api/scripts/${id}/claims/marca-uno`, {
      baseVersion: checked.version + 1,
      action: 'aceptar_propuesta',
    })
    expect((accepted.body['draft'] as Draft).content.blocks[0]!.text).toBe('Eran unos 250 soldados.')
  })

  it('sends the pending marks and only them', async () => {
    const { t, id, draft } = await withDraft()
    const before = await addClaims(t, id, draft)
    await call(t, 'POST', `/api/scripts/${id}/claims/marca-dos`, { baseVersion: before.version, action: 'confirmar' })
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'comprobar_guion')
    const sent = run.mock.calls[0]![0].input['claims'] as { id: string; context: string }[]
    expect(sent.map((claim) => claim.id)).toEqual(['marca-uno', 'marca-tres'])
    expect(sent[0]!.context).toContain('Frase uno.')
  })

  it('does not search again the marks already searched (decision 49)', async () => {
    const { t, id, draft } = await withDraft()
    await addClaims(t, id, draft)
    const checked = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    const row = t.scriptVersions.latest(id, 'guion')!
    t.scriptVersions.add({
      ...row,
      origin: 'edicion',
      content: {
        ...row.content,
        claims: row.content.claims.map((claim, index) => (index === 2 ? { ...claim, check: null } : claim)),
      },
    } as never)
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const after = (await ask(t, id, 'comprobar_guion'))['draft'] as Draft
    const sent = run.mock.calls[0]![0].input['claims'] as { id: string }[]
    expect(sent.map((claim) => claim.id)).toEqual(['marca-tres'])
    expect(after.content.claims[0]!.check).toEqual(checked.content.claims[0]!.check)
  })

  it('has nothing to check once every pending mark was searched', async () => {
    const { t, id, draft } = await withDraft()
    await addClaims(t, id, draft)
    await ask(t, id, 'comprobar_guion')
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'comprobar_guion' })).status).toBe(400)
  })

  it('needs something to check', async () => {
    const { t, id, draft } = await withDraft()
    t.scriptVersions.add({
      scriptId: id,
      kind: 'guion',
      origin: 'edicion',
      ideaRevision: 1,
      profileVersion: 1,
      factsVersion: null,
      outlineVersion: null,
      content: { blocks: draft.content.blocks, claims: [] } as never,
    })
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'comprobar_guion' })).status).toBe(400)
  })

  it('refuses when the connection cannot search', async () => {
    const { t, id } = await withScript('sin_web')
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'comprobar_guion' })).status).toBe(409)
  })
})
