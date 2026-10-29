import type { ApiErrorCode, FieldCode, Guard } from '@ytcreator/core/api'

// Web catalog, grouped by screen. Plain words, addressed as «tú» (principle I, glossary test).
// Placeholders use {name} and are filled with `format` from @ytcreator/ui.
export const es = {
  app: {
    name: 'YTCreator',
    loading: 'Cargando…',
    documentTitle: '{pantalla} · YTCreator',
    skipToContent: 'Saltar al contenido',
    notFoundTitle: 'Esta página no existe',
    notFoundBack: 'Ir al inicio',
    loadFailed: 'No se ha podido abrir YTCreator',
    retry: 'Volver a intentarlo',
  },

  // Labels of the registry descriptors (`labelKey` = ai.provider.*).
  ai: {
    provider: {
      claude_code: 'Tu suscripción de Claude',
      anthropic: 'Pago por uso de Anthropic',
    },
  },

  header: {
    settings: 'Ajustes',
    noAi: 'Sin IA conectada',
    close: 'Cerrar YTCreator',
    closeTitle: '¿Cerrar YTCreator?',
    closeBody: 'Lo que hayas guardado se queda guardado. Puedes volver a abrirlo cuando quieras.',
    closeConfirm: 'Sí, cerrar',
    closeCancel: 'Seguir usándolo',
    closed: 'YTCreator se ha cerrado. Puedes cerrar esta pestaña.',
    closeRetry: 'Volver a intentarlo',
  },

  wizard: {
    steps: { elegir: 'Elegir', conectar: 'Conectar', limites: 'Límites', listo: 'Listo' },
    notNeeded: 'no hace falta',
    later: 'Lo haré más tarde',
    back: 'Volver',
    privacy: 'Tus ideas y guiones se envían al servicio de IA que elijas.',
  },

  welcome: {
    title: 'Te damos la bienvenida a YTCreator',
    intro: 'YTCreator te acompaña desde la idea hasta el vídeo listo para publicar.',
    next: 'Vamos a conectar una IA. Son unos minutos.',
    needs:
      'Necesitas una suscripción de Claude o una cuenta de Anthropic con saldo. YTCreator no incluye una IA gratuita.',
    subscriptionLink: 'Ver las suscripciones de Claude',
    apiLink: 'Crear una cuenta de Anthropic',
    start: 'Empezar',
  },

  choose: {
    title: 'Elige cómo usar la IA',
    why: 'La IA es la que te propone ideas y guiones. Puedes cambiar de opción cuando quieras.',
    continue: 'Continuar',
    options: {
      suscripcion: {
        title: 'Usar mi suscripción de Claude',
        body: 'Para quien ya paga Claude Pro o Max. Sin coste extra.',
        recommended: 'Recomendado',
        responsibility: 'Usa tu suscripción, bajo tu responsabilidad',
        responsibilityHelp: 'YTCreator usa tu suscripción como lo harías tú; las condiciones de uso las pone Claude.',
      },
      pago_por_uso: {
        title: 'Pagar solo lo que uses',
        body: 'Con una clave de Anthropic. Pagas por cada uso, con límites que tú pones.',
      },
    },
  },

  connectSubscription: {
    title: 'Conecta tu suscripción de Claude',
    why: 'Así YTCreator puede usar tu suscripción sin pedirte la contraseña.',
    steps: {
      open: 'Abre la página de Claude con el botón de abajo.',
      approve: 'Entra con tu cuenta y aprueba el acceso.',
      copy: 'Copia el código que te muestra y pégalo aquí.',
    },
    openPage: 'Abrir la página de Claude',
    codeLabel: 'Código de Claude',
    connect: 'Conectar',
    newLink: 'Pedir un enlace nuevo',
    connecting: 'Conectando tu cuenta…',
    account: '{nombre} · {estado}',
    addAccount: 'Añadir otra cuenta',
    addAccountWhy: 'Si una se queda sin cupo, YTCreator usa la siguiente.',
    duplicate: 'Esta cuenta ya está conectada.',
    sameAccountNote:
      'YTCreator no puede saber si dos accesos son de la misma cuenta de Claude. Añade cada cuenta una sola vez.',
    continue: 'Continuar',
    repairing: 'Instalando Claude Code…',
    repair: 'Reparar',
  },

  connectApiKey: {
    title: 'Conecta tu clave de Anthropic',
    why: 'La clave es como una contraseña que deja a YTCreator usar tu cuenta de Anthropic. Se guarda solo en tu ordenador.',
    getKey: 'Conseguir mi clave',
    balanceNotice: 'Necesitas saldo en tu cuenta de Anthropic.',
    balanceLink: 'Ver mi saldo',
  },

  keyForm: {
    label: 'Tu clave',
    show: 'Mostrar la clave',
    hide: 'Ocultar la clave',
    save: 'Comprobar y guardar',
    checking: 'Comprobando tu clave…',
    saved: 'Clave guardada ••••{pista} · Funciona',
    continue: 'Continuar',
  },

  limits: {
    title: 'Pon tus límites de gasto',
    why: 'YTCreator nunca gastará más de lo que pongas aquí. Puedes cambiarlos cuando quieras.',
    perOperation: 'Por operación',
    perOperationHelp:
      'Lo máximo que puede costar una sola operación. Si una fuese a costar más, YTCreator no la hace y te avisa.',
    daily: 'Por día',
    dailyHelp: 'Lo máximo que puedes gastar en un día. Al llegar, YTCreator deja de usar la IA hasta el día siguiente.',
    monthly: 'Por mes',
    monthlyHelp:
      'Lo máximo que puedes gastar en un mes, hasta 1000 €. Al llegar, YTCreator deja de usar la IA hasta el mes siguiente.',
    euros: '€',
    proposed: 'Te proponemos estos límites. Puedes aceptarlos tal cual o cambiarlos.',
    save: 'Guardar límites',
    saved: 'Límites guardados',
  },

  done: {
    title: 'Todo listo',
    summary: 'Usas: {opcion}.',
    noExtraCost: 'Con esta opción no pagas nada extra en YTCreator.',
    goHome: 'Ir al inicio',
  },

  connectAi: {
    title: 'Conecta una IA',
    body: 'Aún no has conectado una IA. Sin ella, YTCreator no puede ayudarte a crear.',
    action: 'Conectar ahora',
  },

  home: {
    title: 'Inicio',
    body: 'Aquí empezarás tus canales y tus vídeos.',
    createChannel: 'Crear mi primer canal',
    comingTitle: 'Muy pronto',
    comingBody: 'Crear canales llegará en la próxima versión. Mientras, puedes revisar tu IA en Ajustes.',
    understood: 'Entendido',
    goSettings: 'Ir a Ajustes',
    noAi: 'No tienes ninguna IA conectada.',
    connectAi: 'Conectar una IA',
  },

  settings: {
    title: 'Ajustes',
    tabs: { ia: 'IA', general: 'General' },
  },

  aiSettings: {
    current: 'Opción en uso',
    lastCheck: 'Última comprobación: {cuando}',
    neverChecked: 'Aún no se ha comprobado',
    checkNow: 'Comprobar ahora',
    checking: 'Comprobando tu conexión…',
    switched: '{anterior} se ha quedado sin cupo. Ahora usas {siguiente}.',
    accounts: 'Cuentas de suscripción',
    accountName: 'Nombre de la cuenta',
    accountDefault: 'Cuenta {numero}',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    check: 'Comprobar',
    remove: 'Borrar',
    removeTitle: '¿Borrar {nombre}?',
    removeBody: 'YTCreator dejará de usar esta cuenta y olvidará su acceso.',
    reconnect: 'Volver a conectar',
    reconnectNote: 'Entra con la misma cuenta de Claude: YTCreator no puede comprobarlo.',
    accessInOtherRow: 'Ese acceso ya está en otra cuenta de la lista.',
    addAccount: 'Añadir otra cuenta',
    maxAccounts: 'Puedes conectar hasta 5 cuentas. Ya tienes 5.',
    savedKeys: 'Claves guardadas',
    savedKey: '••••{pista}',
    replace: 'Sustituir',
    removeKeyTitle: '¿Borrar esta clave?',
    removeKeyBody: 'YTCreator la borrará de tu ordenador. Si es la opción en uso, te quedarás sin IA conectada.',
    others: 'Otras opciones',
    useThis: 'Usar esta opción',
    configure: 'Configurar',
    limits: 'Límites de gasto',
    cancel: 'Cancelar',
  },

  generalSettings: {
    updates: 'Avisarme cuando haya una versión nueva',
    updatesHelp: 'YTCreator consulta una vez al día si hay versión nueva. No envía nada tuyo.',
    expert: 'Modo experto',
    timeout: 'Tiempo máximo de espera de la IA',
    timeoutHelp: 'En segundos, de 10 a 300. Déjalo vacío para usar el de la app.',
    seconds: 'segundos',
  },

  updateNotice: {
    body: 'Hay una versión nueva de YTCreator. Para instalarla, copia esta línea en la Terminal:',
    copy: 'Copiar',
    copied: 'Copiado',
    close: 'Cerrar aviso',
  },

  aiWork: {
    cancel: 'Cancelar',
  },

  status: {
    conectada: 'Funciona',
    sin_comprobar: 'Sin comprobar',
  },

  // Non-AI API errors (contracts/http-api.md); `ia` uses failures.es.ts.
  apiError: {
    validacion: 'Revisa los campos marcados.',
    conflicto: 'Algo ha cambiado en otra pestaña. Te llevamos al paso en el que estás.',
    no_encontrado: 'Eso ya no existe. Puede que lo hayas borrado en otra pestaña.',
    ia: 'La IA no ha podido hacerlo.',
    prohibido: 'YTCreator ha bloqueado esta acción por seguridad. Recarga la página.',
    interno:
      'Algo ha fallado dentro de YTCreator. Vuelve a intentarlo y, si sigue pasando, ciérralo y ábrelo otra vez.',
  } satisfies Record<ApiErrorCode, string>,

  // The request never reached YTCreator, or its answer made no sense.
  clientError: {
    red: 'No se puede hablar con YTCreator. Puede que esté cerrado: vuelve a abrirlo.',
    respuesta: 'Algo ha fallado dentro de YTCreator. Recarga la página.',
  },

  guard: {
    sin_conexion: 'Para esto necesitas conexión a internet.',
    sin_limites: 'Antes de pagar por uso, pon tus límites de gasto.',
    maximo_de_cuentas: 'Puedes conectar hasta 5 cuentas.',
  } satisfies Record<Guard, string>,

  field: {
    no_valido: 'Este valor no es válido.',
    longitud_no_valida: 'Es demasiado corto o demasiado largo.',
    debe_ser_positivo: 'Tiene que ser mayor que 0.',
    mayor_que_diario: 'No puede ser mayor que el límite por día.',
    mayor_que_mensual: 'No puede ser mayor que el límite por mes.',
    demasiado_alto: 'Es demasiado alto.',
  } satisfies Record<FieldCode, string>,
}

export type WebStrings = typeof es
