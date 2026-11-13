import { describe, expect, it } from 'vitest'
import { comparePieces } from '../../src/publish/compare.ts'
import type {
  ChaptersContent,
  DescriptionContent,
  TitleCandidate,
  ThumbnailConcept,
  TitlesContent,
} from '../../src/publish/model.ts'

const candidate = (id: string, text: string, extra: Partial<TitleCandidate> = {}): TitleCandidate => ({
  id,
  text,
  why: `Por qué ${id}`,
  blockId: 'b1',
  origin: 'ia',
  ...extra,
})
const titles = (candidates: TitleCandidate[], main: string | null = null, alternatives: string[] = []) =>
  ({ candidates, main, alternatives }) satisfies TitlesContent

const concept = (id: string, scene: string, extra: Partial<ThumbnailConcept> = {}): ThumbnailConcept => ({
  id,
  scene,
  bigText: 'SIN AMASAR',
  emotion: 'sorpresa',
  composition: 'cara a la izquierda',
  colors: 'ocre',
  titleId: null,
  origin: 'ia',
  ...extra,
})

const description = (extra: Partial<DescriptionContent> = {}): DescriptionContent => ({
  firstLines: 'Pan sin amasar.',
  body: 'El cuerpo.',
  hashtags: [],
  fixedText: 'Suscríbete.',
  ...extra,
})

const chapter = (id: string, title: string, extra: Partial<ChaptersContent['chapters'][number]> = {}) => ({
  id,
  title,
  blockIds: ['b1'],
  startSeconds: null,
  manual: false,
  ...extra,
})

const changes = (result: ReturnType<typeof comparePieces>) => result.changes.map(({ id, change }) => [id, change])

