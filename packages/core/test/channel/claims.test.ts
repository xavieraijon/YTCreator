import { describe, expect, it } from 'vitest'
import { checkClaims, claimsFeedback, parseFigures, parseTimesNormal, trimClaims } from '../../src/index.ts'

const input = {
  measure: { medianViews: 12_345, topShare: 0.42, recentVideos: 18 },
  knowledge: { rpm: { min: 1.5, max: 4 } },
  videos: [
    { videoId: 'abc', views: 3_200 },
    { videoId: 'def', views: 900 },
  ],
}

describe('figures in free text', () => {
  it('reads Spanish numbers with their unit', () => {
    expect(parseFigures('La mediana es de 12.345 visitas y el 42 % de las visitas.')).toEqual([12_345, 42])
    expect(parseFigures('Unos 12 mil suscriptores, 1,5 millones de vistas y 2,5 €')).toEqual([12_000, 1_500_000, 2.5])
  })

  it('ignores numbers that are not market figures', () => {
    expect(parseFigures('Recetas de 15 minutos, 3 pilares y 2 vídeos a la semana.')).toEqual([])
  })
})

describe('times the normal of a channel', () => {
  const reading = { videos: [{ videoId: 'abc', ratio: 3.24 }] }

  it('is a figure, however small', () => {
    expect(parseTimesNormal('Tuvo 3,2 veces lo normal en su canal.')).toEqual([3.2])
    expect(parseTimesNormal('Tuvo 3 veces más de lo normal y 2,5 veces por encima de lo normal.')).toEqual([3, 2.5])
    expect(parseTimesNormal('Publica 2 veces por semana.')).toEqual([])
  })

  it('has to be in the data', () => {
    expect(checkClaims({ text: 'Tuvo 3,2 veces lo normal.' }, reading)).toEqual([])
    expect(checkClaims({ text: 'Tuvo 50 veces lo normal.' }, reading)).toHaveLength(1)
    // It has to be the ratio of a video, not any number that happens to match.
    const others = { videos: [{ videoId: 'a', ratio: 0.5, views: 50, durationSeconds: 600 }] }
    expect(checkClaims({ text: 'Tuvo 50 veces lo normal.' }, others)).toHaveLength(1)
    expect(checkClaims({ text: 'Ganarás 600 € al mes.' }, others)).toHaveLength(1)
  })
})

describe('checkClaims', () => {
  it('passes figures that are in the input, with rounding tolerance', () => {
    const output = {
      summary: 'La mediana ronda las 12.000 visitas y los 3 primeros canales se llevan el 42 % de las visitas.',
    }
    expect(checkClaims(output, input)).toEqual([])
  })

  it('detects a figure that is not in the input', () => {
    const output = { summary: 'Es un buen nicho. Los vídeos tienen 80.000 visitas de media.' }
    expect(checkClaims(output, input)).toEqual([
      { path: 'summary', text: 'Los vídeos tienen 80.000 visitas de media.', reason: 'cifra_sin_respaldo' },
    ])
  })

  it('detects a point that cites a video that is not in the input', () => {
    const output = {
      works: [
        { text: 'Los tutoriales', videoIds: ['abc'] },
        { text: 'Los directos', videoIds: ['zzz'] },
      ],
    }
    expect(checkClaims(output, input)).toEqual([{ path: 'works.1', text: 'Los directos', reason: 'video_inexistente' }])
  })

  it('turns the violations into the message for the retry', () => {
    const feedback = claimsFeedback([{ path: 'summary', text: 'Tienen 80.000 visitas.', reason: 'cifra_sin_respaldo' }])
    expect(feedback).toContain('Tienen 80.000 visitas.')
  })
})

describe('«X veces lo normal» (decisions.md, entry 58)', () => {
  const videos = { videos: [{ videoId: 'a', ratio: 3.2 }] }

  it.each([
    'Tuvo 50 veces lo normal.',
    'Tuvo 50 veces tu media.',
    'Tuvo 50 veces lo habitual.',
    'Tuvo 50 veces más que la media.',
    'Tuvo el triple de lo normal.',
    'Tuvo el doble de su media.',
    'Tuvo cinco veces lo normal.',
    'Tuvo 1.000 veces lo normal.',
  ])('«%s», with nothing behind it, is flagged and taken away', (text) => {
    expect(checkClaims({ text }, videos)).toHaveLength(1)
    const { output, trimmed } = trimClaims({ text: `Va bien. ${text}` }, videos)
    expect(trimmed).toBe(true)
    expect(output).toEqual({ text: 'Va bien.' })
  })

  it('the ratio of a video stays, in figures or close to it in words', () => {
    expect(checkClaims({ text: 'Tuvo 3,2 veces lo normal.' }, videos)).toEqual([])
    expect(checkClaims({ text: 'Tuvo el triple de lo normal.' }, { videos: [{ videoId: 'a', ratio: 3 }] })).toEqual([])
    expect(checkClaims({ text: 'Tuvo tres veces lo normal.' }, { videos: [{ videoId: 'a', ratio: 3 }] })).toEqual([])
    // A ratio of 1 does not back a thousand.
    expect(checkClaims({ text: 'Tuvo 1.000 veces lo normal.' }, { videos: [{ videoId: 'a', ratio: 1 }] })).toHaveLength(
      1,
    )
  })

  it('how often something is done is not a figure of the reading', () => {
    expect(checkClaims({ text: 'Publica 2 veces por semana.' }, videos)).toEqual([])
    expect(checkClaims({ text: 'Es el doble de trabajo.' }, videos)).toEqual([])
    for (const text of ['Publica 2 veces normalmente.', 'Graba 2 veces media hora.', 'Es el doble de media hora.']) {
      expect(checkClaims({ text }, videos)).toEqual([])
    }
  })
})

