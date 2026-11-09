import type { AiRunFailure, ScriptView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FactsStep } from '../../src/screens/channel/scripts/FactsStep.tsx'
import { clock, OutlineStep } from '../../src/screens/channel/scripts/OutlineStep.tsx'
import type { ScriptAi } from '../../src/screens/channel/scripts/useScriptAi.ts'
import { channelEs } from '../../src/strings/channel.es.ts'
import { scriptEs } from '../../src/strings/script.es.ts'

// US1: what the steps say when something went wrong (contracts/ui-screens.md).
const ai = (failure: AiRunFailure | null = null): ScriptAi =>
  ({
    working: null,
    run: async () => undefined,
    priceChanged: false,
    dismiss: () => undefined,
    failureFor: () => failure,
    otherFailure: null,
  }) as unknown as ScriptAi

const block = {
  id: 'b1',
  type: 'gancho',
  title: 'Gancho',
  purpose: 'Para',
  question: null,
  reward: null,
  bridge: null,
  seconds: 30,
}
const script = (fields: Partial<ScriptView> = {}): ScriptView =>
  ({
    id: 's1',
    format: 'largo',
    targetSeconds: 600,
    notes: '',
    updatedAt: 'x',
    status: 'escaleta_lista',
    idea: { title: 'Pan' },
    facts: null,
    outline: { version: 2, origin: 'edicion', content: { blocks: [block] } },
    outlineFromAi: true,
    draft: null,
    outlineApprovedVersion: null,
    warnings: [],
    job: null,
    webResearch: false,
    limits: { minSeconds: 60, maxSeconds: 3600, maxReviewedAt: null },
    voice: { wordsPerMinute: 150 },
    ...fields,
  }) as unknown as ScriptView

const outline = (view: ScriptView, state: ScriptAi) =>
  renderToStaticMarkup(
    <OutlineStep
      script={view}
      ai={state}
      onChange={() => undefined}
      onError={() => undefined}
      onToFacts={() => undefined}
      onToDraft={() => undefined}
    />,
  )
const facts = (view: ScriptView) =>
  renderToStaticMarkup(
    <FactsStep
      script={view}
      ai={ai()}
      onChange={() => undefined}
      onError={() => undefined}
      onToDraft={() => undefined}
    />,
  )

describe('the outline step', () => {
  it('shows a failed request instead of hiding it in the closed section', () => {
    const html = outline(script(), ai('sin_sesion'))
    expect(html).toContain('<details open')
    expect(html).toContain(channelEs.aiFailure.sin_sesion)
  })

  it('keeps the section closed while nothing failed', () => {
    expect(outline(script(), ai())).not.toContain('<details open')
  })

  it('keeps the mark of AI opinion after an edit', () => {
    expect(outline(script(), ai())).toContain('IA')
    expect(outline(script({ outlineFromAi: false }), ai())).not.toContain('Opinión de la IA')
  })

  it('writes durations from the catalog', () => {
    expect(clock(30)).toBe('30 s')
    expect(clock(120)).toBe('2 min')
    expect(clock(150)).toBe('2 min 30 s')
  })
})

describe('the facts step', () => {
  it('warns that with nothing to go on almost everything will be to check', () => {
    expect(facts(script())).toContain(scriptEs.facts.noNotes)
    expect(facts(script({ notes: 'Mis apuntes' }))).not.toContain(scriptEs.facts.noNotes)
  })
})