describe('comparePieces (US5)', () => {
  it('titles: new, removed and changed candidates, matched by id', () => {
    const result = comparePieces(
      'titulos',
      titles([candidate('t1', 'Pan sin amasar'), candidate('t2', 'Pan en 5 minutos')]),
      titles([candidate('t1', 'Pan sin amasar, crujiente'), candidate('t3', 'El truco del pan')]),
    )
    expect(changes(result)).toEqual([
      ['t1', 'cambiado'],
      ['t2', 'quitado'],
      ['t3', 'nuevo'],
    ])
    expect(result.changes[0]).toMatchObject({
      before: [{ field: 'title', value: 'Pan sin amasar' }],
      after: [{ field: 'title', value: 'Pan sin amasar, crujiente' }],
    })
  })

  it('titles: choosing another main title is a change of both candidates', () => {
    const both = [candidate('t1', 'Uno'), candidate('t2', 'Dos')]
    const result = comparePieces('titulos', titles(both, 't1', ['t2']), titles(both, 't2'))
    expect(result.changes).toMatchObject([
      { id: 't1', change: 'cambiado', before: [{ field: 'role', value: 'principal' }] },
      { id: 't2', change: 'cambiado', before: [{ field: 'role', value: 'alternativa' }] },
    ])
    // What is no longer chosen says so, empty: the screen writes «sin elegir».
    expect(result.changes[0]!.after).toEqual([{ field: 'role', value: '' }])
    expect(result.changes[1]!.after).toEqual([{ field: 'role', value: 'principal' }])
  })

  it('thumbnail ideas: what changed in one, and which ones are chosen', () => {
    const result = comparePieces(
      'miniaturas',
      { concepts: [concept('c1', 'El pan partido'), concept('c2', 'La masa')], chosen: ['c1'] },
      { concepts: [concept('c1', 'El pan partido', { bigText: '5 MIN' }), concept('c2', 'La masa')], chosen: [] },
    )
    expect(changes(result)).toEqual([
      ['c1', 'cambiado'],
      ['c2', 'igual'],
    ])
    expect(result.changes[0]!.before).toEqual([
      { field: 'bigText', value: 'SIN AMASAR' },
      { field: 'chosen', value: 'si' },
    ])
  })

  it('description: each part on its own', () => {
    const result = comparePieces(
      'descripcion',
      description({ hashtags: ['pan'] }),
      description({ body: 'Otro cuerpo.', hashtags: ['pan', 'receta'] }),
    )
    expect(changes(result)).toEqual([
      ['firstLines', 'igual'],
      ['body', 'cambiado'],
      ['hashtags', 'cambiado'],
      ['fixedText', 'igual'],
    ])
    expect(result.changes[2]!.after).toEqual([{ field: 'text', value: '#pan #receta' }])
  })

  it('description: a part that was empty is new, one emptied is removed', () => {
    const result = comparePieces('descripcion', description({ body: '' }), description({ firstLines: '' }))
    expect(changes(result)).toEqual([
      ['firstLines', 'quitado'],
      ['body', 'nuevo'],
      ['fixedText', 'igual'],
    ])
  })

  it('chapters: renamed, moved by hand, new and removed, and in another order', () => {
    const result = comparePieces(
      'capitulos',
      { chapters: [chapter('k1', 'Intro'), chapter('k2', 'La masa'), chapter('k3', 'El horno')] },
      {
        chapters: [
          chapter('k2', 'La masa', { startSeconds: 95, manual: true }),
          chapter('k1', 'Empezamos'),
          chapter('k4', 'Final'),
        ],
      },
    )
    expect(changes(result)).toEqual([
      ['k2', 'cambiado'],
      ['k1', 'cambiado'],
      ['k3', 'quitado'],
      ['k4', 'nuevo'],
    ])
    expect(result.changes[0]!.after).toEqual([{ field: 'start', value: '95' }])
    expect(result.orderChanged).toBe(true)
  })

  it('tags: only added and removed, whatever the case', () => {
    const result = comparePieces('etiquetas', { tags: ['pan', 'Receta', 'horno'] }, { tags: ['pan', 'receta', 'masa'] })
    expect(changes(result)).toEqual([
      ['pan', 'igual'],
      ['receta', 'igual'],
      ['horno', 'quitado'],
      ['masa', 'nuevo'],
    ])
    expect(result.orderChanged).toBe(false)
  })

  it('the cover of a Short and the comment, as one item each', () => {
    const cover = comparePieces(
      'portada_short',
      { blockId: 'b1', moment: 'El pan.', screenText: '' },
      { blockId: 'b2', moment: 'El pan.', screenText: 'SIN AMASAR' },
    )
    expect(cover.changes).toEqual([
      {
        id: 'portada_short',
        change: 'cambiado',
        title: '',
        fromAi: false,
        before: [
          { field: 'block', value: 'b1' },
          { field: 'screenText', value: '' },
        ],
        after: [
          { field: 'block', value: 'b2' },
          { field: 'screenText', value: 'SIN AMASAR' },
        ],
      },
    ])
    const comment = comparePieces('comentario', { text: '¿Lo has probado?' }, { text: '¿Lo has probado?' })
    expect(changes(comment)).toEqual([['comentario', 'igual']])
  })

  it('marks what the AI proposed: titles and ideas by who wrote each, the rest by its version (principle II)', () => {
    const result = comparePieces(
      'titulos',
      titles([candidate('t1', 'Uno')]),
      titles([candidate('t1', 'Uno'), candidate('t2', 'Mío', { origin: 'creador', why: '' })]),
      { older: true, current: false },
    )
    expect(result.changes.map(({ id, fromAi }) => [id, fromAi])).toEqual([
      ['t1', true],
      ['t2', false],
    ])
    const comment = (fromAi: { older: boolean; current: boolean }) =>
      comparePieces('comentario', { text: 'De la IA.' }, { text: 'Mío.' }, fromAi).changes[0]!.fromAi
    expect(comment({ older: true, current: false })).toBe(true)
    expect(comment({ older: false, current: false })).toBe(false)
  })

  it('the same version says nothing changed', () => {
    const same = titles([candidate('t1', 'Uno')], 't1')
    const result = comparePieces('titulos', same, same)
    expect(result.changes.every((one) => one.change === 'igual')).toBe(true)
    expect(result.orderChanged).toBe(false)
  })
})
