import { describe, expect, it } from 'vitest'
import {
  chaptersContentSchema,
  commentContentSchema,
  descriptionContentSchema,
  emptyPiece,
  PACKAGE_CONTENT_SCHEMAS,
  PACKAGE_KINDS,
  PUBLISH_LIMITS,
  shortCoverContentSchema,
  stepKinds,
  tagsContentSchema,
  thumbnailsContentSchema,
  titlesContentSchema,
} from '../../src/publish/model.ts'

const candidate = (id: string, text = 'Un título') => ({ id, text, why: '', blockId: null, origin: 'ia' as const })
const concept = (id: string) => ({
  id,
  scene: 'Una mano con un pan',
  bigText: 'PAN',
  emotion: 'sorpresa',
  composition: 'centrada',
  colors: 'amarillo y negro',
  titleId: null,
  origin: 'ia' as const,
})
const chapter = (id: string, extra: object = {}) => ({
  id,
  title: 'Empieza',
  blockIds: ['b1'],
  startSeconds: null,
  manual: false,
  ...extra,
})
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('titles (data-model.md, decision 13)', () => {
  it('from 1 to 12 candidates, text from 1 to 200', () => {
    expect(ok(titlesContentSchema, { candidates: [], main: null, alternatives: [] })).toBe(false)
    const twelve = Array.from({ length: 12 }, (_, index) => candidate(`t${index}`))
    expect(ok(titlesContentSchema, { candidates: twelve, main: null, alternatives: [] })).toBe(true)
    expect(ok(titlesContentSchema, { candidates: [...twelve, candidate('x')], main: null, alternatives: [] })).toBe(
      false,
    )
    expect(
      ok(titlesContentSchema, { candidates: [candidate('a', 'x'.repeat(200))], main: 'a', alternatives: [] }),
    ).toBe(true)
    expect(
      ok(titlesContentSchema, { candidates: [candidate('a', 'x'.repeat(201))], main: 'a', alternatives: [] }),
    ).toBe(false)
    expect(ok(titlesContentSchema, { candidates: [candidate('a', '')], main: null, alternatives: [] })).toBe(false)
  })

  it('why up to 300 and the origin of its enum', () => {
    const base = candidate('a')
    expect(
      ok(titlesContentSchema, { candidates: [{ ...base, why: 'x'.repeat(300) }], main: null, alternatives: [] }),
    ).toBe(true)
    expect(
      ok(titlesContentSchema, { candidates: [{ ...base, why: 'x'.repeat(301) }], main: null, alternatives: [] }),
    ).toBe(false)
    expect(ok(titlesContentSchema, { candidates: [{ ...base, origin: 'otro' }], main: null, alternatives: [] })).toBe(
      false,
    )
  })

  it('main and up to 2 alternatives point to different existing candidates', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c'), candidate('d')]
    expect(ok(titlesContentSchema, { candidates, main: 'a', alternatives: ['b', 'c'] })).toBe(true)
    expect(ok(titlesContentSchema, { candidates, main: 'a', alternatives: ['b', 'c', 'd'] })).toBe(false)
    expect(ok(titlesContentSchema, { candidates, main: 'a', alternatives: ['a'] })).toBe(false)
    expect(ok(titlesContentSchema, { candidates, main: 'z', alternatives: [] })).toBe(false)
    expect(ok(titlesContentSchema, { candidates, main: 'a', alternatives: ['b', 'b'] })).toBe(false)
    expect(ok(titlesContentSchema, { candidates, main: null, alternatives: ['z'] })).toBe(false)
    expect(
      ok(titlesContentSchema, { candidates: [candidate('a'), candidate('a')], main: null, alternatives: [] }),
    ).toBe(false)
  })
})

