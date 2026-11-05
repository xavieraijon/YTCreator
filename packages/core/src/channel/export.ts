import type { ChannelReadingView, MeasureView, ReferenceChannelView } from '../api/channel.ts'
import type { ChannelOrigin, ProfileOrigin } from './model.ts'
import type { ChannelProfile, Source } from './profile.ts'

// The profile as files to keep outside the app (FR-026, R17): a document anyone can read and the same content as
// open data. It never calls the AI: it only puts in order what is already saved.

export interface ProfileExportInput {
  channel: {
    id: string
    origin: ChannelOrigin
    displayName: string | null
    handle: string | null
    youtubeChannelId: string | null
  }
  version: { version: number; origin: ProfileOrigin; createdAt: string; profile: ChannelProfile }
  // The measure behind the niche (new channels) and its reference channels.
  measure: MeasureView | null
  references: ReferenceChannelView[]
  // What was read of the channel (channels that already existed).
  reading: ChannelReadingView | null
  exportedAt: string
}

export type ExportFormat = 'md' | 'json'

const AI = 'Opinión de la IA'
const ESTIMATE = 'Estimación de YTCreator'

// A plain date is a day; a moment is shown in the local time of the machine, as the screens do.
function day(date: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) options.timeZone = 'UTC'
  return new Intl.DateTimeFormat('es-ES', options).format(new Date(date))
}
const number = (value: number) => new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(value)
const percent = (share: number) => Math.round(share * 100)
const youtube = (date: string) => `Dato de YouTube · ${day(date)}`
const knowledge = (source: Pick<Source, 'label' | 'date'>) => `${source.label} · revisado el ${day(source.date)}`

const PRESENCE = { cara: 'Saliendo en cámara', voz: 'Solo con tu voz', ninguna: 'Sin cara ni voz' } as const
const REGION = { espana: 'España', latam: 'Latinoamérica', mixto: 'España y Latinoamérica' } as const
const VERDICT = { conviene: 'Conviene', con_reservas: 'Con reservas', no_conviene: 'No conviene' } as const
const CONFIDENCE = { alta: 'alta', media: 'media', baja: 'baja' } as const
const WARNING = {
  infantil: 'Parece contenido para niños: YouTube paga mucho menos por él y limita los comentarios.',
  no_autentico: 'YouTube no paga por contenido repetitivo o hecho en serie. Tenlo presente si eliges este nicho.',
  solo_shorts: 'Un canal solo de Shorts gana mucho menos que uno con vídeos largos.',
} as const
const ORIGIN = {
  ia: 'Propuesta de la IA que aprobaste',
  manual: 'Cambiada por ti',
  restaurada: 'Recuperada de una anterior',
} as const

interface Section {
  readonly id: string
  readonly title: string
  readonly present: (input: ProfileExportInput) => boolean
}

// The sections of both files, in order: «Fuentes» always last.
export const EXPORT_SECTIONS: readonly Section[] = [
  { id: 'nombre', title: 'Nombre y @', present: () => true },
  { id: 'nicho', title: 'Nicho', present: () => true },
  { id: 'canal_hoy', title: 'Tu canal hoy', present: ({ version }) => version.profile.context !== null },
  { id: 'concepto', title: 'La idea del canal', present: () => true },
  { id: 'dinero', title: 'Lo que podría ganar', present: () => true },
  { id: 'avisos', title: 'Avisos', present: ({ version }) => version.profile.concept.warnings.length > 0 },
  { id: 'fuentes', title: 'Fuentes', present: () => true },
]

const presentSections = (input: ProfileExportInput) => EXPORT_SECTIONS.filter((section) => section.present(input))

function sectionData(id: string, input: ProfileExportInput): unknown {
  const { profile } = input.version
  switch (id) {
    case 'nombre':
      return profile.name
    case 'nicho':
      return { ...profile.niche, measure: input.measure, references: input.references }
    case 'canal_hoy':
      return { context: profile.context, reading: input.reading }
    case 'concepto': {
      const { promise, pillars, audience, format, cadence } = profile.concept
      return { promise, pillars, audience, format, cadence }
    }
    case 'dinero':
      return profile.concept.monetization
    case 'avisos':
      return profile.concept.warnings
    default:
      return profile.sources
  }
}

/** The open data: the whole profile, plus what backs its figures (data-model.md, «Exportación»). */
export function profileJson(input: ProfileExportInput) {
  const { channel, version, measure, references, reading, exportedAt } = input
  return {
    schemaVersion: 1 as const,
    exportedAt,
    channel,
    version: { number: version.version, origin: version.origin, createdAt: version.createdAt },
    profile: version.profile,
    sections: Object.fromEntries(presentSections(input).map(({ id }) => [id, sectionData(id, input)])),
    measures: measure ? [measure] : [],
    references,
    ...(reading ? { reading } : {}),
  }
}

