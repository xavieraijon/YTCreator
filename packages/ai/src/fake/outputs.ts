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
  // The script (005): the connection cannot search the internet.
  | 'sin_web'
  // ...or it searches and finds nothing reliable.
  | 'sin_resultados'
  // The publishing package (006): an answer that writes a web address, which never validates (research.md R4).
  | 'con_direccion'

// Reserved names (RFC 2606): nothing here can ever reach a real site. `createFakeLinkCheck` answers for them.
export const FAKE_LINKS = {
  first: 'https://fuente-uno.example/masa-madre',
  second: 'https://fuente-dos.example/fermentar',
  broken: 'https://enlace-roto.example/pagina',
  blocked: 'https://bloquea-robots.example/pagina',
  invented: 'https://inventada.example/nada',
} as const
// What the provider really saw: all of them but the invented one.
export const FAKE_SEEN_URLS: string[] = [FAKE_LINKS.first, FAKE_LINKS.second, FAKE_LINKS.broken, FAKE_LINKS.blocked]

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

// Fits the duration asked for, so the total shown is right.
function outline(input: Record<string, unknown>) {
  const seconds = Math.max(Math.round(Number(input.targetSeconds ?? 600) / 5), 1)
  const block = (type: string, title: string, purpose: string) => ({
    type,
    title,
    purpose,
    question: type === 'acto' ? '¿Qué pasa si lo haces al revés?' : null,
    reward: type === 'acto' ? 'Un truco que puedes usar hoy.' : null,
    bridge: type === 'cierre' ? null : 'Y aquí viene lo que nadie cuenta.',
    seconds,
  })
  return {
    blocks: [
      block('gancho', 'El error que comete casi todo el mundo', 'Que quien llega se quede a ver el resto.'),
      block('contexto', 'Por qué pasa esto', 'Que se entienda de qué va el vídeo.'),
      block('acto', 'Lo que hay que cambiar primero', 'Dar la primera solución.'),
      block('acto', 'El paso que marca la diferencia', 'Dar lo que no se encuentra en otro sitio.'),
      block('cierre', 'Qué hacer mañana', 'Que la persona sepa cómo seguir.'),
    ],
  }
}

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

