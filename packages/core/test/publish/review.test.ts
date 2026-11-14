import { describe, expect, it } from 'vitest'
import type {
  ChaptersContent,
  DescriptionContent,
  TagsContent,
  ThumbnailsContent,
  TitlesContent,
} from '../../src/publish/model.ts'
import {
  repeatsTitle,
  reviewPackage,
  warningNotices,
  type PackageReviewFigures,
  type PackageReviewInput,
} from '../../src/publish/review.ts'

// The figures of publish/youtube.json and publish/craft.json, as the server sends them.
const FIGURES: PackageReviewFigures = {
  titleMaxChars: 100,
  mobileTitleChars: 70,
  descriptionMaxChars: 5000,
  tagsMaxTotalChars: 500,
  chapterMinCount: 3,
  chapterMinSeconds: 10,
  hashtagsShown: 3,
}

const titles = (main: string, ...alternatives: string[]): TitlesContent => ({
  candidates: [main, ...alternatives].map((text, index) => ({
    id: `t${index}`,
    text,
    why: '',
    blockId: null,
    origin: 'ia' as const,
  })),
  main: 't0',
  alternatives: alternatives.map((_, index) => `t${index + 1}`),
})
const thumbnails = (bigText: string): ThumbnailsContent => ({
  concepts: [
    { id: 'c1', scene: 'Una escena', bigText, emotion: '', composition: '', colors: '', titleId: 't0', origin: 'ia' },
  ],
  chosen: ['c1'],
})
const description = (extra: Partial<DescriptionContent> = {}): DescriptionContent => ({
  firstLines: 'Lo que cuenta el vídeo.',
  body: 'Más detalles.',
  hashtags: [],
  fixedText: 'Suscríbete',
  ...extra,
})
const chapters = (count: number): ChaptersContent => ({
  chapters: Array.from({ length: count }, (_, index) => ({
    id: `ch${index}`,
    title: `Parte ${index}`,
    blockIds: [`b${index}`],
    startSeconds: null,
    manual: false,
  })),
})
const tags = (...list: string[]): TagsContent => ({ tags: list })

// A long video that passes every rule: the base the tests change one thing at a time.
const clean = (extra: Partial<PackageReviewInput> = {}): PackageReviewInput => ({
  format: 'largo',
  pieces: {
    titulos: titles('Cómo ahorrar luz en casa'),
    miniaturas: thumbnails('Factura a la mitad'),
    descripcion: description(),
    capitulos: chapters(3),
    etiquetas: tags('ahorro', 'luz'),
    comentario: { text: '' },
  },
  chapters: [
    { id: 'ch0', startSeconds: 0 },
    { id: 'ch1', startSeconds: 60 },
    { id: 'ch2', startSeconds: 120 },
  ],
  scriptSeconds: 300,
  assembled: 'Lo que cuenta el vídeo.',
  ...extra,
})
const withPieces = (pieces: PackageReviewInput['pieces'], extra: Partial<PackageReviewInput> = {}) =>
  clean({ pieces: { ...clean().pieces, ...pieces }, ...extra })
const rules = (input: PackageReviewInput) => reviewPackage(input, FIGURES).map((notice) => notice.rule)

