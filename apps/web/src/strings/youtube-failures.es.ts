import type { YouTubeFailureCode } from '@ytcreator/core'

export type YouTubeFailureAction = 'volver_a_intentar' | 'ir_a_ajustes' | 'revisar_enlace' | 'esperar'

export interface YouTubeFailureText {
  readonly what: string
  readonly action: YouTubeFailureAction
}

// What each failure of the YouTube reader says and what the screen offers (contracts/ui-screens.md).
export const youtubeFailuresEs: Record<YouTubeFailureCode, YouTubeFailureText> = {
  sin_datos: {
    what: 'No hemos encontrado datos suficientes para medir este tema.',
    action: 'volver_a_intentar',
  },
  no_encontrado: {
    what: 'No hemos encontrado ese canal. Revisa que el enlace o la @ estén bien escritos.',
    action: 'revisar_enlace',
  },
  bloqueado: {
    what: 'YouTube nos ha pedido que esperemos un poco antes de seguir leyendo.',
    action: 'volver_a_intentar',
  },
  cupo_agotado: {
    what: 'Tu clave de YouTube ha llegado a su límite de hoy. Mañana volverá a funcionar.',
    action: 'esperar',
  },
  tiempo_agotado: {
    what: 'YouTube ha tardado demasiado en contestar.',
    action: 'volver_a_intentar',
  },
  no_disponible: {
    what: 'No hemos podido usar el lector de YouTube. Desde Ajustes puedes prepararlo o actualizarlo.',
    action: 'ir_a_ajustes',
  },
}

export const youtubeFailureActionsEs: Record<YouTubeFailureAction, string> = {
  volver_a_intentar: 'Volver a intentarlo',
  ir_a_ajustes: 'Ir a Ajustes',
  revisar_enlace: 'Revisar el enlace',
  esperar: 'Entendido',
}