function measureLines(measure: MeasureView): string[] {
  const date = measure.measuredAt ? ` (${youtube(measure.measuredAt)})` : ''
  const lines: string[] = []
  if (measure.verdict) lines.push(`- Resultado de la medida: ${VERDICT[measure.verdict]}${date}`)
  if (measure.demandMedianViews !== null) {
    lines.push(`- Un vídeo típico de este tema tiene ${number(measure.demandMedianViews)} visitas.${date}`)
  }
  if (measure.entryChannels !== null) {
    // The same caveats as the screen (NicheCard): the channels that could not count are said, not hidden.
    const hidden = measure.hiddenSubscribers
      ? measure.hiddenSubscribers === 1
        ? ' Un canal no enseña sus suscriptores y no cuenta aquí.'
        : ` ${number(measure.hiddenSubscribers)} canales no enseñan sus suscriptores y no cuentan aquí.`
      : ''
    const unread = measure.unreadChannels
      ? measure.unreadChannels === 1
        ? ' De un canal de los resultados no hemos mirado los suscriptores y no cuenta aquí.'
        : ` De ${number(measure.unreadChannels)} canales de los resultados no hemos mirado los suscriptores y no cuentan aquí.`
      : ''
    lines.push(
      `- ${number(measure.entryChannels)} canales de menos de 200.000 suscriptores tienen algún vídeo con más visitas que suscriptores.${hidden}${unread}${date}`,
    )
  }
  if (measure.concentration !== null) {
    lines.push(`- Los 3 canales con más visitas se llevan el ${percent(measure.concentration)} %.${date}`)
  }
  if (measure.recentVideos !== null) {
    // The reader only dates the newest videos, so its count can fall short, as the screen says.
    const partial =
      measure.source === 'ytdlp'
        ? ' YouTube solo nos da la fecha de los más nuevos: puede haber más.'
        : measure.recentShare !== null
          ? ` Son el ${percent(measure.recentShare)} % de los que tienen fecha.`
          : ''
    lines.push(`- ${number(measure.recentVideos)} vídeos publicados en los últimos 90 días.${partial}${date}`)
  }
  if (measure.sampleSize !== null) lines.push(`- Medido con ${number(measure.sampleSize)} vídeos largos.`)
  return lines
}

function referenceLines(references: readonly ReferenceChannelView[]): string[] {
  if (references.length === 0) return []
  return [
    '',
    '### Canales de referencia',
    '',
    ...references.map((reference) => {
      const handle = reference.handle ? ` (@${reference.handle})` : ''
      const best =
        reference.bestVideoTitle && reference.bestRatio !== null
          ? ` «${reference.bestVideoTitle}» tuvo ${number(reference.bestRatio)} veces lo normal en su canal.`
          : ''
      return `- ${reference.title}${handle}.${best} (${youtube(reference.fetchedAt)})`
    }),
  ]
}

function readingLines(reading: ChannelReadingView): string[] {
  const { long, short } = reading.summary
  const date = ` (${youtube(reading.fetchedAt)})`
  const listed = (title: string, videos: typeof long.best) =>
    videos.length === 0
      ? []
      : [
          '',
          `### ${title}`,
          '',
          ...videos.map(
            (video) => `- «${video.title}» tuvo ${number(video.ratio)} veces lo normal en tu canal.${date}`,
          ),
        ]
  return [
    `- Vídeos leídos: ${number(reading.summary.videosRead)}.${date}`,
    ...(reading.subscribers !== null ? [`- Suscriptores: ${number(reading.subscribers)}.${date}`] : []),
    ...(long.medianViews !== null
      ? [`- Un vídeo largo típico de tu canal tiene ${number(long.medianViews)} visitas.${date}`]
      : []),
    ...(short.medianViews !== null
      ? [`- Un Short típico de tu canal tiene ${number(short.medianViews)} visitas.${date}`]
      : []),
    ...listed('Los vídeos que mejor te han ido', [...long.best, ...short.best]),
    ...listed('Los vídeos que peor te han ido', [...long.worst, ...short.worst]),
  ]
}

