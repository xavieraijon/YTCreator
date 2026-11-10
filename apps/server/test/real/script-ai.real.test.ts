import { createRegistry, resolveProfile, type ProviderId } from '@ytcreator/ai'
import {
  costCents,
  durationSeconds,
  researchOutput,
  Secret,
  SCRIPT_LIMITS,
  shortDraftOutputFor,
  type Pricing,
  type ResearchOutput,
} from '@ytcreator/core'
import { loadMarket, loadScriptKnowledge, promptFor } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../src/logging.ts'
import { createLinkCheck } from '../../src/services/link-check.ts'

// T087 (P1): the real AI, outside CI and only with the creator's authorization (`pnpm test:real-ai`).
// One research on the internet and one script per connection whose secret is in the environment; nothing else
// is called. The secrets are read here and never printed: only their presence decides what runs.
const CONNECTIONS: { id: ProviderId; env: string }[] = [
  { id: 'claude-code', env: 'CLAUDE_CODE_OAUTH_TOKEN' },
  { id: 'anthropic', env: 'ANTHROPIC_API_KEY' },
]

const market = loadMarket()
const knowledge = loadScriptKnowledge()
const pricing: Pricing = {
  version: market.pricing.version,
  models: market.pricing.data.models,
  usdToEur: market.pricing.data.usdToEur.rate,
  charsPerToken: market.pricing.data.charsPerToken,
  webSearchUsdPer1000: market.pricing.data.webSearchUsdPer1000,
  webInputTokensPerSearch: market.pricing.data.webInputTokensPerSearch.value,
  webInputTokensPerFetch: market.pricing.data.webInputTokensPerFetch.value,
}
const SHORT_MAX = market.shorts.data.maxDurationSeconds
const WPM = SCRIPT_LIMITS.wordsPerMinute.byDefault
const TARGET = SCRIPT_LIMITS.shortSeconds.byDefault
const FIVE_MINUTES = 5 * 60 * 1000

// A plain idea with facts that can be looked up, as the server would send it (scripts.ts, `investigacion`).
const idea = {
  title: 'Por qué el pan de masa madre se digiere mejor',
  hook: 'No es solo una moda: la fermentación larga cambia el pan.',
  query: 'masa madre digestión fermentación',
  queryEn: 'sourdough digestion fermentation',
}
const profile = {
  niche: { label: 'Pan casero', summary: 'Recetas y ciencia del pan hecho en casa.' },
  promise: 'Pan de verdad en casa, explicado sin rodeos.',
  pillars: ['Recetas', 'Ciencia del pan'],
  audience: 'Personas que empiezan a hacer pan en casa.',
  format: 'Vídeos explicativos con voz',
  rhythm: { longPerWeek: 1, shortsPerWeek: 3 },
}

const report = (line: string) => process.stdout.write(`[real-ai] ${line}\n`)
// What the app's own log wrote (it never holds secrets nor the output, constitution VII).
const failed = (
  what: string,
  result: {
    failure: { kind: string; reason: string }
    invalidOutput?: true
    usage?: { inputTokens?: number; outputTokens?: number; webSearches?: number }
  },
  log: string[],
) => {
  const { usage } = result
  report(
    `${what}: fallo ${result.failure.kind} / ${result.failure.reason}${result.invalidOutput ? ' (salida no válida)' : ''}` +
      (usage
        ? `; consumido: tokens ${usage.inputTokens ?? 0}/${usage.outputTokens ?? 0}, búsquedas ${usage.webSearches ?? 0}`
        : ''),
  )
  for (const line of log) report(`  log ${line}`)
}

// Each call to the API, timed: only its order, path, status and seconds, never what goes or comes back.
const timed = (): typeof fetch => {
  let n = 0
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const call = ++n
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname
    const start = Date.now()
    try {
      const response = await fetch(input, init)
      report(`  llamada ${call} ${path}: ${response.status} en ${Math.round((Date.now() - start) / 1000)} s`)
      return response
    } catch (error) {
      report(`  llamada ${call} ${path}: ${(error as Error).name} a los ${Math.round((Date.now() - start) / 1000)} s`)
      throw error
    }
  }) as typeof fetch
}