describe('thumbnails and the cover of a Short', () => {
  it('from 1 to 6 concepts and up to 3 chosen, existing and different', () => {
    const six = Array.from({ length: 6 }, (_, index) => concept(`m${index}`))
    expect(ok(thumbnailsContentSchema, { concepts: six, chosen: ['m0', 'm1', 'm2'] })).toBe(true)
    expect(ok(thumbnailsContentSchema, { concepts: [...six, concept('x')], chosen: [] })).toBe(false)
    expect(ok(thumbnailsContentSchema, { concepts: [], chosen: [] })).toBe(false)
    expect(ok(thumbnailsContentSchema, { concepts: six, chosen: ['m0', 'm1', 'm2', 'm3'] })).toBe(false)
    expect(ok(thumbnailsContentSchema, { concepts: six, chosen: ['zz'] })).toBe(false)
    expect(ok(thumbnailsContentSchema, { concepts: six, chosen: ['m0', 'm0'] })).toBe(false)
  })

  it('the limits of each field of a concept', () => {
    const limits: [keyof ReturnType<typeof concept>, number, number][] = [
      ['scene', 1, 500],
      ['bigText', 0, 40],
      ['emotion', 0, 120],
      ['composition', 0, 300],
      ['colors', 0, 200],
    ]
    for (const [field, min, max] of limits) {
      expect(
        ok(thumbnailsContentSchema, { concepts: [{ ...concept('m'), [field]: 'x'.repeat(max) }], chosen: [] }),
      ).toBe(true)
      expect(
        ok(thumbnailsContentSchema, { concepts: [{ ...concept('m'), [field]: 'x'.repeat(max + 1) }], chosen: [] }),
        field,
      ).toBe(false)
      if (min === 1)
        expect(ok(thumbnailsContentSchema, { concepts: [{ ...concept('m'), [field]: '' }], chosen: [] })).toBe(false)
    }
  })

  it('the cover of a Short: moment up to 300 and screen text up to 60', () => {
    expect(ok(shortCoverContentSchema, { blockId: 'b1', moment: 'x'.repeat(300), screenText: 'x'.repeat(60) })).toBe(
      true,
    )
    expect(ok(shortCoverContentSchema, { blockId: null, moment: 'x'.repeat(301), screenText: '' })).toBe(false)
    expect(ok(shortCoverContentSchema, { blockId: null, moment: '', screenText: 'x'.repeat(61) })).toBe(false)
  })
})

describe('description, chapters, tags and comment', () => {
  const description = { firstLines: 'Hola', body: '', hashtags: [], fixedText: '' }

  it('the limits of each part of the description', () => {
    expect(ok(descriptionContentSchema, description)).toBe(true)
    expect(ok(descriptionContentSchema, { ...description, firstLines: 'x'.repeat(301) })).toBe(false)
    expect(ok(descriptionContentSchema, { ...description, body: 'x'.repeat(3000) })).toBe(true)
    expect(ok(descriptionContentSchema, { ...description, body: 'x'.repeat(3001) })).toBe(false)
    expect(ok(descriptionContentSchema, { ...description, fixedText: 'x'.repeat(1500) })).toBe(true)
    expect(ok(descriptionContentSchema, { ...description, fixedText: 'x'.repeat(1501) })).toBe(false)
  })

  it('from 0 to 10 hashtags, without «#» or spaces', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `pan${index}`)
    expect(ok(descriptionContentSchema, { ...description, hashtags: ten })).toBe(true)
    expect(ok(descriptionContentSchema, { ...description, hashtags: [...ten, 'otro'] })).toBe(false)
    expect(ok(descriptionContentSchema, { ...description, hashtags: ['#pan'] })).toBe(false)
    expect(ok(descriptionContentSchema, { ...description, hashtags: ['pan de leña'] })).toBe(false)
    expect(ok(descriptionContentSchema, { ...description, hashtags: [''] })).toBe(false)
  })

  it('from 0 to 30 chapters, title up to 100, a start that is null or not negative', () => {
    const thirty = Array.from({ length: 30 }, (_, index) => chapter(`c${index}`))
    expect(ok(chaptersContentSchema, { chapters: thirty })).toBe(true)
    expect(ok(chaptersContentSchema, { chapters: [...thirty, chapter('x')] })).toBe(false)
    expect(ok(chaptersContentSchema, { chapters: [] })).toBe(true)
    expect(ok(chaptersContentSchema, { chapters: [chapter('c', { title: 'x'.repeat(101) })] })).toBe(false)
    expect(ok(chaptersContentSchema, { chapters: [chapter('c', { startSeconds: -1, manual: true })] })).toBe(false)
    expect(ok(chaptersContentSchema, { chapters: [chapter('c', { startSeconds: 30, manual: true })] })).toBe(true)
    // A start written by hand is what makes it manual (research.md R3).
    expect(ok(chaptersContentSchema, { chapters: [chapter('c', { startSeconds: null, manual: true })] })).toBe(false)
    expect(ok(chaptersContentSchema, { chapters: [chapter('c'), chapter('c')] })).toBe(false)
  })

  it('from 0 to 40 tags, each from 1 to 100', () => {
    const forty = Array.from({ length: 40 }, (_, index) => `etiqueta ${index}`)
    expect(ok(tagsContentSchema, { tags: forty })).toBe(true)
    expect(ok(tagsContentSchema, { tags: [...forty, 'otra'] })).toBe(false)
    expect(ok(tagsContentSchema, { tags: [''] })).toBe(false)
    expect(ok(tagsContentSchema, { tags: ['x'.repeat(101)] })).toBe(false)
  })

  it('the comment from 0 to 1.000', () => {
    expect(ok(commentContentSchema, { text: '' })).toBe(true)
    expect(ok(commentContentSchema, { text: 'x'.repeat(1000) })).toBe(true)
    expect(ok(commentContentSchema, { text: 'x'.repeat(1001) })).toBe(false)
  })

  it('instructions up to 500', () => expect(PUBLISH_LIMITS.instructions).toBe(500))
})

