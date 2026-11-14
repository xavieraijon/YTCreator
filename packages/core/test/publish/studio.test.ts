import { describe, expect, it } from 'vitest'
import { isStudioKey, STUDIO_KEYS, studioChecklist, type StudioKnowledge } from '../../src/publish/studio.ts'

const STUDIO: StudioKnowledge = {
  madeForKids: { why: 'Marcarlo mal tiene consecuencias.' },
  synthetic: {
    rule: 'Hay que avisar del contenido realista hecho con IA.',
    mustDisclose: ['Una persona real que parece decir algo que no dijo'],
    noNeed: ['Usar IA para el guion'],
    question: '¿Has usado voz o imágenes realistas hechas con IA?',
  },
  language: {
    why: 'El idioma ayuda a YouTube.',
    byRegion: { espana: 'Español (España)', latam: 'Español (Latinoamérica)', mixto: 'Español' },
  },
  category: { why: 'La categoría ayuda.', suggested: { value: 'Educación' } },
}
const IMPLICATIONS = ['Sin anuncios personalizados', 'Sin comentarios']

describe('studioChecklist', () => {
  it('has the four settings of YouTube Studio, in order', () => {
    const items = studioChecklist({ audience: { madeForKids: false, region: 'espana' }, category: null }, STUDIO, [])
    expect(items.map((item) => item.key)).toEqual([...STUDIO_KEYS])
  })

  it('answers the audience from the profile, with the implications of made-for-kids.json as they are', () => {
    const [kids] = studioChecklist(
      { audience: { madeForKids: true, region: 'espana' }, category: null },
      STUDIO,
      IMPLICATIONS,
    )
    expect(kids).toEqual({
      key: 'publico_infantil',
      answer: true,
      why: STUDIO.madeForKids.why,
      implications: IMPLICATIONS,
    })
    // The same list, not a copy that could drift from the package.
    expect(kids?.key === 'publico_infantil' && kids.implications).toBe(IMPLICATIONS)
  })

  it('asks about synthetic content without an answer: the app cannot know', () => {
    const synthetic = studioChecklist(
      { audience: { madeForKids: false, region: 'latam' }, category: null },
      STUDIO,
      [],
    ).find((item) => item.key === 'contenido_sintetico')
    expect(synthetic).toMatchObject({ answer: null, question: STUDIO.synthetic.question, why: STUDIO.synthetic.rule })
  })

  it('gives the language variant of the region of the audience, as an assumption', () => {
    const language = (region: 'espana' | 'latam' | 'mixto') =>
      studioChecklist({ audience: { madeForKids: false, region }, category: null }, STUDIO, []).find(
        (item) => item.key === 'idioma',
      )
    expect(language('espana')).toMatchObject({ answer: 'Español (España)', assumption: true })
    expect(language('latam')).toMatchObject({ answer: 'Español (Latinoamérica)' })
    expect(language('mixto')).toMatchObject({ answer: 'Español' })
  })

  it('gives the category the channel chose, or the suggested one marked as an assumption', () => {
    const category = (chosen: string | null) =>
      studioChecklist({ audience: { madeForKids: false, region: 'espana' }, category: chosen }, STUDIO, []).find(
        (item) => item.key === 'categoria',
      )
    expect(category(null)).toMatchObject({ answer: 'Educación', assumption: true })
    expect(category('Ciencia y tecnología')).toMatchObject({ answer: 'Ciencia y tecnología', assumption: false })
  })

  it('knows only its own keys', () => {
    expect(isStudioKey('idioma')).toBe(true)
    expect(isStudioKey('subir_video')).toBe(false)
  })
})
