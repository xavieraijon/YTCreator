import { describe, expect, it } from 'vitest'
import { AI_USES, CHANNEL_OUTPUTS, conceptsEditedOutput } from '../../src/index.ts'

const concept = {
  promise: 'Recetas de 15 minutos para gente que vuelve tarde del trabajo',
  pillars: [
    { title: 'Cenas rápidas', description: 'Platos de diario' },
    { title: 'Táper', description: 'Comida para llevar' },
    { title: 'Compra lista', description: 'Qué comprar el domingo' },
  ],
  audience: { description: 'Adultos que trabajan', region: 'espana', madeForKids: false },
  format: { presence: 'voz', longForm: 'Vídeos de 8 a 12 minutos', shortsRole: 'Avance de cada receta' },
  cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
  monetization: { category: 'general', assumptions: ['Un vídeo largo por semana'] },
}

const valid = {
  preguntas: { questions: [{ id: 'q1', question: '¿Te gusta salir en cámara?', why: 'Cambia el formato' }] },
  nichos: {
    niches: Array.from({ length: 3 }, (_, i) => ({
      label: `Nicho ${i}`,
      summary: 'Resumen',
      queries: ['recetas rápidas'],
      whyItFits: 'Encaja con lo que te gusta',
    })),
  },
  conceptos: { concepts: [concept, concept] },
  nombres: {
    names: Array.from({ length: 6 }, (_, i) => ({
      displayName: `Cena Lista ${i}`,
      handle: `cenalista${i}`,
      why: 'Corto',
    })),
  },
  lectura_canal: {
    niche: { text: 'Cocina rápida', videoIds: ['abc'] },
    pillars: [{ text: 'Cenas', videoIds: ['abc'] }],
    audience: { text: 'Adultos', videoIds: ['abc'] },
    works: [{ text: 'Recetas de 10 minutos', videoIds: ['abc'] }],
    doesNotWork: [],
  },
  recomendacion: { recommendedLabel: 'Uno', why: 'Creo que encaja.', cautions: [] },
  posicionamiento: { ...concept, changes: [{ what: 'Más shorts', why: 'Funcionan mejor', videoIds: ['abc'] }] },
  perfil_parte: { promise: concept.promise, pillars: concept.pillars, audienceDescription: 'Adultos que trabajan' },
} as const

describe('AI uses of the 003', () => {
  it('every channel use is an AI use with its output schema', () => {
    for (const use of Object.keys(CHANNEL_OUTPUTS)) expect(AI_USES).toContain(use)
    expect(Object.keys(CHANNEL_OUTPUTS).sort()).toEqual(
      [
        'conceptos',
        'lectura_canal',
        'nichos',
        'nombres',
        'perfil_parte',
        'posicionamiento',
        'preguntas',
        'recomendacion',
        'ideas',
        'otro_enfoque',
        'busquedas_idea',
        'escaleta',
        'guion',
        'guion_short',
        'bloque_guion',
      ].sort(),
    )
  })

  it('accepts a valid sample of each use', () => {
    for (const [use, sample] of Object.entries(valid)) {
      const result = CHANNEL_OUTPUTS[use as keyof typeof CHANNEL_OUTPUTS].safeParse(sample)
      expect(result.success, use).toBe(true)
    }
  })

  it('rejects outputs out of their limits', () => {
    const q = { id: 'q', question: '¿?', why: 'x' }
    expect(CHANNEL_OUTPUTS.preguntas.safeParse({ questions: [q, q, q, q] }).success).toBe(false)
    expect(CHANNEL_OUTPUTS.nichos.safeParse({ niches: valid.nichos.niches.slice(0, 2) }).success).toBe(false)
    const noQueries = { ...valid.nichos.niches[0], queries: [] }
    expect(CHANNEL_OUTPUTS.nichos.safeParse({ niches: [noQueries, noQueries, noQueries] }).success).toBe(false)
    expect(CHANNEL_OUTPUTS.conceptos.safeParse({ concepts: [concept] }).success).toBe(false)
    const noAssumptions = { ...concept, monetization: { ...concept.monetization, assumptions: [] } }
    expect(CHANNEL_OUTPUTS.conceptos.safeParse({ concepts: [noAssumptions, concept] }).success).toBe(false)
    expect(CHANNEL_OUTPUTS.posicionamiento.safeParse({ ...noAssumptions, changes: [] }).success).toBe(false)
    expect(conceptsEditedOutput.safeParse({ concepts: [noAssumptions, concept] }).success).toBe(true)
    const longPromise = { ...concept, promise: 'x'.repeat(161) }
    expect(CHANNEL_OUTPUTS.conceptos.safeParse({ concepts: [longPromise, concept] }).success).toBe(false)
    const twoPillars = { ...concept, pillars: concept.pillars.slice(0, 2) }
    expect(CHANNEL_OUTPUTS.conceptos.safeParse({ concepts: [twoPillars, concept] }).success).toBe(false)
  })

  it('handles are 3–30 characters without @', () => {
    const withHandle = (handle: string) => ({
      names: valid.nombres.names.map((n, i) => (i === 0 ? { ...n, handle } : n)),
    })
    expect(CHANNEL_OUTPUTS.nombres.safeParse(withHandle('@cenalista')).success).toBe(false)
    expect(CHANNEL_OUTPUTS.nombres.safeParse(withHandle('ab')).success).toBe(false)
    expect(CHANNEL_OUTPUTS.nombres.safeParse(withHandle('a'.repeat(31))).success).toBe(false)
    expect(CHANNEL_OUTPUTS.nombres.safeParse(withHandle('cena.lista_es-1')).success).toBe(true)
  })

  it('a part of the profile keeps the limits of a concept (entry 115)', () => {
    const part = valid.perfil_parte
    expect(CHANNEL_OUTPUTS.perfil_parte.safeParse({ ...part, promise: 'x'.repeat(161) }).success).toBe(false)
    expect(CHANNEL_OUTPUTS.perfil_parte.safeParse({ ...part, pillars: part.pillars.slice(0, 2) }).success).toBe(false)
    expect(CHANNEL_OUTPUTS.perfil_parte.safeParse({ ...part, audienceDescription: ' ' }).success).toBe(false)
  })

  it('every point of a channel reading cites at least one video', () => {
    const noVideo = { ...valid.lectura_canal, works: [{ text: 'Algo', videoIds: [] }] }
    expect(CHANNEL_OUTPUTS.lectura_canal.safeParse(noVideo).success).toBe(false)
  })
})
