// Domain values of channels and journeys (data-model.md of 003). Values in Spanish, like the 002.
export const CHANNEL_ORIGINS = ['nuevo', 'existente'] as const
export type ChannelOrigin = (typeof CHANNEL_ORIGINS)[number]

export const NAME_STATUSES = ['provisional', 'elegido'] as const
export type NameStatus = (typeof NAME_STATUSES)[number]

export const AUDIENCE_REGIONS = ['espana', 'latam', 'mixto'] as const
export type AudienceRegion = (typeof AUDIENCE_REGIONS)[number]

export const NEW_CHANNEL_STEPS = ['intereses', 'preguntas', 'nichos', 'ritmo', 'conceptos', 'nombres', 'hecho'] as const
export const EXISTING_CHANNEL_STEPS = ['enlace', 'confirmar', 'lectura', 'ritmo', 'posicionamiento', 'hecho'] as const
export type JourneyStep = (typeof NEW_CHANNEL_STEPS)[number] | (typeof EXISTING_CHANNEL_STEPS)[number]

export const JOURNEY_STATUSES = ['activo', 'terminado', 'abandonado'] as const
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number]

export const PROPOSAL_KINDS = [
  'preguntas',
  'nichos',
  'recomendacion',
  'conceptos',
  'nombres',
  'perfil_actual',
  'posicionamiento',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export const PROPOSAL_STATUSES = ['propuesta', 'aprobada', 'descartada'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const PROFILE_ORIGINS = ['ia', 'manual', 'restaurada'] as const
export type ProfileOrigin = (typeof PROFILE_ORIGINS)[number]

export const MEASURE_STATUSES = ['en_curso', 'medida', 'fallida'] as const
export type MeasureStatus = (typeof MEASURE_STATUSES)[number]

export type Level = 'alta' | 'media' | 'baja'
export type EntryLevel = 'abierta' | 'entreabierta' | 'cerrada'
export type Verdict = 'conviene' | 'con_reservas' | 'no_conviene'

export const SEMAPHORES = ['rojo', 'ambar', 'verde', 'sin_comprobar'] as const
export type Semaphore = (typeof SEMAPHORES)[number]
// What a name check stores: the port's answer, or `sin_comprobar` when the check failed.
export type StoredHandleStatus = 'libre' | 'ocupado' | 'sin_comprobar'
export type NameReason = 'handle_ocupado' | 'nombre_igual' | 'parecidos' | 'titulos_con_nombre' | 'largo' | 'fallo'

export const JOB_KINDS = ['medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia', 'actualizar_lector'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const JOB_STATUSES = ['en_curso', 'hecho', 'fallido', 'interrumpido'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export interface JobProgress {
  done: number
  total: number
}
