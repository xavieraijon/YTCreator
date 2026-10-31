import type { FAILURE_REASONS, FailureKind } from '@ytcreator/core'

// What the button does; the screen decides how (link, route or call).
export type FailureActionId =
  | 'conseguir_clave'
  | 'volver_a_conectar'
  | 'abrir_consola'
  | 'elegir_otra_opcion'
  | 'pedir_enlace'
  | 'anadir_saldo'
  | 'anadir_cuenta'
  | 'cambiar_de_opcion'
  | 'comprobar'
  | 'reparar'

export interface FailureAction {
  id: FailureActionId
  label: string
}

// What happened, what to do and the button to do it (principle I, FR-027, contracts/ui-screens.md).
export interface FailureText {
  status: string // short state next to the option or account
  statusUntil?: string // the same with {fecha} when the failure has `resetsAt`
  what: string
  whatUntil?: string
  todo: string
  actions: readonly FailureAction[]
}

// One text per kind + reason: a missing combination does not compile.
export type FailureCatalog = {
  [K in FailureKind]: { [R in (typeof FAILURE_REASONS)[K][number]]: FailureText }
}

const comprobar: FailureAction = { id: 'comprobar', label: 'Comprobar ahora' }
const elegirOtra: FailureAction = { id: 'elegir_otra_opcion', label: 'Elegir otra opción' }

export const failuresEs: FailureCatalog = {
  sin_sesion: {
    clave_no_valida: {
      status: 'Clave no válida',
      what: 'La clave no es válida.',
      todo: 'Revisa que la has copiado entera o crea una nueva.',
      actions: [{ id: 'conseguir_clave', label: 'Conseguir una clave nueva' }],
    },
    sesion_caducada: {
      status: 'Sesión caducada',
      what: 'La sesión de tu suscripción ha caducado.',
      todo: 'Vuelve a conectar la cuenta.',
      actions: [{ id: 'volver_a_conectar', label: 'Volver a conectar' }],
    },
    sin_permiso: {
      status: 'Sin permiso',
      what: 'Tu clave no tiene permiso para usar este servicio.',
      todo: 'Revisa los permisos de la clave en la consola.',
      actions: [{ id: 'abrir_consola', label: 'Abrir la consola' }],
    },
    plan_sin_acceso: {
      status: 'Tu plan no lo incluye',
      what: 'Tu plan de Claude no incluye Claude Code.',
      todo: 'Necesitas Claude Pro o Max, o elige otra opción.',
      actions: [elegirOtra],
    },
    codigo_no_valido: {
      status: 'Código no válido',
      what: 'El código no es válido o ha caducado.',
      todo: 'Pulsa «Pedir otro código», copia el código nuevo que te muestre Claude y pégalo en el mismo sitio.',
      actions: [{ id: 'pedir_enlace', label: 'Pedir otro código' }],
    },
  },
  cupo_agotado: {
    sin_saldo: {
      status: 'Sin saldo',
      what: 'Tu cuenta de Anthropic no tiene saldo.',
      todo: 'Añade saldo y vuelve a comprobar.',
      actions: [{ id: 'anadir_saldo', label: 'Añadir saldo' }],
    },
    limite_de_uso: {
      status: 'Sin cupo',
      statusUntil: 'Sin cupo hasta el {fecha}',
      what: 'Has llegado al límite de uso.',
      whatUntil: 'Has llegado al límite de uso hasta el {fecha}.',
      todo: 'Espera a esa hora, añade otra cuenta o cambia de opción.',
      actions: [
        { id: 'anadir_cuenta', label: 'Añadir otra cuenta' },
        { id: 'cambiar_de_opcion', label: 'Cambiar de opción' },
      ],
    },
  },
  tiempo_agotado: {
    respuesta_lenta: {
      status: 'No respondió a tiempo',
      what: 'La IA no ha respondido a tiempo.',
      todo: 'Puede estar saturada. Vuelve a intentarlo dentro de un rato.',
      actions: [comprobar],
    },
  },
  contenido_filtrado: {
    rechazo_del_modelo: {
      status: 'Respuesta bloqueada',
      what: 'La IA no ha querido responder.',
      todo: 'Cambia la petición.',
      actions: [],
    },
  },
  no_disponible: {
    sin_conexion: {
      status: 'Sin conexión',
      what: 'No hay conexión a internet.',
      todo: 'Revisa tu conexión.',
      actions: [comprobar],
    },
    servicio_caido: {
      status: 'Servicio caído',
      what: 'El servicio de IA no está funcionando ahora.',
      todo: 'Suele arreglarse solo. Prueba más tarde.',
      actions: [comprobar],
    },
    programa_no_instalado: {
      status: 'Falta Claude Code',
      what: 'Falta Claude Code en tu ordenador.',
      todo: 'YTCreator puede instalarlo por ti.',
      actions: [{ id: 'reparar', label: 'Reparar' }],
    },
    llavero_no_disponible: {
      status: 'Llavero bloqueado',
      what: 'No se puede abrir el llavero del sistema.',
      todo: 'Desbloquea tu sesión y vuelve a probar.',
      actions: [comprobar],
    },
  },
}
