import type { AiRequest, AiResult, Billing, Pricing } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createLimitsRepo } from '../../src/db/repos/limits.ts'
import { createUsageRepo } from '../../src/db/repos/usage.ts'
import { ApiError } from '../../src/http/errors.ts'
import { createMemoryLogger } from '../../src/logging.ts'
import { type ActiveAi, createAiRunService } from '../../src/services/ai-run.ts'
import { freshDb, manualClock, seedJourney } from '../db/repos/helpers.ts'

const PRICING: Pricing = {
  version: 1,
  models: { 'claude-haiku-5-5': { input: 0.1, output: 0.5 }, 'claude-sonnet-5-5': { input: 2, output: 10 } },
  usdToEur: 0.86,
  charsPerToken: 3.5,
}

const PROMPT = { id: 'preguntas', version: 1, text: 'Haz preguntas.' }
const VALID = { questions: [{ id: 'q1', question: '¿Qué te gusta?', why: 'Para afinar.' }] }

// A provider that answers from a list and remembers every request.
function stubAi(answers: AiResult<unknown>[], billing: Billing = 'por_uso') {
  const calls: AiRequest<unknown>[] = []
  const ai: ActiveAi = {
    providerId: 'anthropic',
    billing,
    async generate<T>(req: AiRequest<T>): Promise<AiResult<T>> {
      calls.push(req as AiRequest<unknown>)
      const next = answers.shift() ?? { ok: false, failure: { kind: 'no_disponible', reason: 'servicio_caido' } }
      return next as AiResult<T>
    },
  }
  return { ai, calls }
}

const ok = (value: unknown): AiResult<unknown> => ({ ok: true, value, usage: { inputTokens: 100, outputTokens: 50 } })

function setup(answers: AiResult<unknown>[], opts: { billing?: Billing; limits?: boolean } = {}) {
  const db = freshDb()
  const clock = manualClock()
  const { journeyId } = seedJourney(db)
  const usage = createUsageRepo(db, clock.now)
  const limits = createLimitsRepo(db, clock.now)
  if (opts.limits !== false) limits.save({ perOperationCents: 50, dailyCents: 200, monthlyCents: 1000 })
  const { ai, calls } = stubAi(answers, opts.billing)
  const logger = createMemoryLogger(clock.now)
  const service = createAiRunService({
    usage,
    limits,
    pricing: PRICING,
    logger,
    now: clock.now,
    active: () => ai,
    promptFor: () => PROMPT,
  })
  return { service, usage, limits, calls, clock, journeyId, logger }
}

