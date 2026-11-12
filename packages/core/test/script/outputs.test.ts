import { describe, expect, it } from 'vitest'
import {
  blockOutput,
  checkOutputFor,
  draftOutputFor,
  outlineOutput,
  researchOutput,
  liveShortAngles,
  shortAnglesOutput,
  shortAnglesOutputFor,
  shortDraftOutput,
  shortDraftOutputFor,
} from '../../src/script/outputs.ts'

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

describe('the script the AI writes', () => {
  const block = (id: string) => ({ outlineBlockId: id, text: 'Lo que se dice.', visual: 'Tú.' })
  const schema = draftOutputFor(['a', 'b'])

  it('has the same blocks of the outline, in its order', () => {
    expect(schema.safeParse({ blocks: [block('a'), block('b')], claims: [] }).success).toBe(true)
    expect(schema.safeParse({ blocks: [block('b'), block('a')], claims: [] }).success).toBe(false)
    expect(schema.safeParse({ blocks: [block('a')], claims: [] }).success).toBe(false)
    expect(schema.safeParse({ blocks: [block('a'), block('c')], claims: [] }).success).toBe(false)
  })

  it('does not point a claim at a block that is not there', () => {
    const claims = [{ outlineBlockId: 'z', text: 'x', factId: null }]
    expect(schema.safeParse({ blocks: [block('a'), block('b')], claims }).success).toBe(false)
  })

  it('refuses a block with nothing to say', () => {
    expect(schema.safeParse({ blocks: [{ ...block('a'), text: ' ' }, block('b')], claims: [] }).success).toBe(false)
  })

  it('asks a single block for its text and its claims', () => {
    expect(blockOutput.safeParse({ text: 'Hola.', visual: '', claims: [{ text: 'x', factId: null }] }).success).toBe(
      true,
    )
    expect(blockOutput.safeParse({ text: '', visual: '', claims: [] }).success).toBe(false)
  })
})

describe('guion_short', () => {
  const part = (type: string, text = 'Algo que decir.') => ({ type, text, visual: '' })
  const valid = { blocks: [part('gancho'), part('desarrollo'), part('cierre')], claims: [] }

  it('takes a hook, a development and a closing, in that order', () => {
    expect(shortDraftOutput.safeParse(valid).success).toBe(true)
  })

  it('rejects another order, a part too many or one too few', () => {
    const { blocks } = valid
    expect(shortDraftOutput.safeParse({ ...valid, blocks: [blocks[1], blocks[0], blocks[2]] }).success).toBe(false)
    expect(shortDraftOutput.safeParse({ ...valid, blocks: [...blocks, part('cierre')] }).success).toBe(false)
    expect(shortDraftOutput.safeParse({ ...valid, blocks: blocks.slice(0, 2) }).success).toBe(false)
  })

  it('rejects one that lasts more than the maximum it is given', () => {
    const long = { ...valid, blocks: [part('gancho'), part('desarrollo', 'palabra '.repeat(70)), part('cierre')] }
    expect(shortDraftOutputFor(180, 60).safeParse(valid).success).toBe(true)
    expect(shortDraftOutputFor(60, 60).safeParse(long).success).toBe(false)
    expect(shortDraftOutputFor(180, 60).safeParse(long).success).toBe(true)
  })
})

describe('the outputs that come from the internet (T080)', () => {
  it('takes an empty research: better nothing than something invented', () => {
    expect(researchOutput.safeParse({ facts: [] }).success).toBe(true)
  })

  it('only takes a check of the marks that were asked about', () => {
    const check = (claimId: string) => ({
      checks: [{ claimId, verdict: 'correcto', sources: [{ url: 'https://a.org/1', title: 'A' }], proposal: null }],
    })
    const schema = checkOutputFor(['marca-1', 'marca-2'])
    expect(schema.safeParse(check('marca-2')).success).toBe(true)
    expect(schema.safeParse(check('otra')).success).toBe(false)
  })
})

describe('the angles for a Short (T088)', () => {
  const angle = (blockId: string) => ({ title: 'Un título', hook: 'Un gancho', blockId, why: 'Por esto' })

  it('asks for two or three', () => {
    expect(shortAnglesOutput.safeParse({ angles: [angle('a')] }).success).toBe(false)
    expect(shortAnglesOutput.safeParse({ angles: [angle('a'), angle('b')] }).success).toBe(true)
    expect(shortAnglesOutput.safeParse({ angles: [angle('a'), angle('b'), angle('c')] }).success).toBe(true)
    expect(shortAnglesOutput.safeParse({ angles: ['a', 'b', 'c', 'd'].map(angle) }).success).toBe(false)
  })

  it('only takes moments that are in the script', () => {
    const schema = shortAnglesOutputFor(['a', 'b'])
    expect(schema.safeParse({ angles: [angle('a'), angle('b')] }).success).toBe(true)
    expect(schema.safeParse({ angles: [angle('a'), angle('otro')] }).success).toBe(false)
  })
})

describe('the angles still offered (decision 41)', () => {
  const kept = (blockId: string, moment: string, scriptId: string | null = null) => ({
    title: `De ${blockId}`,
    hook: 'Un gancho',
    blockId,
    why: 'Por esto',
    moment,
    trimmed: false,
    scriptId,
  })

  it('offers only those whose moment still says the same, with their place in what is kept', () => {
    const stored = [kept('a', 'Texto A'), kept('b', 'Texto B'), kept('c', 'Texto C', 'guion-1')]
    const live = liveShortAngles(stored, [
      { id: 'a', text: 'Texto A cambiado' },
      { id: 'b', text: 'Texto B' },
      { id: 'c', text: 'Texto C' },
    ])
    expect(live.map((angle) => [angle.blockId, angle.index, angle.scriptId])).toEqual([
      ['b', 1, null],
      ['c', 2, 'guion-1'],
    ])
  })

  it('offers an angle again when its text comes back', () => {
    const stored = [kept('a', 'Texto A')]
    expect(liveShortAngles(stored, [{ id: 'a', text: 'Otro' }])).toEqual([])
    expect(liveShortAngles(stored, [{ id: 'a', text: 'Texto A' }])).toHaveLength(1)
  })

  it('leaves out an angle whose moment is gone', () => {
    expect(liveShortAngles([kept('a', 'Texto A')], [{ id: 'b', text: 'Texto A' }])).toEqual([])
  })
})
