import { describe, expect, it } from 'vitest'
import {
  CHANNEL_OUTPUTS,
  anglesOutput,
  anglesOutputFor,
  ideaQueriesOutput,
  ideasOutput,
  ideasOutputFor,
} from '../../src/index.ts'

const draft = (i: number, pillar = 'Cenas rápidas') => ({
  title: `Idea ${i}`,
  hook: 'Por qué verlo.',
  pillar,
  format: 'largo' as const,
  query: `cena rapida ${i}`,
  broadQuery: 'cenas rapidas',
  queryEn: `quick dinner ${i}`,
})
const ideas = (n: number, pillar?: string) => ({ ideas: Array.from({ length: n }, (_, i) => draft(i, pillar)) })
const angles = (why = 'Se dirige a quien empieza.') => ({
  angles: [0, 1].map((i) => ({ ...draft(i), why })),
})

describe('idea uses (contracts/ai-uses.md)', () => {
  it('are channel uses, so they go through the same run service', () => {
    expect(CHANNEL_OUTPUTS.ideas).toBe(ideasOutput)
    expect(CHANNEL_OUTPUTS.otro_enfoque).toBe(anglesOutput)
    expect(CHANNEL_OUTPUTS.busquedas_idea).toBe(ideaQueriesOutput)
  })

  it('ideas gives 6 to 10', () => {
    expect(ideasOutput.safeParse(ideas(5)).success).toBe(false)
    expect(ideasOutput.safeParse(ideas(6)).success).toBe(true)
    expect(ideasOutput.safeParse(ideas(10)).success).toBe(true)
    expect(ideasOutput.safeParse(ideas(11)).success).toBe(false)
  })

  it('the pillar has to be one of the profile, ignoring case', () => {
    const schema = ideasOutputFor(['Cenas rápidas', 'Táper'])
    expect(schema.safeParse(ideas(8, 'cenas RÁPIDAS')).success).toBe(true)
    expect(schema.safeParse(ideas(8, 'Postres')).success).toBe(false)
    expect(anglesOutputFor(['Táper']).safeParse(angles()).success).toBe(false)
  })

  it('a search text has no quotes and at most 120 characters', () => {
    const ok = { query: 'cena rapida', broadQuery: 'cenas', queryEn: 'quick dinner' }
    expect(ideaQueriesOutput.safeParse(ok).success).toBe(true)
    expect(ideaQueriesOutput.safeParse({ ...ok, query: '"cena rapida"' }).success).toBe(false)
    expect(ideaQueriesOutput.safeParse({ ...ok, query: 'x'.repeat(121) }).success).toBe(false)
    expect(ideaQueriesOutput.safeParse({ ...ok, queryEn: ' ' }).success).toBe(false)
  })

  it('an angle gives 2 or 3, and its why never says it has room', () => {
    expect(anglesOutput.safeParse(angles()).success).toBe(true)
    expect(anglesOutput.safeParse(angles('Esta tiene hueco seguro.')).success).toBe(false)
    expect(anglesOutput.safeParse(angles('Aquí hay hueco.')).success).toBe(false)
    expect(anglesOutput.safeParse(angles('Esta tendrá más hueco.')).success).toBe(false)
    expect(anglesOutput.safeParse(angles('Quedan huecos.')).success).toBe(false)
    expect(anglesOutput.safeParse(angles('')).success).toBe(false)
    expect(anglesOutput.safeParse(angles('a'.repeat(300))).success).toBe(true)
    expect(anglesOutput.safeParse(angles('a'.repeat(301))).success).toBe(false)
    expect(anglesOutput.safeParse({ angles: [0, 1, 2, 3].map(() => angles().angles[0]) }).success).toBe(false)
    expect(anglesOutput.safeParse({ angles: angles().angles.slice(0, 1) }).success).toBe(false)
  })
})