// The ids of the blocks of the approved script the package uses get (`draft.blocks`).
// The blocks of the draft in the input; one stand-in when there is none (the contract batteries send no script).
const draftBlocks = (input: Record<string, unknown>) => {
  const ids = ((input['draft'] as { blocks?: { id: string }[] } | undefined)?.blocks ?? []).map((block) => block.id)
  return ids.length > 0 ? ids : ['bloque']
}
const CHAPTER_NAMES = ['Empezamos', 'Lo que necesitas', 'El truco', 'Paso a paso', 'El resultado', 'Para terminar']

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
    case 'escaleta':
      return outline(input)
    case 'guion': {
      const outlined = input.outline as { blocks: { id: string; title: string }[] } | undefined
      const blocks = outlined?.blocks ?? [{ id: 'bloque', title: 'Este bloque' }]
      return {
        blocks: blocks.map((block) => ({
          outlineBlockId: block.id,
          text: `Esto es lo que dirías en ${block.title.toLocaleLowerCase('es')}. Esta parte sale del guion, para que la leas en voz alta sin trabarte.`,
          visual: 'Tú, hablando a cámara.',
        })),
        claims: [{ outlineBlockId: blocks[0]!.id, text: 'Esta parte sale del guion', factId: null }],
      }
    }
    case 'guion_short':
      return {
        blocks: [
          { type: 'gancho', text: 'Mira lo que pasa aquí.', visual: 'Tú, muy cerca de la cámara.' },
          {
            type: 'desarrollo',
            text: 'Esta parte sale del guion, y la cuentas en voz alta sin trabarte.',
            visual: 'El plano del detalle.',
          },
          { type: 'cierre', text: 'Sigue viendo y te lo enseño entero.', visual: 'Tú, señalando abajo.' },
        ],
        claims: [{ type: 'desarrollo', text: 'Esta parte sale del guion', factId: null }],
      }
    case 'investigacion':
      if (mode === 'sin_resultados') return { facts: [] }
      return {
        facts: [
          {
            text: 'La masa madre fermenta mejor en un sitio templado.',
            label: 'comprobado',
            sources: [
              { url: FAKE_LINKS.first, title: 'Guía de fermentación' },
              { url: FAKE_LINKS.second, title: 'Manual de panadería' },
            ],
            alternatives: null,
          },
          {
            text: 'El pan de antes aguantaba toda la semana.',
            label: 'comprobado',
            sources: [
              { url: FAKE_LINKS.first, title: 'Guía de fermentación' },
              { url: FAKE_LINKS.broken, title: 'Página que ya no existe' },
              { url: FAKE_LINKS.blocked, title: 'Página que no deja entrar' },
            ],
            alternatives: null,
          },
          {
            text: 'Esta receta nació en un convento.',
            label: 'comprobado',
            sources: [{ url: FAKE_LINKS.invented, title: 'Enlace inventado' }],
            alternatives: 'Otra versión la sitúa en un molino.',
          },
        ],
      }
    case 'comprobar_guion': {
      const claims = Array.isArray(input.claims) ? (input.claims as { id: string; text: string }[]) : []
      const backed = [
        { url: FAKE_LINKS.first, title: 'Guía de fermentación' },
        { url: FAKE_LINKS.second, title: 'Manual de panadería' },
      ]
      return {
        checks: claims.map((claim, index) =>
          index === 0
            ? { claimId: claim.id, verdict: 'matizar', sources: backed, proposal: 'Una redacción con más cuidado' }
            : index === 1
              ? { claimId: claim.id, verdict: 'correcto', sources: backed, proposal: null }
              : {
                  claimId: claim.id,
                  verdict: 'correcto',
                  sources: [{ url: FAKE_LINKS.broken, title: 'Página que ya no existe' }],
                  proposal: null,
                },
        ),
      }
    }
    case 'enfoques_short': {
      const blocks = (input['blocks'] ?? []) as { id: string }[]
      const moment = (index: number) => blocks[index]?.id ?? 'bloque'
      return {
        angles: [
          {
            title: 'El error que arruina tu masa madre',
            hook: 'Si haces esto, tu pan no sube.',
            blockId: moment(0),
            why: 'Es lo que más sorprende del vídeo.',
          },
          {
            title: 'El truco de la temperatura',
            hook: 'Nadie te cuenta dónde dejar la masa.',
            blockId: moment(1),
            why: 'Se entiende en pocos segundos.',
          },
        ],
      }
    }
    case 'titulos': {
      const blocks = ((input['draft'] as { blocks?: { id: string }[] } | undefined)?.blocks ?? []).map(
        (block) => block.id,
      )
      const count = input['format'] === 'short' ? 3 : 5
      const texts = [
        'Pan sin amasar: el truco que nadie te cuenta',
        'Así sale el pan de verdad en casa',
        'El error que arruina tu pan casero',
        'Pan crujiente sin esfuerzo, paso a paso',
        'Lo que pasa si dejas la masa una noche',
      ]
      return {
        titles: texts.slice(0, count).map((text, index) => ({
          text,
          why: 'Promete lo que el vídeo cumple y despierta curiosidad.',
          blockId: blocks[index % Math.max(blocks.length, 1)] ?? 'bloque',
        })),
      }
    }
    case 'miniaturas': {
      const alternatives = Array.isArray(input['alternatives']) ? input['alternatives'].length : 0
      const index = (wanted: number) => Math.min(wanted, alternatives)
      return {
        concepts: [0, 1, 2].map((wanted) => ({
          scene: 'Una barra de pan recién hecha, partida por la mitad.',
          bigText: 'SIN AMASAR',
          emotion: 'Sorpresa',
          composition: 'El pan ocupa la mitad izquierda; la cara, la derecha.',
          colors: 'Dorado del pan sobre un fondo azul oscuro.',
          titleIndex: index(wanted),
        })),
      }
    }
    case 'descripcion': {
      const blocks = draftBlocks(input)
      return {
        firstLines: 'Pan sin amasar en casa: el truco para que salga crujiente sin esfuerzo.',
        body: 'Te enseño paso a paso cómo hacer pan casero sin amasar, con lo que tienes en la cocina.',
        chapters: blocks.map((id, index) => ({ title: CHAPTER_NAMES[index % CHAPTER_NAMES.length]!, blockIds: [id] })),
        tags: ['pan sin amasar', 'pan casero', 'receta de pan', 'pan crujiente', 'masa madre'],
        comment: '¿Cuál es el error que más te ha pasado haciendo pan en casa?',
      }
    }
    case 'parte_paquete': {
      const blocks = draftBlocks(input)
      const short = (input['idea'] as { format?: string } | undefined)?.format === 'short'
      // Without `part` (the contract batteries), the description: the part a figure can go in.
      switch (input['part'] ?? 'descripcion') {
        case 'descripcion':
          return {
            firstLines: 'Pan crujiente sin amasar: así lo hago en casa, sin máquina y sin esfuerzo.',
            body:
              typeof input['parentTitle'] === 'string'
                ? `Una receta sencilla; el vídeo «${input['parentTitle']}» lo cuenta entero.`
                : 'Una receta sencilla para tener pan casero cada semana.',
            ...(short ? { hashtags: ['pan', 'receta'] } : {}),
          }
        case 'capitulos':
          return {
            chapters: blocks.map((id, index) => ({ title: `Paso ${index + 1}`, blockIds: [id] })),
          }
        case 'etiquetas':
          return { tags: ['pan fácil', 'hacer pan en casa', 'pan sin máquina', 'receta casera'] }
        case 'comentario':
          return { comment: '¿Qué pan te gustaría que hiciéramos en el próximo vídeo?' }
        default:
          return {
            cover: { blockId: blocks[0]!, moment: 'El pan recién partido.', screenText: 'SIN AMASAR' },
          }
      }
    }
    case 'paquete_short': {
      const blocks = draftBlocks(input)
      const parent = typeof input['parentTitle'] === 'string' ? input['parentTitle'] : null
      return {
        titles: ['Pan en un minuto, sin amasar', 'El truco del pan que nadie te cuenta', 'Pan crujiente en casa'].map(
          (text, index) => ({
            text,
            why: 'Se entiende en pocos segundos.',
            blockId: blocks[index % Math.max(blocks.length, 1)] ?? 'bloque',
          }),
        ),
        firstLines: 'Pan sin amasar en un minuto: el truco para que salga crujiente.',
        body: parent ? `Lo cuento entero en mi vídeo «${parent}».` : 'Un truco rápido para tener pan casero.',
        hashtags: ['pan', 'receta', 'shorts'],
        tags: ['pan sin amasar', 'pan casero', 'receta rápida'],
        comment: '¿Lo vas a probar este fin de semana?',
        cover: {
          blockId: blocks[0] ?? 'bloque',
          moment: 'El pan recién partido, crujiente.',
          screenText: 'SIN AMASAR',
        },
      }
    }
    case 'bloque_guion':
      return {
        text: 'Este bloque está escrito de nuevo. Lo agradecen dos millones de personas.',
        visual: 'Un plano más cerca.',
        claims: [],
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
    case 'escaleta': {
      const [first, ...rest] = output.blocks as { purpose: string }[]
      return { blocks: [{ ...first, purpose: add(first!.purpose).slice(0, 300) }, ...rest] }
    }
    case 'guion':
    case 'guion_short': {
      const [first, ...rest] = output.blocks as { text: string }[]
      return { ...output, blocks: [{ ...first, text: add(first!.text) }, ...rest] }
    }
    case 'bloque_guion':
      return { ...output, text: add(output.text as string) }
    case 'enfoques_short': {
      const [first, ...rest] = output.angles as { hook: string }[]
      return { angles: [{ ...first, hook: add(first!.hook) }, ...rest] }
    }
    case 'investigacion': {
      const [first, ...rest] = output.facts as { text: string }[]
      return { facts: [{ ...first, text: add(first!.text) }, ...rest] }
    }
    case 'comprobar_guion':
      return { checks: [{ claimId: 'marca', verdict: 'sin_fuente', sources: [], proposal: add('Otra redacción.') }] }
    case 'titulos': {
      const [first, ...rest] = output.titles as { why: string }[]
      return { titles: [{ ...first, why: add(first!.why) }, ...rest] }
    }
    case 'miniaturas': {
      const [first, ...rest] = output.concepts as { scene: string }[]
      return { concepts: [{ ...first, scene: add(first!.scene) }, ...rest] }
    }
    case 'descripcion':
      return { ...output, body: add(output.body as string) }
    case 'paquete_short':
      return { ...output, body: add(output.body as string) }
    case 'parte_paquete':
      if (typeof output.body === 'string') return { ...output, body: add(output.body) }
      if (typeof output.comment === 'string') return { ...output, comment: add(output.comment) }
      return output
  }
}

const PACKAGE_USES: readonly ChannelUse[] = ['titulos', 'miniaturas', 'descripcion', 'parte_paquete', 'paquete_short']

// Puts a web address into the first text of a valid output (research.md R4).
function withAddress(output: Record<string, unknown>): Record<string, unknown> {
  const [key, value] = Object.entries(output)[0]!
  if (typeof value === 'string') return { ...output, [key]: `${value} Más en https://pan.example` }
  if (!Array.isArray(value)) return output
  const [first, ...rest] = value as Record<string, unknown>[]
  const [field, text] = Object.entries(first!).find(([, one]) => typeof one === 'string')!
  return { ...output, [key]: [{ ...first, [field]: `${String(text)} Más en https://pan.example` }, ...rest] }
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
  // Only the package refuses addresses: the uses before it are left as they are.
  if (mode === 'con_direccion') return PACKAGE_USES.includes(use) ? withAddress(output) : output
  return mode === 'cifra_inventada' ? invent(use, output) : output
}