describe('trimClaims', () => {
  describe('the assumptions behind the money stay visible (FR-014)', () => {
    const unbacked = 'Supone 80.000 visitas al mes.'
    const concept = (promise: string, assumptions: string[]) => ({ promise, monetization: { assumptions } })

    it('losing some of them keeps the concept', () => {
      const output = { concepts: [concept('A', ['Es estable.', unbacked])] }
      expect(trimClaims(output, input).output).toEqual({ concepts: [concept('A', ['Es estable.'])] })
    })

    it('losing all of them takes the concept away, as there is no way to show it', () => {
      const output = { concepts: [concept('A', [unbacked]), concept('B', ['Es estable.'])] }
      expect(trimClaims(output, input).output).toEqual({ concepts: [concept('B', ['Es estable.'])] })
    })

    it('outside a list, it leaves an empty text for the schema to reject', () => {
      expect(trimClaims(concept('A', [unbacked]), input).output).toEqual(concept('A', ['']))
    })

    it('a concept written without assumptions is left alone', () => {
      const output = { concepts: [concept('A', []), concept('B', [unbacked])] }
      expect(trimClaims(output, input).output).toEqual({ concepts: [concept('A', [])] })
    })
  })

  it('an item of a list that loses its only sentence goes away, whole', () => {
    const output = {
      assumptions: ['Es un tema estable.', 'Supone 80.000 visitas al mes.'],
      cautions: [
        { label: 'A', why: 'Supone 80.000 visitas al mes.' },
        { label: 'B', why: 'Hay pocos canales.' },
      ],
    }
    expect(trimClaims(output, input).output).toEqual({
      assumptions: ['Es un tema estable.'],
      cautions: [{ label: 'B', why: 'Hay pocos canales.' }],
    })
  })

  it('drops the failing sentences and marks the output as trimmed', () => {
    const output = {
      summary: 'Es un buen nicho. Los vídeos tienen 80.000 visitas de media.',
      works: [
        { text: 'Los tutoriales', videoIds: ['abc'] },
        { text: 'Los directos', videoIds: ['zzz'] },
      ],
    }
    const result = trimClaims(output, input)
    expect(result.trimmed).toBe(true)
    expect(result.output).toEqual({
      summary: 'Es un buen nicho.',
      works: [{ text: 'Los tutoriales', videoIds: ['abc'] }],
    })
    expect(checkClaims(result.output, input)).toEqual([])
  })

  it('leaves a clean output untouched', () => {
    const output = { summary: 'Unas 3.200 visitas en el mejor vídeo.' }
    expect(trimClaims(output, input)).toEqual({ output, trimmed: false })
  })
})

describe('figures checked only in some fields (004, contracts/ai-uses.md)', () => {
  const output = {
    ideas: [{ title: 'Cómo llegar a 1.000 suscriptores', hook: 'Este tema mueve 250.000 visitas al mes.' }],
  }

  it('a title may name a figure as its topic; the hook may not', () => {
    expect(checkClaims(output, {}, ['hook']).map((v) => v.path)).toEqual(['ideas.0.hook'])
    expect(checkClaims(output, {}, []).length).toBe(0)
  })

  it('trims only the fields it checks', () => {
    const { output: trimmed, trimmed: was } = trimClaims(
      { title: 'Llegar a 1.000 suscriptores', why: 'Uno. Mueve 250.000 visitas.' },
      {},
      ['why'],
    )
    expect(was).toBe(true)
    expect(trimmed).toEqual({ title: 'Llegar a 1.000 suscriptores', why: 'Uno.' })
  })

  it('keeps an item whose empty text was already empty, and drops one that the trimming empties', () => {
    const { output } = trimClaims(
      {
        concepts: [
          { scene: 'Una cocina.', bigText: '' },
          { scene: 'Mueve 250.000 visitas.', bigText: 'YA' },
        ],
      },
      {},
      ['scene'],
    )
    expect(output).toEqual({ concepts: [{ scene: 'Una cocina.', bigText: '' }] })
  })
})