describe('reviewPackage', () => {
  it('says nothing of a package that passes every rule; the pinned comment may be empty', () => {
    expect(reviewPackage(clean(), FIGURES)).toEqual([])
  })

  it('warns of a title over the maximum of YouTube, with its length and the limit', () => {
    const notices = reviewPackage(withPieces({ titulos: titles('a'.repeat(110)) }), FIGURES)
    expect(notices).toEqual([
      { rule: 'titulo_largo', kind: 'titulos', value: 110, limit: 100, titleId: 't0', blocking: false },
    ])
  })

  it('warns of a title cut on a phone, and of an alternative too, but not twice for one title', () => {
    const notices = reviewPackage(withPieces({ titulos: titles('a'.repeat(80), 'b'.repeat(75)) }), FIGURES)
    expect(notices.map((notice) => [notice.rule, notice.titleId])).toEqual([
      ['titulo_movil', 't0'],
      ['titulo_movil', 't1'],
    ])
  })

  it('counts characters, not code units: an emoji is one', () => {
    expect(rules(withPieces({ titulos: titles('🔥'.repeat(70)) }))).toEqual([])
  })

  it('warns of an assembled description over the maximum', () => {
    const notices = reviewPackage(clean({ assembled: 'x'.repeat(5001) }), FIGURES)
    expect(notices).toEqual([
      { rule: 'descripcion_larga', kind: 'descripcion', value: 5001, limit: 5000, blocking: false },
    ])
  })

  it('warns of chapters YouTube would not show: without 0:00, fewer than 3, or a short one', () => {
    expect(
      rules(
        clean({
          chapters: [
            { id: 'ch0', startSeconds: 5 },
            { id: 'ch1', startSeconds: 60 },
            { id: 'ch2', startSeconds: 120 },
          ],
        }),
      ),
    ).toEqual(['capitulos_sin_cero'])
    expect(
      rules(
        withPieces(
          { capitulos: chapters(2) },
          {
            chapters: [
              { id: 'ch0', startSeconds: 0 },
              { id: 'ch1', startSeconds: 60 },
            ],
          },
        ),
      ),
    ).toEqual(['capitulos_pocos'])
    const short = reviewPackage(
      clean({
        chapters: [
          { id: 'ch0', startSeconds: 0 },
          { id: 'ch1', startSeconds: 60 },
          { id: 'ch2', startSeconds: 65 },
        ],
      }),
      FIGURES,
    )
    expect(short).toEqual([
      { rule: 'capitulo_corto', kind: 'capitulos', value: 5, limit: 10, chapterId: 'ch1', blocking: false },
    ])
  })

  it('measures the last chapter against where the script ends', () => {
    const notices = reviewPackage(clean({ scriptSeconds: 125 }), FIGURES)
    expect(notices.map((notice) => [notice.rule, notice.chapterId, notice.value])).toEqual([
      ['capitulo_corto', 'ch2', 5],
    ])
  })

  it('warns of tags over 500 characters in all, counted with their commas', () => {
    const list = Array.from({ length: 50 }, (_, index) => `etiqueta${String(index).padStart(2, '0')}`)
    const notices = reviewPackage(withPieces({ etiquetas: tags(...list) }), FIGURES)
    expect(notices).toEqual([{ rule: 'etiquetas_largas', kind: 'etiquetas', value: 549, limit: 500, blocking: false }])
    // 45 tags of 10 characters and 44 commas: 494.
    expect(rules(withPieces({ etiquetas: tags(...list.slice(0, 45)) }))).toEqual([])
  })

  it('counts the quotes YouTube adds to the tags with spaces', () => {
    // 49 tags of 9 characters with a space: 11 each with quotes, and 48 commas: 587.
    const list = Array.from({ length: 49 }, (_, index) => `pan ${String(index).padStart(5, '0')}`)
    expect(reviewPackage(withPieces({ etiquetas: tags(...list) }), FIGURES)[0]).toMatchObject({
      rule: 'etiquetas_largas',
      value: 587,
    })
  })

  it('warns of more than 3 hashtags in a Short', () => {
    const short: PackageReviewInput = {
      format: 'short',
      pieces: {
        titulos: titles('Un truco de ahorro'),
        portada_short: { blockId: 'b0', moment: 'El enchufe', screenText: '' },
        descripcion: description({ hashtags: ['a', 'b', 'c', 'd'] }),
        etiquetas: tags('ahorro'),
        comentario: { text: '' },
      },
      chapters: [],
      scriptSeconds: 40,
      assembled: 'Corto',
    }
    expect(reviewPackage(short, FIGURES)).toEqual([
      { rule: 'hashtags_muchos', kind: 'descripcion', value: 4, limit: 3, blocking: false },
    ])
  })

  it('warns when the fixed part is missing', () => {
    expect(rules(withPieces({ descripcion: description({ fixedText: '  ' }) }))).toEqual(['sin_parte_fija'])
  })

  it('warns of a thumbnail whose big text shares more than half of its words with the main title', () => {
    expect(rules(withPieces({ miniaturas: thumbnails('Ahorrar luz') }))).toEqual(['miniatura_repite_titulo'])
    // Half is not more than half.
    expect(rules(withPieces({ miniaturas: thumbnails('Ahorrar mucho') }))).toEqual([])
    // Without words, there is nothing to repeat.
    expect(rules(withPieces({ miniaturas: thumbnails('') }))).toEqual([])
  })

  it('compares words without accents, case or punctuation', () => {
    expect(repeatsTitle('¡CÓMO AHORRAR!', 'Como ahorrar luz')).toBe(true)
    expect(repeatsTitle('Factura', 'Como ahorrar luz')).toBe(false)
  })

  it('stops the approval only for an empty piece, and names it', () => {
    const notices = reviewPackage(
      withPieces({ etiquetas: tags(), capitulos: null }, { chapters: [], assembled: 'x'.repeat(5001) }),
      FIGURES,
    )
    expect(notices.filter((notice) => notice.blocking).map((notice) => notice.kind)).toEqual(['capitulos', 'etiquetas'])
    expect(warningNotices(notices).map((notice) => notice.rule)).toEqual(['descripcion_larga'])
  })

  it('does not ask a Short for chapters or thumbnails; a comment never made is a missing piece, as in the server', () => {
    const short: PackageReviewInput = {
      format: 'short',
      pieces: { titulos: titles('Un truco'), descripcion: description(), etiquetas: tags('a'), comentario: null },
      chapters: [],
      scriptSeconds: 30,
      assembled: 'Corto',
    }
    expect(reviewPackage(short, FIGURES).map((notice) => [notice.rule, notice.kind])).toEqual([
      ['pieza_vacia', 'portada_short'],
      ['pieza_vacia', 'comentario'],
    ])
  })

  it('reviews a package of 30 chapters in less than a second (SC-007)', () => {
    const many = withPieces(
      { capitulos: chapters(30), titulos: titles('a'.repeat(150), 'b'.repeat(80)) },
      {
        chapters: Array.from({ length: 30 }, (_, index) => ({ id: `ch${index}`, startSeconds: index * 3 })),
        scriptSeconds: 100,
        assembled: 'x'.repeat(6000),
      },
    )
    const started = performance.now()
    const notices = reviewPackage(many, FIGURES)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(notices.filter((notice) => notice.rule === 'capitulo_corto')).toHaveLength(29)
  })
})