describe('ai-run', () => {
  it('estimates before calling and gives back an id', async () => {
    const { service, journeyId, calls } = setup([ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: { interests: 'cocina' } })
    expect(est.estimateId).toMatch(/[0-9a-f-]{36}/)
    expect(est.included).toBe(false)
    expect(est.cents).toBeGreaterThan(0)
    expect(est.blockedBy).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('never calls the AI without a valid estimateId', async () => {
    const { service, calls } = setup([ok(VALID)])
    await expect(service.run({ estimateId: 'nope', use: 'preguntas', input: {} })).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(0)
  })

  it('rejects an expired estimate and one used for another use', async () => {
    const { service, journeyId, clock, calls } = setup([ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    await expect(service.run({ estimateId: est.estimateId, use: 'nichos', input: {} })).rejects.toBeInstanceOf(ApiError)
    const est2 = service.estimate({ journeyId, use: 'preguntas', input: {} })
    clock.advance(10 * 60_000)
    await expect(service.run({ estimateId: est2.estimateId, use: 'preguntas', input: {} })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(calls).toHaveLength(0)
  })

  it('uses an estimate only once', async () => {
    const { service, journeyId } = setup([ok(VALID), ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    await expect(service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it('sends the prompt, the input apart and the schema, and records ai_usage', async () => {
    const { service, journeyId, calls, usage } = setup([ok(VALID)])
    const input = { interests: 'cocina' }
    const est = service.estimate({ journeyId, use: 'preguntas', input })
    const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input })
    expect(result).toEqual({ ok: true, value: VALID, claimsTrimmed: false, usageId: expect.any(String) })
    expect(calls[0]).toMatchObject({ use: 'preguntas', prompt: PROMPT, input })
    expect(calls[0]?.schema).toBeDefined()
    const [row] = usage.list()
    expect(row).toMatchObject({
      journeyId,
      use: 'preguntas',
      providerId: 'anthropic',
      model: 'claude-haiku-5-5',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCents: est.cents,
      outcome: 'ok',
    })
    expect(row?.costCents).toBeGreaterThan(0)
  })

  it('an estimate asked for another journey is not valid when the run says whose it is', async () => {
    const { service, journeyId, calls } = setup([ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    await expect(
      service.run({ estimateId: est.estimateId, journeyId: 'otro', use: 'preguntas', input: {} }),
    ).rejects.toMatchObject({ body: { code: 'validacion', fields: { estimateId: 'no_valido' } } })
    expect(calls).toHaveLength(0)
  })

  it('blocks with limite_de_gasto without calling when the budget no longer allows it', async () => {
    const { service, journeyId, calls, usage } = setup([ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    // Another call spent today's whole limit in between.
    usage.record({
      use: 'nichos',
      providerId: 'anthropic',
      model: 'claude-sonnet-5-5',
      inputTokens: 1,
      outputTokens: 1,
      estimatedCents: 200,
      costCents: 200,
      pricingVersion: 1,
      outcome: 'ok',
    })
    const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    expect(result).toEqual({ ok: false, failure: 'limite_de_gasto' })
    expect(calls).toHaveLength(0)
    expect(usage.list()[0]).toMatchObject({ outcome: 'limite_de_gasto', costCents: 0, inputTokens: 0, journeyId })
  })

  it('says which limit blocks when estimating', () => {
    const { service, journeyId, limits } = setup([])
    limits.save({ perOperationCents: 1, dailyCents: 1, monthlyCents: 1 })
    expect(service.estimate({ journeyId, use: 'nichos', input: {} }).blockedBy).toBe('por_operacion')
  })

  it('asks for limits before a pay-per-use estimate', () => {
    const { service, journeyId } = setup([], { limits: false })
    expect(() => service.estimate({ journeyId, use: 'preguntas', input: {} })).toThrow(ApiError)
  })

  it('costs 0 with a subscription and needs no limits', async () => {
    const { service, journeyId, usage } = setup([ok(VALID)], { billing: 'suscripcion', limits: false })
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    expect(est).toMatchObject({ cents: 0, included: true, blockedBy: null })
    await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    expect(usage.list()[0]).toMatchObject({ costCents: 0, outcome: 'ok' })
  })

  it('throws sin_conexion when there is no active AI', () => {
    const { journeyId } = setup([])
    const db = freshDb()
    const service = createAiRunService({
      usage: createUsageRepo(db),
      limits: createLimitsRepo(db),
      pricing: PRICING,
      logger: createMemoryLogger(),
      now: () => new Date(),
      active: () => null,
      promptFor: () => PROMPT,
    })
    expect(() => service.estimate({ journeyId, use: 'preguntas', input: {} })).toThrow(ApiError)
  })

  it('maps an invalid output to respuesta_invalida and any other failure to its kind', async () => {
    const { service, journeyId, usage } = setup([
      { ok: false, failure: { kind: 'no_disponible', reason: 'servicio_caido' }, invalidOutput: true },
      { ok: false, failure: { kind: 'tiempo_agotado' } } as AiResult<unknown>,
    ])
    const est1 = service.estimate({ journeyId, use: 'preguntas', input: {} })
    expect(await service.run({ estimateId: est1.estimateId, use: 'preguntas', input: {} })).toEqual({
      ok: false,
      failure: 'respuesta_invalida',
    })
    const est2 = service.estimate({ journeyId, use: 'preguntas', input: {} })
    expect(await service.run({ estimateId: est2.estimateId, use: 'preguntas', input: {} })).toEqual({
      ok: false,
      failure: 'tiempo_agotado',
    })
    expect(usage.list().map((u) => u.outcome)).toEqual(['tiempo_agotado', 'respuesta_invalida'])
  })

  it('records what a failed call cost: usage comes back with the failure (G6)', async () => {
    const paid = { inputTokens: 1_000, outputTokens: 5_000 }
    const { service, journeyId, usage } = setup([
      { ok: false, failure: { kind: 'no_disponible', reason: 'servicio_caido' }, invalidOutput: true, usage: paid },
    ])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    const [row] = usage.list()
    expect(row).toMatchObject({ outcome: 'respuesta_invalida', inputTokens: 1_000, outputTokens: 5_000 })
    expect(row!.costCents).toBeGreaterThan(0)
  })

  it('retries once with feedback when a figure is invented', async () => {
    const invented = { questions: [{ id: 'q1', question: '¿Te va bien?', why: 'Hay 5.000 visitas al mes.' }] }
    const { service, journeyId, calls, usage } = setup([ok(invented), ok(VALID)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    expect(result).toEqual({ ok: true, value: VALID, claimsTrimmed: false, usageId: expect.any(String) })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.prompt.text).toContain('sin respaldo')
    // One row with the tokens of both calls.
    expect(usage.list()).toHaveLength(1)
    expect(usage.list()[0]).toMatchObject({ inputTokens: 200, outputTokens: 100 })
  })

  it('what trimming would leave without a required field is an invalid answer, and is still paid for (M6)', async () => {
    const invented = { recommendedLabel: 'Cocina', why: 'Hay 5.000 visitas al mes.', cautions: [] }
    const { service, journeyId, usage } = setup([ok(invented), ok(invented)])
    const est = service.estimate({ journeyId, use: 'recomendacion', input: {} })
    const result = await service.run({ estimateId: est.estimateId, use: 'recomendacion', input: {} })
    expect(result).toEqual({ ok: false, failure: 'respuesta_invalida' })
    const [row] = usage.list()
    expect(row).toMatchObject({ outcome: 'respuesta_invalida', inputTokens: 200, outputTokens: 100 })
  })

  describe('a concept that loses all its assumptions (P18, FR-014)', () => {
    const concept = (promise: string, assumptions: string[]) => ({
      promise,
      pillars: ['a', 'b', 'c'].map((title) => ({ title, description: 'Una idea.' })),
      audience: { description: 'Gente con prisa.', region: 'espana', madeForKids: false },
      format: { presence: 'voz', longForm: 'Recetas cortas.', shortsRole: 'Avances.' },
      cadence: { longPerWeek: 1, shortsPerWeek: 0, hoursPerWeek: 4 },
      monetization: { category: 'general', assumptions },
    })
    const unbacked = 'Supone 5.000 visitas al mes.'
    const runWith = async (concepts: unknown[]) => {
      const answer = { concepts }
      const { service, journeyId } = setup([ok(answer), ok(answer)])
      const est = service.estimate({ journeyId, use: 'conceptos', input: {} })
      return service.run({ estimateId: est.estimateId, use: 'conceptos', input: {} })
    }

    it('goes away if 2 concepts are left, and it is told', async () => {
      const result = await runWith([concept('A', [unbacked]), concept('B', ['Sin datos.']), concept('C', ['Otro.'])])
      expect(result).toMatchObject({ ok: true, claimsTrimmed: true })
      const { concepts } = (result as unknown as { value: { concepts: { promise: string }[] } }).value
      expect(concepts.map((c) => c.promise)).toEqual(['B', 'C'])
    })

    it('fails, in sight, if fewer than 2 are left', async () => {
      expect(await runWith([concept('A', [unbacked]), concept('B', ['Sin datos.'])])).toEqual({
        ok: false,
        failure: 'respuesta_invalida',
      })
    })
  })

  it('a sentence of a list that may do without it does not lose the paid answer', async () => {
    const invented = {
      recommendedLabel: 'Cocina',
      why: 'Es el más equilibrado.',
      cautions: [{ label: 'Cocina', why: 'Supone 5.000 visitas al mes.' }],
    }
    const { service, journeyId } = setup([ok(invented), ok(invented)])
    const est = service.estimate({ journeyId, use: 'recomendacion', input: {} })
    const result = await service.run({ estimateId: est.estimateId, use: 'recomendacion', input: {} })
    expect(result).toMatchObject({ ok: true, claimsTrimmed: true, value: { cautions: [] } })
  })

  describe('the repetition of an invalid answer is reserved, and asking again for figures checks the budget (P17)', () => {
    const paid = (value: unknown): AiResult<unknown> => ({
      ok: true,
      value,
      usage: { inputTokens: 2_000, outputTokens: 2_000 },
    })
    const invented = {
      questions: [{ id: 'q1', question: '¿Te va bien?', why: 'Para afinar. Hay 5.000 visitas al mes.' }],
    }
    const wide = { dailyCents: 10_000, monthlyCents: 10_000 }

    it('the estimate says the most it can cost: four calls, never past the limit per operation', () => {
      const { service, journeyId, limits } = setup([])
      limits.save({ perOperationCents: 10_000, ...wide })
      const one = service.estimate({ journeyId, use: 'preguntas', input: {} })
      expect(one.cents).toBeGreaterThan(0)
      expect(one.maxCents).toBe(one.cents * 4)
      limits.save({ perOperationCents: one.cents * 3 - 1, ...wide })
      expect(service.estimate({ journeyId, use: 'preguntas', input: {} }).maxCents).toBe(one.cents * 3 - 1)
    })

    it('nothing starts unless two calls fit: the repetition of principle IV is reserved', async () => {
      const { service, journeyId, limits, calls, usage } = setup([ok(VALID)])
      limits.save({ perOperationCents: 10_000, ...wide })
      const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
      limits.save({ perOperationCents: est.cents * 2 - 1, ...wide })
      expect(service.estimate({ journeyId, use: 'preguntas', input: {} }).blockedBy).toBe('por_operacion')
      const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
      expect(result).toEqual({ ok: false, failure: 'limite_de_gasto' })
      expect(calls).toHaveLength(0)
      expect(usage.list()[0]).toMatchObject({ outcome: 'limite_de_gasto', costCents: 0 })
    })

    it('with a subscription there is no maximum to tell', () => {
      const { service, journeyId } = setup([], { billing: 'suscripcion', limits: false })
      expect(service.estimate({ journeyId, use: 'preguntas', input: {} }).maxCents).toBe(0)
    })

    it('without room for two more calls, an invented figure is trimmed instead of asked for again', async () => {
      const { service, journeyId, limits, calls, usage, logger } = setup([paid(invented), paid(VALID)])
      const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
      limits.save({ perOperationCents: est.cents * 2, ...wide })
      const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
      expect(calls).toHaveLength(1)
      expect(result).toMatchObject({ ok: true, claimsTrimmed: true })
      expect(usage.list()[0]).toMatchObject({ outcome: 'ok', inputTokens: 2_000 })
      expect(logger.lines.join('\n')).toContain('ai.retry_skipped_budget')
    })

    it('with room, the figures are asked for again', async () => {
      const { service, journeyId, limits, calls } = setup([ok(invented), ok(VALID)])
      limits.save({ perOperationCents: 10_000, ...wide })
      const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
      const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
      expect(calls).toHaveLength(2)
      expect(result).toMatchObject({ ok: true, claimsTrimmed: false })
    })

    it('what is really sent (the proposal being redone) is what the budget is checked with', async () => {
      const { service, journeyId, limits, calls } = setup([ok(VALID)])
      const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
      limits.save({ perOperationCents: est.cents * 2, ...wide })
      const previous = { text: 'x'.repeat(2_000_000) }
      const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: { previous } })
      expect(result).toEqual({ ok: false, failure: 'limite_de_gasto' })
      expect(calls).toHaveLength(0)
    })
  })

  it('trims what is still unbacked after the retry', async () => {
    const invented = {
      questions: [{ id: 'q1', question: '¿Te va bien?', why: 'Para afinar. Hay 5.000 visitas al mes.' }],
    }
    const { service, journeyId, calls } = setup([ok(invented), ok(invented)])
    const est = service.estimate({ journeyId, use: 'preguntas', input: {} })
    const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input: {} })
    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ ok: true, claimsTrimmed: true })
    if (result.ok) expect(JSON.stringify(result.value)).not.toContain('5.000')
  })

  it('a figure in the proposal being redone does not back the new one', async () => {
    const invented = {
      questions: [{ id: 'q1', question: '¿Te va bien?', why: 'Para afinar. Hay 5.000 visitas al mes.' }],
    }
    const { service, journeyId, calls } = setup([ok(invented), ok(invented)])
    const input = { previous: invented }
    const est = service.estimate({ journeyId, use: 'preguntas', input })
    const result = await service.run({ estimateId: est.estimateId, use: 'preguntas', input })
    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ ok: true, claimsTrimmed: true })
  })

  it('warns in the log, without creator data, when the real cost overruns the estimate', async () => {
    const huge: AiResult<unknown> = { ok: true, value: VALID, usage: { inputTokens: 900_000, outputTokens: 900_000 } }
    const { service, journeyId, logger } = setup([huge])
    const est = service.estimate({ journeyId, use: 'preguntas', input: { interests: 'cocina secreta' } })
    await service.run({ estimateId: est.estimateId, use: 'preguntas', input: { interests: 'cocina secreta' } })
    const warn = logger.lines.find((l) => l.includes('estimate_overrun'))
    expect(warn).toBeDefined()
    expect(warn).not.toContain('cocina')
  })
})
