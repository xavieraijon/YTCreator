import { describe, expect, it } from 'vitest'
import {
  AI_TITLE_MAX,
  descriptionOutputFor,
  partOutputFor,
  rejectWebAddresses,
  thumbnailsOutput,
  thumbnailsOutputFor,
  titlesOutput,
  titlesOutputFor,
} from '../../src/publish/outputs.ts'

const title = (text: string, blockId = 'b1') => ({ text, why: 'Promete lo que cuenta el vídeo.', blockId })
const titles = (count: number, blockId = 'b1') =>
  Array.from({ length: count }, (_, index) => title(`Título número ${index + 1}`, blockId))
const concept = (titleIndex: number) => ({
  scene: 'Una barra de pan partida por la mitad.',
  bigText: 'SIN AMASAR',
  emotion: 'Sorpresa',
  composition: 'El pan a la izquierda, la cara a la derecha.',
  colors: 'Marrón tostado sobre fondo azul.',
  titleIndex,
})

describe('rejectWebAddresses (research.md R4)', () => {
  it('finds an address in any text, however deep', () => {
    expect(rejectWebAddresses({ a: [{ b: 'mira https://otra.example' }] })).toBe(true)
    expect(rejectWebAddresses({ a: 'http://x.example' })).toBe(true)
    expect(rejectWebAddresses(['en www.pan.example'])).toBe(true)
    expect(rejectWebAddresses({ a: 'HTTPS://X.EXAMPLE' })).toBe(true)
  })

  it('lets plain text, numbers and empty values through', () => {
    expect(rejectWebAddresses({ a: 'Pan sin amasar en casa', n: 3, z: null, l: [] })).toBe(false)
  })
})

describe('titulos (contracts/ai-uses.md)', () => {
  it('from 5 to 8 in a long video, from 3 to 5 in a Short', () => {
    const long = titlesOutputFor('largo', ['b1'])
    const short = titlesOutputFor('short', ['b1'])
    expect(long.safeParse({ titles: titles(5) }).success).toBe(true)
    expect(long.safeParse({ titles: titles(8) }).success).toBe(true)
    expect(long.safeParse({ titles: titles(4) }).success).toBe(false)
    expect(long.safeParse({ titles: titles(9) }).success).toBe(false)
    expect(short.safeParse({ titles: titles(3) }).success).toBe(true)
    expect(short.safeParse({ titles: titles(5) }).success).toBe(true)
    expect(short.safeParse({ titles: titles(6) }).success).toBe(false)
  })

  it('each title fits YouTube, though what the creator writes may go further (decision 13)', () => {
    expect(AI_TITLE_MAX).toBe(100)
    const long = [...titles(4), title('x'.repeat(101))]
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: long }).success).toBe(false)
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: [...titles(4), title('x'.repeat(100))] }).success).toBe(
      true,
    )
  })

  it('each one points at a block of the approved script (research.md R8)', () => {
    expect(titlesOutputFor('largo', ['b1']).safeParse({ titles: titles(5, 'otro') }).success).toBe(false)
  })

  it('no web address anywhere', () => {
    const withAddress = [...titles(4), title('Mira www.pan.example')]
    expect(titlesOutput.safeParse({ titles: withAddress }).success).toBe(false)
  })
})

describe('miniaturas (contracts/ai-uses.md)', () => {
  it('exactly three, each for the main title or one of the alternatives', () => {
    const three = thumbnailsOutputFor(3)
    expect(three.safeParse({ concepts: [concept(0), concept(1), concept(2)] }).success).toBe(true)
    expect(three.safeParse({ concepts: [concept(0), concept(1)] }).success).toBe(false)
    expect(three.safeParse({ concepts: [concept(0), concept(0), concept(0), concept(0)] }).success).toBe(false)
    expect(three.safeParse({ concepts: [concept(0), concept(1), concept(3)] }).success).toBe(false)
  })

  it('only the titles there are: without alternatives, all for the main one', () => {
    expect(thumbnailsOutputFor(1).safeParse({ concepts: [concept(0), concept(0), concept(1)] }).success).toBe(false)
    expect(thumbnailsOutputFor(1).safeParse({ concepts: [concept(0), concept(0), concept(0)] }).success).toBe(true)
  })

  it('no web address anywhere', () => {
    const bad = { ...concept(0), scene: 'Como en https://otro.example' }
    expect(thumbnailsOutput.safeParse({ concepts: [bad, concept(0), concept(0)] }).success).toBe(false)
  })
})

const description = (extra: Record<string, unknown> = {}) => ({
  firstLines: 'Pan sin amasar en casa, crujiente y sin esfuerzo.',
  body: 'Te lo enseño paso a paso.',
  chapters: [
    { title: 'Empezamos', blockIds: ['b1'] },
    { title: 'El truco', blockIds: ['b2', 'b3'] },
  ],
  tags: ['pan', 'pan casero', 'receta'],
  comment: '¿Qué pan haces tú?',
  ...extra,
})