function moneyLines(profile: ChannelProfile, sources: readonly Source[]): string[] {
  const money = profile.concept.monetization
  const rpm = sources.find((source) => source.id === 'rpm')
  const ypp = sources.find((source) => source.id === 'ypp')
  const by = (source: Source | undefined) => (source ? ` (${knowledge(source)})` : '')
  const { subscribers, watchHours, shortsViews } = money.yppRequirements
  return [
    money.monthlyEurRange
      ? `- De ${number(money.monthlyEurRange.min)} a ${number(money.monthlyEurRange.max)} € al mes con anuncios. (${ESTIMATE})`
      : '- Sin dato: no hay cifras con las que calcular cuánto al mes, así que no damos una cantidad.',
    ...(money.monthlyViewsAssumption
      ? [
          `- Supone de ${number(money.monthlyViewsAssumption.min)} a ${number(money.monthlyViewsAssumption.max)} visitas al mes. (${ESTIMATE})`,
        ]
      : []),
    `- Lo que ganas por cada 1.000 visitas: de ${number(money.rpmEurRange.min)} a ${number(money.rpmEurRange.max)} €.${by(rpm)}`,
    `- Fiabilidad de esta cifra: ${CONFIDENCE[money.confidence]}.`,
    `- El programa de socios de YouTube pide ${number(subscribers)} suscriptores y ${number(watchHours)} horas vistas en un año, o ${number(shortsViews)} visitas de Shorts en 90 días.${by(ypp)}`,
    ...(money.assumptions.length > 0
      ? ['', '### Lo que estamos suponiendo', '', ...money.assumptions.map((text) => `- ${text} (${AI})`)]
      : []),
  ]
}

/** The document anyone can read, with the same sections as the data and «Fuentes» at the end. */
export function profileMarkdown(input: ProfileExportInput): string {
  const { version, measure, references, reading, exportedAt } = input
  const { profile } = version
  const { concept, name, niche } = profile
  const body: Record<string, string[]> = {
    nombre: name.displayName
      ? [`- Nombre: ${name.displayName}`, ...(name.handle ? [`- La @ de tu canal: @${name.handle}`] : [])]
      : ['- Nombre por decidir.'],
    nicho: [
      `**${niche.label}**`,
      '',
      niche.summary,
      ...(measure ? ['', ...measureLines(measure)] : []),
      ...referenceLines(references),
    ],
    canal_hoy: [
      `${AI}:`,
      '',
      ...(profile.context?.currentProfile.split('\n').map((line) => `> ${line}`) ?? []),
      ...(reading ? ['', ...readingLines(reading)] : []),
    ],
    concepto: [
      `- Qué se lleva quien ve tus vídeos: ${concept.promise}`,
      '',
      '### Los temas del canal',
      '',
      ...concept.pillars.map((pillar) => `- **${pillar.title}**: ${pillar.description}`),
      '',
      '### Para quién es',
      '',
      `- ${concept.audience.description}`,
      `- Dónde está tu público: ${REGION[concept.audience.region]}`,
      ...(concept.audience.madeForKids ? ['- Está hecho para niños.'] : []),
      '',
      '### Cómo son los vídeos',
      '',
      `- ${PRESENCE[concept.format.presence]}`,
      `- Vídeos largos: ${concept.format.longForm}`,
      `- Los Shorts: ${concept.format.shortsRole}`,
      '',
      '### Cuánto publicar',
      '',
      `- ${number(concept.cadence.longPerWeek)} vídeos largos y ${number(concept.cadence.shortsPerWeek)} Shorts por semana, unas ${number(concept.cadence.hoursPerWeek)} horas en total.`,
    ],
    dinero: moneyLines(profile, profile.sources),
    avisos: concept.warnings.map((warning) => {
      const source = profile.sources.find((s) => s.id === warning.sourceId)
      return `- ${WARNING[warning.code]}${source ? ` (${knowledge(source)})` : ''}`
    }),
    fuentes: profile.sources.map((source) =>
      source.kind === 'youtube' ? `- ${source.label}: ${youtube(source.date)}` : `- ${knowledge(source)}`,
    ),
  }

  return [
    `# ${name.displayName ?? 'Mi canal'}`,
    '',
    `Perfil del canal exportado el ${day(exportedAt)} desde YTCreator. Versión ${version.version} (${ORIGIN[version.origin]}, ${day(version.createdAt)}).`,
    '',
    ...presentSections(input).flatMap(({ id, title }) => [`## ${title}`, '', ...(body[id] ?? []), '']),
  ].join('\n')
}

/** `perfil-<nombre>.md`, with only letters, digits and dashes. */
export function exportFileName(
  name: { displayName: string | null; handle: string | null },
  format: ExportFormat,
): string {
  const base = (name.displayName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `perfil-${base || 'de-mi-canal'}.${format}`
}