describe.each(CONNECTIONS)('real AI: $id', ({ id, env }) => {
  const secret = process.env[env]
  it.skipIf(!secret)(
    'researches on the internet and writes a Short from what it found',
    async () => {
      const logger = createMemoryLogger(() => new Date())
      const descriptor = createRegistry({ env: process.env, allowFake: false, logger }).find((one) => one.id === id)!
      const provider = descriptor.create(Secret.from(secret!), { fetch: timed(), now: () => new Date(), logger })
      const linkCheck = createLinkCheck({ logger })

      // 1. Research: search, shape and links (SC-011 counts the three).
      const research = resolveProfile(id, 'investigacion')
      const started = Date.now()
      const found = await provider.generate<ResearchOutput>({
        use: 'investigacion',
        prompt: promptFor('investigacion'),
        input: { idea, notes: '', language: 'es', reliable: knowledge.sources.data.reliable },
        schema: researchOutput,
        ...(research.web ? { web: research.web } : {}),
      })
      const searched = Date.now()
      if (!found.ok) failed(`${id} investigación (${Math.round((searched - started) / 1000)} s)`, found, logger.lines)
      expect(found.ok).toBe(true)
      if (!found.ok) return
      const urls = [...new Set(found.value.facts.flatMap((fact) => fact.sources.map((source) => source.url)))]
      const links = await linkCheck.checkAll(urls)
      const total = Date.now() - started
      const opened = [...links.values()].filter((state) => state === 'abre').length
      const seen = found.seenUrls ? urls.filter((url) => found.seenUrls!.includes(url)).length : null
      const researchCents = costCents(
        pricing,
        research.model,
        found.usage.inputTokens ?? 0,
        found.usage.outputTokens ?? 0,
        found.usage.webSearches ?? 0,
      )
      report(
        `${id} investigación: ${found.value.facts.length} hechos, ${urls.length} enlaces (${opened} abren` +
          `${seen === null ? '' : `, ${seen} vistos por la IA`}), búsquedas cobradas ${found.usage.webSearches ?? 0}, ` +
          `tokens ${found.usage.inputTokens ?? 0}/${found.usage.outputTokens ?? 0}, ` +
          `${id === 'anthropic' ? `${researchCents} céntimos` : 'cupo de la suscripción'}; ` +
          `IA ${Math.round((searched - started) / 1000)} s, enlaces ${Math.round((total - (searched - started)) / 1000)} s, ` +
          `total ${Math.round(total / 1000)} s (SC-011: < 300 s)`,
      )
      for (const fact of found.value.facts) report(`  · [${fact.label}] ${fact.text.slice(0, 110)}`)
      expect(total).toBeLessThan(FIVE_MINUTES)

      // 2. A Short written from those facts (`guion_short`), with its duration against the target (SC-002).
      const writing = resolveProfile(id, 'guion_short')
      const facts = found.value.facts.map((fact, index) => ({
        id: `hecho-${index + 1}`,
        text: fact.text,
        label: fact.label,
        sources: fact.sources.map((source) => source.title),
        alternatives: fact.alternatives,
      }))
      const writeStart = Date.now()
      const written = await provider.generate({
        use: 'guion_short',
        prompt: promptFor('guion_short'),
        input: {
          idea: { title: idea.title, hook: idea.hook, query: idea.query, format: 'short' },
          profile,
          voice: { address: 'tu', register: 'cercano', sample: '' },
          notes: '',
          facts,
          targetSeconds: TARGET,
          wordsPerMinute: WPM,
          craft: knowledge.craft.data,
          angle: null,
        },
        schema: shortDraftOutputFor(SHORT_MAX, WPM),
      })
      if (!written.ok) failed(`${id} guion Short`, written, logger.lines)
      expect(written.ok).toBe(true)
      if (!written.ok) return
      const text = written.value.blocks.map((block) => block.text).join(' ')
      const seconds = durationSeconds(text, WPM)
      const off = Math.round((Math.abs(seconds - TARGET) / TARGET) * 100)
      const writeCents = costCents(
        pricing,
        writing.model,
        written.usage.inputTokens ?? 0,
        written.usage.outputTokens ?? 0,
      )
      report(
        `${id} guion Short: ${seconds} s para un objetivo de ${TARGET} s (${off} % de desvío; SC-002: ±10 %), ` +
          `${written.value.claims.length} afirmaciones, tokens ${written.usage.inputTokens ?? 0}/` +
          `${written.usage.outputTokens ?? 0}, ${id === 'anthropic' ? `${writeCents} céntimos` : 'cupo de la suscripción'}, ` +
          `${Math.round((Date.now() - writeStart) / 1000)} s`,
      )
      for (const block of written.value.blocks) report(`  · ${block.type}: ${block.text}`)
    },
    15 * 60 * 1000,
  )
})
