import { describe, expect, it } from 'vitest'
import {
  assembleDescription,
  descriptionSources,
  DESCRIPTION_TEXT,
  mentionsTitle,
} from '../../src/publish/description.ts'
import type { Fact, ScriptSource } from '../../src/script/model.ts'

const source = (extra: Partial<ScriptSource>): ScriptSource => ({
  id: Math.random().toString(36).slice(2),
  url: null,
  reference: null,
  title: '',
  accessedAt: '2026-11-10',
  link: null,
  ...extra,
})
const fact = (sources: ScriptSource[], origin: Fact['origin'] = 'ia'): Fact => ({
  id: Math.random().toString(36).slice(2),
  text: 'Un dato del guion.',
  label: 'una_fuente',
  origin,
  sources,
  alternatives: null,
})

describe('descriptionSources (research.md R4, SC-004)', () => {
  it('only links that open and references the creator wrote, each once', () => {
    const sources = descriptionSources([
      fact([
        source({ url: 'https://pan.example/masa', title: 'Masa madre', link: 'abre' }),
        source({ url: 'https://roto.example/x', title: 'Roto', link: 'no_abre' }),
        source({ url: 'https://sin.example/y', title: 'Sin mirar', link: 'sin_comprobar' }),
      ]),
      fact([source({ url: 'https://pan.example/masa/', title: 'Otra vez', link: 'abre' })]),
      fact([source({ reference: 'Libro «El pan», p. 12' })], 'creador'),
      fact([source({ reference: '  libro «el pan», p. 12 ' })], 'creador'),
    ])
    expect(sources).toEqual([
      { title: 'Masa madre', url: 'https://pan.example/masa', reference: null },
      { title: '', url: null, reference: 'Libro «El pan», p. 12' },
    ])
  })

  it('nothing without facts or without sources', () => {
    expect(descriptionSources([])).toEqual([])
    expect(descriptionSources([fact([source({ url: 'https://x.example', link: 'no_abre' })])])).toEqual([])
  })
})

describe('assembleDescription (research.md R5)', () => {
  const content = {
    firstLines: 'Pan sin amasar, en casa.',
    body: 'Te cuento el truco.',
    hashtags: ['pan', 'receta'],
    fixedText: 'Suscríbete.',
  }

  it('in order: first lines, body, chapters, sources, hashtags and the fixed part', () => {
    const text = assembleDescription(
      content,
      [
        { title: 'Empezamos', startSeconds: 0 },
        { title: 'El truco', startSeconds: 75 },
      ],
      [
        { title: 'Masa madre', url: 'https://pan.example/masa', reference: null },
        { title: '', url: null, reference: 'Libro «El pan»' },
      ],
    )
    expect(text).toBe(
      [
        'Pan sin amasar, en casa.',
        'Te cuento el truco.',
        '0:00 Empezamos\n1:15 El truco',
        `${DESCRIPTION_TEXT.sources}\n- Masa madre: https://pan.example/masa\n- Libro «El pan»`,
        '#pan #receta',
        'Suscríbete.',
      ].join('\n\n'),
    )
  })

  it('leaves out the empty parts', () => {
    expect(assembleDescription({ firstLines: 'Solo esto.', body: ' ', hashtags: [], fixedText: '' }, [], [])).toBe(
      'Solo esto.',
    )
  })

  it('a source without a title is its link alone', () => {
    expect(
      assembleDescription(
        { ...content, body: '', hashtags: [], fixedText: '' },
        [],
        [{ title: '', url: 'https://pan.example', reference: null }],
      ),
    ).toBe(`Pan sin amasar, en casa.\n\n${DESCRIPTION_TEXT.sources}\n- https://pan.example`)
  })
})

describe('mentionsTitle (FR-018)', () => {
  it('finds the long video named as it is, without minding accents, case or spaces', () => {
    expect(mentionsTitle('Lo cuento en «Pan sin amasar».', 'Pan sin amasar')).toBe(true)
    expect(mentionsTitle('lo cuento en PAN  SÍN amasar', 'Pan sin amasar')).toBe(true)
    expect(mentionsTitle('Una receta sencilla.', 'Pan sin amasar')).toBe(false)
    expect(mentionsTitle('Cualquier cosa', '  ')).toBe(false)
  })
})

describe('assembleDescription for a Short drawn from a long video (FR-018)', () => {
  const content = { firstLines: 'Pan en un minuto.', body: 'Un truco rápido.', hashtags: ['pan'], fixedText: '' }

  it('names the long video when the texts do not, without a link', () => {
    const text = assembleDescription(content, [], [], 'Pan sin amasar')
    expect(text).toBe('Pan en un minuto.\n\nUn truco rápido.\n\nVídeo completo: «Pan sin amasar»\n\n#pan')
  })

  it('adds nothing when the texts already name it, or there is no long video', () => {
    const named = { ...content, body: 'Lo cuento entero en «Pan sin amasar».' }
    expect(assembleDescription(named, [], [], 'Pan sin amasar')).not.toContain('Vídeo completo')
    expect(assembleDescription(content, [], [])).not.toContain('Vídeo completo')
  })
})
