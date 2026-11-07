import type { ChannelUse } from '@ytcreator/core'

// What the fake answers for each channel use (contracts/ai-uses.md, «Pruebas»). Plain texts with no market figures,
// so the figure validator lets them through; the readings cite videos of `input`.
export type FakeOutputMode =
  | 'normal'
  | 'cifra_inventada'
  | 'salida_rota'
  | 'limite_de_gasto'
  // The idea bank (004, contracts/ai-uses.md, «Proveedor falso»).
  | 'ideas_repetidas'
  | 'pilar_invalido'

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
  monetization: { category: 'estilo_de_vida', assumptions: ['Público de España, con anuncios de alimentación.'] },
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

// The pillars of the profile sent, so the ideas name one of them (contracts/ai-uses.md, «Pilar»).
function pillarsOf(input: Record<string, unknown>): string[] {
  const profile = input.profile as { pillars?: unknown } | undefined
  const raw = Array.isArray(profile?.pillars) ? profile.pillars : []
  const names = raw
    .map((p) => (typeof p === 'string' ? p : (p as { title?: unknown })?.title))
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return names.length > 0 ? names : CONCEPT.pillars.map((p) => p.title)
}

function onlyShorts(input: Record<string, unknown>): boolean {
  const profile = input.profile as { rhythm?: { longPerWeek?: unknown } } | undefined
  return profile?.rhythm?.longPerWeek === 0
}

const IDEA_TITLES: readonly (readonly [string, string, string, string])[] = [
  [
    'Cena en quince minutos con lo que queda en la nevera',
    'cena rapida con sobras',
    'cenas rapidas',
    'quick dinner with leftovers',
  ],
  [
    'Tres tuppers para toda la semana en una tarde',
    'tuppers para toda la semana',
    'tupper semanal',
    'meal prep for the week',
  ],
  ['El error que hace que el arroz se pegue', 'arroz se pega error', 'cocinar arroz', 'why rice sticks to the pan'],
  [
    'Desayunos salados sin encender el horno',
    'desayunos salados sin horno',
    'desayunos rapidos',
    'savory breakfast no oven',
  ],
  ['Cómo cortar una cebolla sin llorar', 'cortar cebolla sin llorar', 'trucos de cocina', 'cut onion without crying'],
  ['Una salsa para cinco platos distintos', 'una salsa cinco platos', 'salsas caseras', 'one sauce five dishes'],
  [
    'Comer bien con lo que hay en una despensa básica',
    'recetas con despensa basica',
    'cocina basica',
    'pantry staples recipes',
  ],
  ['Legumbres que no parecen de abuela', 'legumbres recetas modernas', 'recetas de legumbres', 'modern legume recipes'],
]

function ideaDrafts(input: Record<string, unknown>, attempt: number, mode: FakeOutputMode) {
  const pillars = pillarsOf(input)
  const shorts = onlyShorts(input)
  const drafts = IDEA_TITLES.map(([title, query, broadQuery, queryEn], i) => ({
    title,
    hook: 'Lo que casi nadie cuenta y que cambia el resultado desde el primer intento.',
    pillar: pillars[i % pillars.length]!,
    format: shorts || i % 3 === 2 ? ('short' as const) : ('largo' as const),
    query,
    broadQuery,
    queryEn,
  }))
  // Every draft, so whichever slice a use takes fails first (ideas and otro_enfoque alike).
  if (mode === 'pilar_invalido' && attempt === 1) {
    drafts.forEach((draft, i) => (drafts[i] = { ...draft, pillar: 'Un tema que no es del canal' }))
  }
  if (mode === 'ideas_repetidas') {
    const avoid = (Array.isArray(input.avoid) ? input.avoid : []) as { title?: unknown }[]
    avoid.slice(0, 2).forEach((idea, i) => {
      if (typeof idea.title === 'string') drafts[i] = { ...drafts[i]!, title: idea.title }
    })
  }
  return drafts
}

function normal(
  use: ChannelUse,
  input: Record<string, unknown>,
  attempt = 1,
  mode: FakeOutputMode = 'normal',
): Record<string, unknown> {
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
        names: [
          'Mesa Sencilla',
          'Cuchara Viva',
          'Olla Clara',
          'Guiso Lento',
          'Comer sin Prisa',
          'Mantel Diario',
          'Platos Diarios',
        ].map((displayName) => ({
          displayName,
          handle: displayName.normalize('NFD').replace(/[^A-Za-z0-9]/g, ''),
          why: 'Corto y fácil de recordar.',
        })),
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
    case 'perfil_parte':
      return {
        promise: 'Cenas sencillas de diario, explicadas paso a paso para quien llega tarde a casa.',
        pillars: [
          { title: 'Cenas de diario', description: 'Platos sencillos con lo que suele haber en casa.' },
          { title: 'Para llevar', description: 'Comidas que aguantan bien en el tupper.' },
          { title: 'Trucos', description: 'Gestos de cocina que ahorran tiempo cada día.' },
        ],
        audienceDescription: 'Gente que trabaja fuera y quiere cenar bien sin complicarse.',
      }
    case 'ideas':
      return { ideas: ideaDrafts(input, attempt, mode) }
    case 'otro_enfoque': {
      const angles = ideaDrafts(input, attempt, mode === 'ideas_repetidas' ? 'normal' : mode)
        .slice(3, 6)
        .map((draft, i) => ({
          ...draft,
          title:
            ['Lo que nadie te cuenta de', 'La versión para principiantes de', 'El mismo plato en la mitad de tiempo:'][
              i
            ]! +
            ' ' +
            draft.title.toLocaleLowerCase('es'),
          why: 'Cambia a quién se dirige y qué promete, en vez de repetir lo que ya está hecho.',
        }))
      return { angles }
    }
    case 'busquedas_idea':
      return { query: 'cena rapida con sobras', broadQuery: 'cenas rapidas', queryEn: 'quick dinner with leftovers' }
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
    case 'perfil_parte':
      return { ...output, audienceDescription: add(output.audienceDescription as string) }
    case 'ideas': {
      const [first, ...rest] = output.ideas as { hook: string }[]
      return { ideas: [{ ...first, hook: add(first!.hook) }, ...rest] }
    }
    case 'otro_enfoque': {
      const [first, ...rest] = output.angles as { why: string }[]
      return { angles: [{ ...first, why: add(first!.why) }, ...rest] }
    }
    case 'busquedas_idea':
      return { ...output, broadQuery: 'cenas con 250.000 visitas' }
  }
}

// `attempt` counts the calls of one request: `pilar_invalido` fails the first and gives a valid second.
export function fakeChannelOutput(
  use: ChannelUse,
  input: Record<string, unknown>,
  mode: FakeOutputMode,
  attempt = 1,
): unknown {
  if (mode === 'salida_rota') return BROKEN_OUTPUT
  const output = normal(use, input, attempt, mode)
  return mode === 'cifra_inventada' ? invent(use, output) : output
}