describe('steps and empty pieces (research.md R2, decision 14)', () => {
  it('a schema for every kind', () =>
    expect(Object.keys(PACKAGE_CONTENT_SCHEMAS).sort()).toEqual([...PACKAGE_KINDS].sort()))

  it('the pieces of each step, by format', () => {
    expect(stepKinds('largo', 'portada')).toEqual(['titulos', 'miniaturas'])
    expect(stepKinds('short', 'portada')).toEqual(['titulos', 'portada_short'])
    expect(stepKinds('largo', 'textos')).toEqual(['descripcion', 'capitulos', 'etiquetas', 'comentario'])
    expect(stepKinds('short', 'textos')).toEqual(['descripcion', 'etiquetas', 'comentario'])
  })

  it('an empty piece cannot be approved; an empty comment can', () => {
    expect(emptyPiece('titulos', { candidates: [candidate('a')], main: null, alternatives: [] })).toBe(true)
    expect(emptyPiece('titulos', { candidates: [candidate('a')], main: 'a', alternatives: [] })).toBe(false)
    expect(emptyPiece('miniaturas', { concepts: [concept('m')], chosen: [] })).toBe(true)
    expect(emptyPiece('miniaturas', { concepts: [concept('m')], chosen: ['m'] })).toBe(false)
    expect(emptyPiece('portada_short', { blockId: null, moment: '  ', screenText: '' })).toBe(true)
    expect(emptyPiece('portada_short', { blockId: null, moment: 'El final', screenText: '' })).toBe(false)
    expect(emptyPiece('descripcion', { firstLines: ' ', body: 'algo', hashtags: [], fixedText: '' })).toBe(true)
    expect(emptyPiece('descripcion', { firstLines: 'Hola', body: '', hashtags: [], fixedText: '' })).toBe(false)
    expect(emptyPiece('capitulos', { chapters: [] })).toBe(true)
    expect(emptyPiece('capitulos', { chapters: [chapter('c')] })).toBe(false)
    expect(emptyPiece('etiquetas', { tags: [] })).toBe(true)
    expect(emptyPiece('etiquetas', { tags: ['pan'] })).toBe(false)
    expect(emptyPiece('comentario', { text: '' })).toBe(false)
  })
})
