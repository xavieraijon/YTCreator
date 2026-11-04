import { describe, expect, it } from 'vitest'
import { checkClaims, claimsFeedback, parseFigures, trimClaims } from '../../src/index.ts'

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

describe('trimClaims', () => {
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
