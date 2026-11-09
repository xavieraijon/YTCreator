import { describe, expect, it } from 'vitest'
import {
  claimSchema,
  defaultTargetSeconds,
  draftBlockSchema,
  draftContentSchema,
  factSchema,
  factsContentSchema,
  outlineBlockSchema,
  outlineContentSchema,
  SCRIPT_LIMITS,
  scriptSettingsSchema,
  scriptSourceSchema,
  targetSecondsSchema,
} from '../../src/script/model.ts'

const source = {
  id: 's1',
  url: 'https://example.org/a',
  reference: null,
  title: 'Una fuente',
  accessedAt: '2026-11-09',
  link: null,
}
const fact = {
  id: 'f1',
  text: 'El pan lleva harina.',
  label: 'del_creador',
  origin: 'creador',
  sources: [],
  alternatives: null,
}
const block = {
  id: 'b1',
  type: 'gancho',
  title: 'Empieza',
  purpose: 'Que se queden',
  question: null,
  reward: null,
  bridge: null,
  seconds: 30,
}
const draftBlock = { id: 'b1', type: 'gancho', title: 'Empieza', text: 'Hola.', visual: '' }
const claim = { id: 'c1', blockId: 'b1', text: '1990', status: 'pendiente', reason: 'sin_respaldo', factId: null, check: null }

describe('the facts', () => {
  it('admits from 0 to 60 facts', () => {
    expect(factsContentSchema.safeParse({ facts: [] }).success).toBe(true)
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...fact, id: `f${i}` }))
    expect(factsContentSchema.safeParse({ facts: many(60) }).success).toBe(true)
    expect(factsContentSchema.safeParse({ facts: many(61) }).success).toBe(false)
  })

  it('a text of 0 to 600, empty only in a fact of the creator with a source', () => {
    expect(factSchema.safeParse({ ...fact, text: 'x'.repeat(600) }).success).toBe(true)
    expect(factSchema.safeParse({ ...fact, text: 'x'.repeat(601) }).success).toBe(false)
    expect(factSchema.safeParse({ ...fact, text: '' }).success).toBe(false)
    expect(factSchema.safeParse({ ...fact, text: '', sources: [source] }).success).toBe(true)
    expect(factSchema.safeParse({ ...fact, text: '', origin: 'ia', sources: [source] }).success).toBe(false)
  })

  it('has only the four labels', () => {
    for (const label of ['comprobado', 'una_fuente', 'sin_confirmar', 'del_creador']) {
      expect(factSchema.safeParse({ ...fact, label }).success).toBe(true)
    }
    expect(factSchema.safeParse({ ...fact, label: 'seguro' }).success).toBe(false)
  })

  it('a source has an address or a written reference, at least one', () => {
    expect(scriptSourceSchema.safeParse(source).success).toBe(true)
    expect(scriptSourceSchema.safeParse({ ...source, url: null, reference: 'Libro de 1990' }).success).toBe(true)
    expect(scriptSourceSchema.safeParse({ ...source, url: null }).success).toBe(false)
    expect(scriptSourceSchema.safeParse({ ...source, url: 'ftp://example.org/a' }).success).toBe(false)
  })
})

describe('the outline', () => {
  it('has from 1 to 30 blocks', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...block, id: `b${i}` }))
    expect(outlineContentSchema.safeParse({ blocks: [] }).success).toBe(false)
    expect(outlineContentSchema.safeParse({ blocks: many(30) }).success).toBe(true)
    expect(outlineContentSchema.safeParse({ blocks: many(31) }).success).toBe(false)
  })

  it('limits the title to 120, and lets it be empty while editing, the purpose to 0-300 and the types to four', () => {
    expect(outlineBlockSchema.safeParse({ ...block, title: '' }).success).toBe(true)
    expect(outlineBlockSchema.safeParse({ ...block, title: 'x'.repeat(121) }).success).toBe(false)
    expect(outlineBlockSchema.safeParse({ ...block, purpose: '' }).success).toBe(true)
    expect(outlineBlockSchema.safeParse({ ...block, purpose: 'x'.repeat(301) }).success).toBe(false)
    expect(outlineBlockSchema.safeParse({ ...block, type: 'desarrollo' }).success).toBe(false)
    for (const type of ['gancho', 'contexto', 'acto', 'cierre']) {
      expect(outlineBlockSchema.safeParse({ ...block, type }).success).toBe(true)
    }
  })
})

