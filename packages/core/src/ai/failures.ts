// The five failure kinds fixed by the constitution, refined by a reason (research R13).
export const FAILURE_REASONS = {
  sin_sesion: ['clave_no_valida', 'sesion_caducada', 'sin_permiso', 'plan_sin_acceso', 'codigo_no_valido'],
  cupo_agotado: ['sin_saldo', 'limite_de_uso'],
  tiempo_agotado: ['respuesta_lenta'],
  contenido_filtrado: ['rechazo_del_modelo'],
  no_disponible: ['sin_conexion', 'servicio_caido', 'programa_no_instalado', 'llavero_no_disponible'],
} as const

export type FailureKind = keyof typeof FAILURE_REASONS
export type FailureReason = (typeof FAILURE_REASONS)[FailureKind][number]

export const FAILURE_KINDS = Object.keys(FAILURE_REASONS) as FailureKind[]

export interface AiFailure {
  kind: FailureKind
  reason: FailureReason
  resetsAt?: string // ISO
}

export const CONNECTION_STATUSES = ['sin_comprobar', 'conectada', ...FAILURE_KINDS] as const
export type ConnectionStatus = 'sin_comprobar' | 'conectada' | FailureKind

// Anything an adapter does not recognise (research R13).
export const UNKNOWN_FAILURE: AiFailure = { kind: 'no_disponible', reason: 'servicio_caido' }
