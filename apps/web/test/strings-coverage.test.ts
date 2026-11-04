import { FAILURE_REASONS, NEW_CHANNEL_STEPS, EXISTING_CHANNEL_STEPS, YOUTUBE_FAILURES } from '@ytcreator/core'
import { AI_RUN_FAILURES, API_ERROR_CODES, FIELD_CODES, GUARDS } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { flattenStrings } from '../../../packages/ui/test/forbidden-terms.ts'
import { channelEs } from '../src/strings/channel.es.ts'
import { es } from '../src/strings/es.ts'
import { failuresEs } from '../src/strings/failures.es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../src/strings/youtube-failures.es.ts'

// Mirrors the `label` keys of packages/ai/src/registry.ts.
const PROVIDER_LABELS = ['ai.provider.claude_code', 'ai.provider.anthropic']

const sorted = (values: readonly string[]) => [...values].sort()

describe('strings coverage (FR-027, SC-007)', () => {
  it('every kind + reason has a message, what to do and, but for filtered content, an action', () => {
    expect(sorted(Object.keys(failuresEs))).toEqual(sorted(Object.keys(FAILURE_REASONS)))
    for (const [kind, reasons] of Object.entries(FAILURE_REASONS)) {
      const texts = failuresEs[kind as keyof typeof failuresEs] as Record<
        string,
        (typeof failuresEs)['sin_sesion']['clave_no_valida']
      >
      expect(sorted(Object.keys(texts)), kind).toEqual(sorted(reasons))
      for (const reason of reasons) {
        const text = texts[reason]
        expect(text?.status && text.what && text.todo, `${kind}/${reason}`).toBeTruthy()
        if (kind !== 'contenido_filtrado') expect(text?.actions.length, `${kind}/${reason}`).toBeGreaterThan(0)
      }
    }
  })

  it('every guard, field code and API error code has a text, with no orphans', () => {
    expect(sorted(Object.keys(es.guard))).toEqual(sorted(GUARDS))
    expect(sorted(Object.keys(es.field))).toEqual(sorted(FIELD_CODES))
    expect(sorted(Object.keys(es.apiError))).toEqual(sorted(API_ERROR_CODES))
  })

  it('every provider label key resolves to a text, with no orphans', () => {
    const keys = flattenStrings(es.ai.provider, 'ai.provider').map(({ key }) => key)
    expect(sorted(keys)).toEqual(sorted(PROVIDER_LABELS))
  })

  it('every failure of YouTube says what happened and has an action with a text', () => {
    expect(sorted(Object.keys(youtubeFailuresEs))).toEqual(sorted(YOUTUBE_FAILURES))
    for (const text of Object.values(youtubeFailuresEs)) {
      expect(text.what).toBeTruthy()
      expect(youtubeFailureActionsEs[text.action]).toBeTruthy()
    }
  })

  it('every failure of an AI run and every step of a journey has a text', () => {
    expect(sorted(Object.keys(channelEs.aiFailure))).toEqual(sorted(AI_RUN_FAILURES))
    expect(sorted(Object.keys(channelEs.steps))).toEqual(
      sorted([...new Set([...NEW_CHANNEL_STEPS, ...EXISTING_CHANNEL_STEPS])]),
    )
  })

  it('no text is empty or has a malformed placeholder', () => {
    const all = flattenStrings({ es, failuresEs, channelEs, youtubeFailuresEs, youtubeFailureActionsEs })
    expect(all.filter(({ value }) => value.trim() === '')).toEqual([])
    expect(all.filter(({ value }) => /\{(?!\w+\})|(?<!\{\w*)\}/.test(value))).toEqual([])
  })
})