describe('descripcion (contracts/ai-uses.md)', () => {
  const schema = descriptionOutputFor(['b1', 'b2', 'b3'])

  it('chapters that cover every block, in order and once', () => {
    expect(schema.safeParse(description()).success).toBe(true)
    const missing = [{ title: 'Todo', blockIds: ['b1', 'b2'] }]
    const unordered = [
      { title: 'Uno', blockIds: ['b2'] },
      { title: 'Dos', blockIds: ['b1', 'b3'] },
    ]
    const repeated = [
      { title: 'Uno', blockIds: ['b1', 'b2'] },
      { title: 'Dos', blockIds: ['b2', 'b3'] },
    ]
    const unknown = [{ title: 'Uno', blockIds: ['b1', 'b2', 'b3', 'b4'] }]
    for (const chapters of [missing, unordered, repeated, unknown])
      expect(schema.safeParse(description({ chapters })).success).toBe(false)
  })

  it('without hashtags or web addresses', () => {
    expect(schema.safeParse(description({ body: 'Mira esto #pan' })).success).toBe(false)
    expect(schema.safeParse(description({ firstLines: '#receta de pan' })).success).toBe(false)
    expect(schema.safeParse(description({ comment: 'Más en www.pan.example' })).success).toBe(false)
    // A number sign that is not a hashtag goes through.
    expect(schema.safeParse(description({ body: 'El paso # 3 es el clave.' })).success).toBe(true)
  })

  it('a few tags, never none', () => {
    expect(schema.safeParse(description({ tags: [] })).success).toBe(false)
    expect(schema.safeParse(description({ tags: ['pan'] })).success).toBe(false)
  })

  it('no tag with a comma, and none twice: YouTube Studio splits them by commas', () => {
    expect(schema.safeParse(description({ tags: ['pan, casero', 'receta', 'masa'] })).success).toBe(false)
    expect(schema.safeParse(description({ tags: ['pan', 'receta', 'Pan'] })).success).toBe(false)
  })

  it('with the figures of YouTube: at least as many chapters as it needs, and tags that fit', () => {
    const rules = { chapterMinCount: 3, tagsMaxTotalChars: 30 }
    const strict = descriptionOutputFor(['b1', 'b2', 'b3'], rules)
    const three = ['b1', 'b2', 'b3'].map((id, index) => ({ title: `Parte ${index + 1}`, blockIds: [id] }))
    expect(strict.safeParse(description({ chapters: three })).success).toBe(true)
    const two = [
      { title: 'Uno', blockIds: ['b1', 'b2'] },
      { title: 'Dos', blockIds: ['b3'] },
    ]
    expect(strict.safeParse(description({ chapters: two })).success).toBe(false)
    // A script with fewer blocks than that gives what it can (decision 39).
    expect(
      descriptionOutputFor(['b1', 'b2'], rules).safeParse(
        description({
          chapters: [
            { title: 'Uno', blockIds: ['b1'] },
            { title: 'Dos', blockIds: ['b2'] },
          ],
        }),
      ).success,
    ).toBe(true)
    expect(
      strict.safeParse(description({ chapters: three, tags: ['pan casero', 'masa madre', 'receta de pan fácil'] }))
        .success,
    ).toBe(false)
    // YouTube adds quotes to a tag with spaces: 28 characters without them, 34 with them.
    expect(
      strict.safeParse(description({ chapters: three, tags: ['pan casero', 'masa madre', 'pan de'] })).success,
    ).toBe(false)
  })

  it('the pinned comment may be empty (decision 14)', () => {
    expect(schema.safeParse(description({ comment: '' })).success).toBe(true)
  })
})

describe('parte_paquete (contracts/ai-uses.md)', () => {
  const blocks = ['b1', 'b2']

  it('each part with its own schema', () => {
    expect(
      partOutputFor('descripcion', 'largo', blocks).safeParse({ firstLines: 'Hola.', body: 'Cuerpo.' }).success,
    ).toBe(true)
    expect(partOutputFor('etiquetas', 'largo', blocks).safeParse({ tags: ['a', 'b', 'c'] }).success).toBe(true)
    expect(partOutputFor('comentario', 'largo', blocks).safeParse({ comment: '¿Y tú?' }).success).toBe(true)
    expect(
      partOutputFor('capitulos', 'largo', blocks).safeParse({ chapters: [{ title: 'Todo', blockIds: ['b1', 'b2'] }] })
        .success,
    ).toBe(true)
    expect(
      partOutputFor('portada_short', 'short', blocks).safeParse({
        cover: { blockId: 'b2', moment: 'El pan partido.', screenText: 'YA' },
      }).success,
    ).toBe(true)
    // Another part's answer is not this one.
    expect(partOutputFor('etiquetas', 'largo', blocks).safeParse({ comment: '¿Y tú?' }).success).toBe(false)
  })

  it('hashtags only in a Short, up to three', () => {
    const withTags = (hashtags: string[]) => ({ firstLines: 'Hola.', body: 'Cuerpo.', hashtags })
    expect(partOutputFor('descripcion', 'largo', blocks).safeParse(withTags(['pan'])).success).toBe(false)
    expect(partOutputFor('descripcion', 'short', blocks).safeParse(withTags(['pan', 'receta'])).success).toBe(true)
    expect(partOutputFor('descripcion', 'short', blocks).safeParse(withTags(['a', 'b', 'c', 'd'])).success).toBe(false)
  })

  it('chapters that cover the script, a cover from a block of it, and no web addresses', () => {
    expect(
      partOutputFor('capitulos', 'largo', blocks).safeParse({ chapters: [{ title: 'Uno', blockIds: ['b1'] }] }).success,
    ).toBe(false)
    expect(
      partOutputFor('portada_short', 'short', blocks).safeParse({
        cover: { blockId: 'otro', moment: 'El pan.', screenText: '' },
      }).success,
    ).toBe(false)
    expect(partOutputFor('comentario', 'largo', blocks).safeParse({ comment: 'En https://pan.example' }).success).toBe(
      false,
    )
  })
})
