import { describe, expect, it } from 'vitest'
import { outlineOutput } from '../../src/script/outputs.ts'

const block = (type: string) => ({
  type,
  title: 'Un bloque',
  purpose: 'Para algo',
  question: null,
  reward: null,
  bridge: null,
  seconds: 60,
})
const ok = ['gancho', 'contexto', 'acto', 'acto', 'cierre']
const outline = (types: string[]) => ({ blocks: types.map(block) })
const complete = {
  blocks: outline(ok).blocks.map((one) =>
    one.type === 'acto' ? { ...one, question: '¿Qué?', reward: 'Esto', bridge: 'Y ahora' } : one,
  ),
}

describe('output of escaleta (ai-uses.md)', () => {
  it('takes a hook, a context, two acts and a closing', () => {
    expect(outlineOutput.safeParse(complete).success).toBe(true)
  })

  it.each([
    ['no hook first', ['contexto', 'gancho', 'acto', 'acto', 'cierre']],
    ['no closing last', ['gancho', 'contexto', 'acto', 'cierre', 'acto']],
    ['no context', ['gancho', 'acto', 'acto', 'cierre']],
    ['only one act', ['gancho', 'contexto', 'acto', 'cierre']],
    ['two contexts', ['gancho', 'contexto', 'contexto', 'acto', 'acto', 'cierre']],
  ])('refuses %s', (_, types) => {
    expect(outlineOutput.safeParse(outline(types)).success).toBe(false)
  })

  it('refuses an act that does not open a question, give something and lead on', () => {
    const blocks = outline(ok).blocks.map((one) =>
      one.type === 'acto' ? { ...one, question: '¿Qué?', reward: 'Esto', bridge: 'Y ahora' } : one,
    )
    expect(outlineOutput.safeParse({ blocks }).success).toBe(true)
    for (const field of ['question', 'reward', 'bridge']) {
      const broken = blocks.map((one) => (one.type === 'acto' ? { ...one, [field]: null } : one))
      expect(outlineOutput.safeParse({ blocks: broken }).success, field).toBe(false)
    }
    expect(outlineOutput.safeParse({ blocks: blocks.map((one) => ({ ...one, purpose: '' })) }).success).toBe(false)
  })

  it('refuses a block without a title or without seconds', () => {
    const { blocks } = complete
    expect(outlineOutput.safeParse({ blocks: [{ ...blocks[0], title: ' ' }, ...blocks.slice(1)] }).success).toBe(false)
    expect(outlineOutput.safeParse({ blocks: [{ ...blocks[0], seconds: 0 }, ...blocks.slice(1)] }).success).toBe(false)
  })
})
