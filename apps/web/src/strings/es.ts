import type { AiUse } from '@ytcreator/core'
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
    newTab: '(se abre en otra pestaña)',
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
    closed:
      'YTCreator se ha cerrado. Puedes cerrar esta pestaña. Para volver, ábrelo como cualquier otra aplicación de tu ordenador (en Mac, desde Launchpad).',
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
      'Necesitas una suscripción de Claude Pro o Max (también vale una cuenta de Anthropic con saldo, en «Más opciones»). YTCreator no incluye una IA gratuita.',
    subscriptionLink: 'Ver las suscripciones de Claude',
    start: 'Empezar',
  },

  choose: {
    title: 'Elige cómo usar la IA',
    why: 'La IA es la que te propone ideas y guiones. Puedes cambiar de opción cuando quieras.',
    continue: 'Continuar',
    more: 'Más opciones',
    options: {
      suscripcion: {
        title: 'Usar mi suscripción de Claude',
        body: 'Para quien ya paga Claude Pro o Max. Sin coste extra.',
        recommended: 'Recomendado',
        responsibility: 'Usa tu suscripción, bajo tu responsabilidad',
        responsibilityHelp:
          'Quiere decir que YTCreator usa tu cuenta de Claude como la usarías tú, con las normas de uso de Claude.',
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
      copy: 'Copia el código que te muestra y vuelve aquí para pegarlo.',
    },
    openPage: 'Abrir la página de Claude',
    codeHelp: 'Claude te muestra el código al aprobar el acceso.',
    reopenPage: 'Volver a abrir la página de Claude',
    codeLabel: 'Código de Claude',
    codeMissing: 'Pega aquí el código que te ha dado Claude.',
    connect: 'Conectar',
    newLink: 'Pedir otro código',
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
    steps: {
      open: 'Abre la página de Anthropic con «Conseguir mi clave» y entra con tu cuenta.',
      create: 'Pulsa «Create Key» (crear clave), ponle un nombre cualquiera, como «YTCreator», y confírmalo.',
      copy: 'Copia el texto largo que empieza por «sk-ant-» y pégalo abajo. Anthropic solo lo enseña una vez.',
    },
    balanceNotice: 'Necesitas saldo en tu cuenta de Anthropic.',
    balanceLink: 'Ver mi saldo',
  },

  keyForm: {
    label: 'Tu clave',
    missing: 'Pega aquí tu clave. Es el texto largo que empieza por «sk-ant-».',
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
      'Una operación es cada encargo que le haces a la IA, como pedirle ideas para vídeos o que escriba un guion. Suelen costar céntimos: unas ideas, 1 o 2 céntimos; un guion largo, entre 10 y 20, más o menos. Si una fuese a costar más de lo que pongas aquí, YTCreator no la hace y te avisa.',
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
    noAi: 'No tienes ninguna IA conectada.',
    connectAi: 'Conectar una IA',
    resumeChannel: 'Tienes un canal a medias.',
    resume: 'Seguir con mi canal',
    channelReady: 'Tu canal ya tiene tema e idea.',
    noNameYet: 'Tu canal ya tiene tema e idea. Te falta elegir el nombre.',
    channelNamed: '{nombre} ya tiene tema, idea y nombre.',
    openChannel: 'Ver mi canal',
  },

  settings: {
    title: 'Ajustes',
    tabs: { ia: 'IA', youtube: 'YouTube', consumo: 'Consumo', general: 'General' },
  },

  youtubeSettings: {
    why: 'YTCreator lee YouTube para medir nichos, comprobar nombres y leer tu canal. No te cuesta dinero.',
    inUse: {
      ytdlp: 'Ahora leemos YouTube con el lector de YouTube.',
      data_api: 'Ahora leemos YouTube con tu clave de YouTube.',
      fake: 'Ahora leemos YouTube con el lector de YouTube.',
    },
    // Novice audit 003, M5: the reader is the one to use but it is not prepared, so nothing reads YouTube yet.
    inUseNoReader: 'Leeremos YouTube con el lector de YouTube en cuanto esté preparado.',
    source: '¿Cómo leemos YouTube?',
    sourceOptions: {
      auto: 'Automático',
      ytdlp: 'Siempre con el lector de YouTube',
      data_api: 'Siempre con mi clave de YouTube',
    },
    sourceHelp: {
      auto: 'Con tu clave si tienes una y funciona; si no, con el lector. Es lo recomendado.',
      ytdlp: 'No usa tu clave aunque la tengas.',
      data_api: 'Si se acaba lo que tu clave permite al día, usamos el lector hasta mañana.',
    },
    sourceNeedsKey:
      'Necesita una clave de YouTube que funcione, en «Modo experto». Mientras no la haya, usamos el lector.',
    save: 'Guardar',
    saved: 'Guardado',
    reader: 'Lector de YouTube',
    readerVersion: 'Versión del lector: {version}',
    noReader: 'El lector de YouTube no está preparado. Pulsa «Actualizar el lector» para prepararlo.',
    updateReader: 'Actualizar el lector',
    updateWhy: 'YouTube cambia a menudo. Si algo deja de leerse bien, actualizar el lector suele arreglarlo.',
    updating: 'Actualizando el lector…',
    updated: 'Lector de YouTube listo.',
    updateFailed:
      'No hemos podido preparar el lector de YouTube. Puedes seguir usando la app y volver a intentarlo más tarde.',
    expert: 'Modo experto',
    keyWhy: 'Es opcional: todo funciona sin ella. Con una clave de YouTube las medidas tienen fechas más completas.',
    keyLabel: 'Tu clave de YouTube',
    saveKey: 'Comprobar y guardar',
    keySaved: 'Clave guardada ••••{pista}',
    keyInvalid: 'YouTube no acepta esta clave.',
    keyUnchecked:
      'No hemos podido preguntar a YouTube por esta clave y no la hemos guardado. Vuelve a probar en un rato.',
    keyRejected: 'YouTube ha dejado de aceptar tu clave, así que ya no la usamos. Guarda otra o bórrala.',
    removeKey: 'Borrar la clave',
    removeKeyTitle: '¿Borrar la clave de YouTube?',
    removeKeyBody: 'YTCreator la borrará de tu ordenador y seguirá leyendo YouTube con el lector.',
    remove: 'Borrar',
    cancel: 'Cancelar',
    quota: 'Hoy tu clave lleva {usadas} de las {limite} consultas que permite al día.',
    quotaNear: 'Te queda poco de lo que tu clave permite hoy. Si se acaba, usaremos el lector de YouTube hasta mañana.',
  },

  usage: {
    why: 'Lo que has gastado en la IA este mes. Con tu suscripción de Claude no pagas nada aparte.',
    today: 'Hoy: {importe} €',
    month: 'Este mes: {importe} €',
    list: 'Llamadas de este mes',
    empty: 'Este mes aún no has usado la IA.',
    item: '{uso} · {importe} €',
    uses: {
      comprobacion: 'Comprobar la conexión',
      preguntas: 'Preguntas sobre tus intereses',
      nichos: 'Proponer nichos',
      recomendacion: 'Opinión sobre los nichos',
      conceptos: 'Proponer ideas de canal',
      nombres: 'Proponer nombres',
      lectura_canal: 'Leer tu canal',
      posicionamiento: 'Proponer el enfoque',
      perfil_parte: 'Reescribir una parte del perfil',
      ideas: 'Proponer ideas de vídeo',
      otro_enfoque: 'Buscar otro enfoque',
      busquedas_idea: 'Preparar la medida de una idea',
      escaleta: 'Proponer la escaleta de un vídeo',
      guion: 'Escribir el guion de un vídeo',
      guion_short: 'Escribir el guion de un Short',
      bloque_guion: 'Escribir de nuevo un bloque del guion',
      enfoques_short: 'Proponer enfoques para un Short',
      investigacion: 'Investigar un tema en internet',
      comprobar_guion: 'Comprobar el guion en internet',
    } satisfies Record<AiUse, string>,
    failed: 'No salió bien',
    knowledge: 'Información que conviene revisar',
    knowledgeWhy:
      'YTCreator usa estos datos sobre YouTube. Hace más de {dias} días que nadie los revisa y pueden haber cambiado.',
    knowledgeItem: '{fuente}: revisado el {fecha}',
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
    removeLastBody:
      'Es tu única cuenta y la opción que usas ahora: YTCreator se quedará sin IA conectada hasta que conectes otra.',
    removeLastFallbackBody:
      'Es tu única cuenta y la opción que usas ahora. YTCreator olvidará su acceso y pasará a usar «{opcion}», que también funciona.',
    noAccount: 'Sin cuenta conectada',
    reconnect: 'Volver a conectar',
    reconnectNote: 'Entra con la misma cuenta de Claude: YTCreator no puede comprobarlo.',
    accessInOtherRow: 'Ese acceso ya está en otra cuenta de la lista.',
    addAccount: 'Añadir otra cuenta',
    maxAccounts: 'Puedes conectar hasta 5 cuentas. Ya tienes 5.',
    savedKeys: 'Claves guardadas',
    savedKey: '••••{pista}',
    replace: 'Sustituir',
    removeKeyTitle: '¿Borrar esta clave?',
    removeKeyBody: 'YTCreator la borrará de tu ordenador.',
    removeKeyInUseBody:
      'Es la opción que usas ahora. YTCreator la borrará de tu ordenador y se quedará sin IA conectada hasta que conectes otra.',
    removeKeyFallbackBody:
      'Es la opción que usas ahora. YTCreator la borrará de tu ordenador y pasará a usar «{opcion}», que también funciona.',
    others: 'Otras opciones',
    useThis: 'Usar esta opción',
    nowUsing: 'Listo. Ahora YTCreator usa «{opcion}».',
    configure: 'Configurar',
    limits: 'Límites de gasto',
    cancel: 'Cancelar',
  },

  generalSettings: {
    version: 'Versión instalada: {version}',
    updates: 'Avisarme cuando haya una versión nueva',
    updatesHelp: 'YTCreator consulta una vez al día si hay versión nueva. No envía nada tuyo.',
    expert: 'Modo experto',
    timeout: 'Tiempo máximo de espera de la IA',
    timeoutHelp: 'En segundos, de 10 a 300. Déjalo vacío para usar el de la app.',
    seconds: 'segundos',
    save: 'Guardar',
    saved: 'Guardado',
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
    youtube: 'No hemos podido leer YouTube ahora mismo.',
    prohibido: 'YTCreator ha bloqueado esta acción por seguridad. Recarga la página.',
    interno:
      'Algo ha fallado dentro de YTCreator. Vuelve a intentarlo y, si sigue pasando, ciérralo y ábrelo otra vez.',
    en_curso: 'La IA ya está trabajando en este guion. Espera a que termine.',
    version_cambiada: 'Esto ha cambiado en otra pestaña. Recarga para ver lo último; lo que has escrito sigue aquí.',
    sin_aprobar: 'Antes hay que aprobar el paso anterior.',
    sin_internet: 'Tu conexión de IA no puede buscar en internet. Puedes seguir con tus apuntes.',
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
    ya_hay_canal: 'Ya tienes un canal. Por ahora, YTCreator trabaja con un solo canal.',
  } satisfies Record<Guard, string>,

  field: {
    no_valido: 'Este valor no es válido.',
    longitud_no_valida: 'Es demasiado corto o demasiado largo.',
    debe_ser_positivo: 'Tiene que ser mayor que 0.',
    mayor_que_diario: 'No puede ser mayor que el límite por día.',
    mayor_que_mensual: 'No puede ser mayor que el límite por mes.',
    demasiado_alto: 'Es demasiado alto.',
    sin_perfil: 'Primero termina el perfil de tu canal.',
    sin_medida_quemada:
      'Solo se busca otro enfoque para una idea medida que ya está muy contada o con mucha competencia.',
  } satisfies Record<FieldCode, string>,
}

export type WebStrings = typeof es