describe('the draft', () => {
  it('limits text and visual note, and admits the short block type', () => {
    expect(draftBlockSchema.safeParse({ ...draftBlock, text: 'x'.repeat(12_000) }).success).toBe(true)
    expect(draftBlockSchema.safeParse({ ...draftBlock, text: 'x'.repeat(12_001) }).success).toBe(false)
    expect(draftBlockSchema.safeParse({ ...draftBlock, visual: 'x'.repeat(501) }).success).toBe(false)
    expect(draftBlockSchema.safeParse({ ...draftBlock, type: 'desarrollo' }).success).toBe(true)
    expect(draftBlockSchema.safeParse({ ...draftBlock, type: 'otro' }).success).toBe(false)
  })

  it('a claim has its five states and two reasons', () => {
    for (const status of ['pendiente', 'confirmada', 'corregida', 'sin_marca', 'quitada']) {
      expect(claimSchema.safeParse({ ...claim, status }).success).toBe(true)
    }
    expect(claimSchema.safeParse({ ...claim, status: 'otra' }).success).toBe(false)
    expect(claimSchema.safeParse({ ...claim, reason: 'hecho_dudoso' }).success).toBe(true)
    expect(claimSchema.safeParse({ ...claim, reason: 'otra' }).success).toBe(false)
    expect(draftContentSchema.safeParse({ blocks: [draftBlock], claims: [claim] }).success).toBe(true)
  })
})

describe('the limits of a script', () => {
  it('a long video goes from 3 to 30 minutes', () => {
    const schema = targetSecondsSchema('largo', 180)
    expect(schema.safeParse(179).success).toBe(false)
    expect(schema.safeParse(180).success).toBe(true)
    expect(schema.safeParse(1800).success).toBe(true)
    expect(schema.safeParse(1801).success).toBe(false)
    expect(schema.safeParse(600.5).success).toBe(false)
  })

  it('a Short goes from 15 s to the maximum it is given', () => {
    const schema = targetSecondsSchema('short', 90)
    expect(schema.safeParse(14).success).toBe(false)
    expect(schema.safeParse(15).success).toBe(true)
    expect(schema.safeParse(90).success).toBe(true)
    expect(schema.safeParse(91).success).toBe(false)
  })

  it('10 minutes and 45 seconds by default', () => {
    expect(defaultTargetSeconds('largo')).toBe(600)
    expect(defaultTargetSeconds('short')).toBe(45)
  })

  it('the voice of a channel: sample up to 4.000 and 100 to 220 words a minute', () => {
    const voice = { address: 'tu', register: 'cercano', sample: '', wordsPerMinute: 150 }
    expect(scriptSettingsSchema.safeParse(voice).success).toBe(true)
    expect(scriptSettingsSchema.safeParse({ ...voice, address: 'vos' }).success).toBe(false)
    expect(scriptSettingsSchema.safeParse({ ...voice, register: 'raro' }).success).toBe(false)
    expect(scriptSettingsSchema.safeParse({ ...voice, sample: 'x'.repeat(4001) }).success).toBe(false)
    expect(scriptSettingsSchema.safeParse({ ...voice, wordsPerMinute: 99 }).success).toBe(false)
    expect(scriptSettingsSchema.safeParse({ ...voice, wordsPerMinute: 221 }).success).toBe(false)
  })

  it('declares the limits of the data model', () => {
    expect(SCRIPT_LIMITS).toMatchObject({ notes: 20_000, sample: 4000, instructions: 500 })
  })
})

describe('coherence of the blocks (R10)', () => {
  const block = { id: 'b1', type: 'acto', title: 'Uno', text: 'Hola', visual: '' } as const
  const claim = { id: 'c1', blockId: 'b1', text: 'dato', status: 'pendiente', reason: 'sin_respaldo', factId: null, check: null } as const

  it('refuses two blocks with the same id', () => {
    expect(draftContentSchema.safeParse({ blocks: [block, block], claims: [] }).success).toBe(false)
  })

  it('refuses a mark on a block that does not exist', () => {
    expect(draftContentSchema.safeParse({ blocks: [block], claims: [claim] }).success).toBe(true)
    expect(draftContentSchema.safeParse({ blocks: [block], claims: [{ ...claim, blockId: 'x' }] }).success).toBe(false)
  })
})
