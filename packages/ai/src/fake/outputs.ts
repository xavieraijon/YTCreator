import type { ChannelUse } from '@ytcreator/core'

// What the fake answers for each channel use (contracts/ai-uses.md, «Pruebas»). Plain texts with no market figures,
// so the figure validator lets them through; the readings cite videos of `input`.
export type FakeOutputMode = 'normal' | 'cifra_inventada' | 'salida_rota' | 'limite_de_gasto'

export const INVENTED_SENTENCE = 'Este tema mueve 250.000 visitas al mes.'
export const INVENTED_VIDEO_ID = 'video-inventado'
// Fails every channel schema.
export const BROKEN_OUTPUT = { roto: true }

const CONCEPT = {
  promise: 'Recetas de diario explicadas paso a paso para gente con poco tiempo.',
  pillars: [
    { title: 'Cenas rápidas', description: 'Platos de veinte minutos con lo que hay en la nevera.' },
    { title: 'Cocina de tupper', description: 'Comidas para llevar al trabajo que aguantan bien.' },
    { title: 'Básicos', description: 'Técnicas sencillas que sirven para muchas recetas.' },
  ],
  audience: { description: 'Gente joven que empieza a cocinar en casa.', region: 'espana', madeForKids: false },
  format: {
    presence: 'voz',
    longForm: 'Vídeos de diez minutos con la receta entera.',
    shortsRole: 'Un truco por short.',
  },
  cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
  monetization: { assumptions: ['Público de España, con anuncios de alimentación.'] },
}

function videoIdsOf(input: Record<string, unknown>): string[] {
  const ids: string[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'videoId' && typeof item === 'string') ids.push(item)
        else visit(item)
      }
    }
  }
  visit(input)
  return ids.length > 0 ? ids : ['vid-1']
}

function normal(use: ChannelUse, input: Record<string, unknown>): Record<string, unknown> {
  const ids = videoIdsOf(input).slice(0, 2)
  switch (use) {
    case 'preguntas':
      return {
        questions: [
          {
            id: 'tiempo',
            question: '¿Cuánto tiempo tienes para cocinar entre semana?',
            why: 'Para ajustar las recetas.',
          },
          { id: 'camara', question: '¿Te apetece salir en cámara?', why: 'Cambia el tipo de vídeo.' },
        ],
      }
    case 'nichos':
      return {
        niches: [
          {
            label: 'Cocina rápida',
            summary: 'Recetas en veinte minutos.',
            queries: ['recetas rapidas'],
            whyItFits: 'Te gusta cocinar sin complicarte.',
          },
          {
            label: 'Cocina de tupper',
            summary: 'Comidas para llevar.',
            queries: ['tupper para el trabajo'],
            whyItFits: 'Encaja con tu día a día.',
          },
          {
            label: 'Cocina barata',
            summary: 'Comer bien gastando poco.',
            queries: ['recetas baratas', 'menu semanal barato'],
            whyItFits: 'Te interesa ahorrar.',
          },
        ],
      }
    case 'recomendacion': {
      const niches = (input.niches ?? []) as { label: string; verdict: string | null }[]
      const measured = niches.filter((n) => n.verdict !== null)
      const best = measured.find((n) => n.verdict === 'conviene') ?? measured[0] ?? niches[0]
      return {
        recommendedLabel: best?.label ?? 'Cocina rápida',
        why: 'Creo que es el que mejor une lo que te gusta con lo que se ve en YouTube.',
        cautions: measured
          .filter((n) => n.verdict === 'no_conviene')
          .map((n) => ({ label: n.label, why: 'A mi juicio te costaría mucho conseguir visitas.' })),
      }
    }
    case 'conceptos':
      return {
        concepts: [
          CONCEPT,
          { ...CONCEPT, promise: 'Comidas de tupper que se preparan el domingo para toda la semana.' },
        ],
      }
    case 'nombres':
      return {
        names: ['Cocina Corta', 'Tupper Fácil', 'Fogón Rápido', 'Plato Diario', 'Receta Ya', 'Sartén Libre'].map(
          (displayName) => ({
            displayName,
            handle: displayName.normalize('NFD').replace(/[^A-Za-z0-9]/g, ''),
            why: 'Corto y fácil de recordar.',
          }),
        ),
      }
    case 'lectura_canal':
      return {
        niche: { text: 'Recetas rápidas de diario.', videoIds: ids },
        pillars: [{ text: 'Cenas en poco tiempo.', videoIds: ids }],
        audience: { text: 'Gente que cocina entre semana.', videoIds: ids },
        works: [{ text: 'Los títulos con el tiempo de la receta.', videoIds: ids }],
        doesNotWork: [{ text: 'Los vídeos largos sin receta.', videoIds: ids }],
      }
    case 'posicionamiento':
      return {
        ...CONCEPT,
        changes: [{ what: 'Centrar el canal en cenas rápidas.', why: 'Es lo que mejor funciona.', videoIds: ids }],
      }
  }
}

// Puts an invented figure (and, in a reading, a video that is not in `input`) into a valid output.
function invent(use: ChannelUse, output: Record<string, unknown>): Record<string, unknown> {
  const add = (text: string) => `${text} ${INVENTED_SENTENCE}`
  switch (use) {
    case 'preguntas': {
      const [first, ...rest] = output.questions as { why: string }[]
      return { questions: [{ ...first, why: add(first!.why) }, ...rest] }
    }
    case 'nichos': {
      const [first, ...rest] = output.niches as { summary: string }[]
      return { niches: [{ ...first, summary: add(first!.summary) }, ...rest] }
    }
    case 'recomendacion':
      return { ...output, why: add(output.why as string) }
    case 'conceptos': {
      const [first, ...rest] = output.concepts as { promise: string }[]
      return { concepts: [{ ...first, promise: add(first!.promise).slice(0, 160) }, ...rest] }
    }
    case 'nombres': {
      const [first, ...rest] = output.names as { why: string }[]
      return { names: [{ ...first, why: add(first!.why) }, ...rest] }
    }
    case 'lectura_canal': {
      const niche = output.niche as { text: string }
      const works = output.works as unknown[]
      return {
        ...output,
        niche: { ...niche, text: add(niche.text) },
        works: [...works, { text: 'Los directos.', videoIds: [INVENTED_VIDEO_ID] }],
      }
    }
    case 'posicionamiento':
      return { ...output, promise: add(output.promise as string).slice(0, 160) }
  }
}

export function fakeChannelOutput(use: ChannelUse, input: Record<string, unknown>, mode: FakeOutputMode): unknown {
  if (mode === 'salida_rota') return BROKEN_OUTPUT
  const output = normal(use, input)
  return mode === 'cifra_inventada' ? invent(use, output) : output
}
