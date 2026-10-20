/** Tipos de la API del backend (ui/backend/app/rutas). */
export interface Canal {
  slug: string;
  nombre: string;
  url: string | null;
  activo: boolean;
  archivado: boolean;
  pendientes: number;
  videos: number;
  fase_creacion: string | null;
  /** Creación a medias, para el usuario: «Paso 2 de 11: Concepto». */
  creacion: string | null;
  /** Canal rápido (vídeo rápido sin canal): valores de fábrica, sin nombre todavía. */
  rapido: boolean;
  actualizado: string;
}

export interface CanalDetalle extends Canal {
  ficha: string | null;
}

export interface VideoResumen {
  id: number;
  canal: string;
  carpeta: string;
  tipo: 'largo' | 'short';
  titulo: string | null;
  pilar: string | null;
  duracion_objetivo: number | null;
  fase: string | null;
  fase_nombre: string | null;
  completadas: string[];
  aparcado: boolean;
  escenas_total: number;
  palabras: number;
  duracion_estimada: number | null;
  imagenes_total: number;
  /** Listas: existen y están al día (sin las que se rehacen). */
  imagenes_hechas: number;
  imagenes_desactualizadas: number;
  tiene_final: boolean;
  modificado: string;
  /** La única cuenta de dónde está el vídeo y qué le falta (backend: app/estado_video.py). */
  estado_real: EstadoReal | null;
}

export interface Fase {
  letra: string;
  nombre: string;
  /** desactualizada: se cerró, pero lo de antes ha cambiado (hay que rehacer o volver a aprobar). */
  estado: 'hecha' | 'desactualizada' | 'actual' | 'pendiente';
  avisos?: string[];
}

export interface EstadoReal {
  fases: Fase[];
  /** La fase que toca mirar: la primera desactualizada o, si no hay, la actual. */
  vista: string;
  vista_nombre: string | null;
  paso: number;
  pasos: number;
  avisos: { fase: string; nombre: string; texto: string }[];
  siguiente: { fase: string; id: string; texto: string; quien: string; estado: string } | null;
  montaje: 'al_dia' | 'desactualizado' | 'sin_montar';
  /** Aviso si sus archivos son de una versión más nueva de YTCreator (herramientas/esquema.py). */
  esquema?: string;
  /** Aviso si su estado o su guion no se pueden leer (archivo dañado): no se ha tocado nada. */
  archivo_danado?: string;
  montado: boolean;
  listo_para_subir: boolean;
  publicado: boolean;
}

export interface PalabraTiempo {
  texto: string;
  inicio: number;   // segundos desde el principio de la voz de la escena
  fin: number;
}

export interface SuenaMal {
  estado: 'mal';
  motivo: string;
  fecha: string;
}

export interface Escena {
  numero: number;
  capitulo: string | null;
  texto: string;
  palabras: number;
  audio: string | null;
  tiempos: PalabraTiempo[] | null;   // para el karaoke: momento de cada palabra de la voz (voz/NN.json)
  suena_mal: SuenaMal | null;        // pendiente de revisar la voz (revision_voz.json)
}

export interface Medio {
  nombre: string;
  ruta: string;
  bytes: number;
  modificado: number;
}

export interface Medios {
  videos: Medio[];
  audio: Medio[];
  hojas: Medio[];
  miniaturas: Medio[];
  subtitulos: Medio[];
  exportaciones: Medio[];
}

export interface Imagen {
  ident: string;
  escena: number;
  origen: 'prompt' | 'imagen' | 'video' | 'reutilizar';
  prompt: string | null;
  fuente: string | null;
  ruta: string | null;
  existe: boolean;
  /** Existe, pero su .firma no es la del prompt actual: montar.py la rehará. */
  desactualizada: boolean;
  /** klein (gratis) | ai33 (de pago, Nano Banana 2). */
  motor: 'klein' | 'ai33';
  /** El que recibe el modelo: personajes sustituidos, con el estilo y la paleta del canal. */
  prompt_final: string | null;
  /** Pagada y esperando en la cola de ai33. */
  en_cola: boolean;
  /** Marca de revisión de la UI (revision_imagenes.json). */
  revision: RevisionImagen | null;
  /** Lo que dice la voz mientras está en pantalla (su tramo del guion). */
  voz?: string | null;
}

export interface RevisionImagen {
  /** mal: marcada, sin rehacer · rehecha: se rehízo después de marcarla (revísala) · bien. */
  estado: 'mal' | 'rehecha' | 'bien';
  motivo: string | null;
  fecha: string;
  /** Versiones anteriores guardadas al rehacerla (rutas relativas al canal), de la más antigua a la última. */
  anteriores: string[];
  historial: { fecha: string; estado: string; motivo?: string; accion?: string; anterior?: string }[];
}

export interface ReferenciaEstilo {
  nombre: string;
  /** Relativa al canal. */
  ruta: string;
  existe: boolean;
}

/** Para generar las imágenes a mano (Gemini…) igual que las de ai33. */
export interface GuiaManual {
  referencias: ReferenciaEstilo[];
  /** La frase de estilo que manda imagen_ai33.py, escrita para la imagen adjunta. */
  instruccion: string | null;
  aspecto: string;
  modelo: string;
}

export interface VideoDetalle extends VideoResumen {
  notas: string[];
  pendiente: Record<string, unknown> | null;
  /** Otros campos de estado.json (enfoque, voz, imagenes…). */
  extra: Record<string, unknown> | null;
  documentos: string[];
  fases: Fase[];
  escenas: Escena[];
  imagenes: Imagen[];
  medios: Medios;
  palabras_por_minuto: number;
  guia: GuiaManual;
}

export interface Documento {
  nombre: string;
  texto: string;
}

export interface EventoCambio {
  tipo: 'cambio';
  canal: string | null;
}

export type EstadoTarea = 'en_cola' | 'en_curso' | 'hecha' | 'error' | 'cancelada' | 'interrumpida';

export interface ProgresoTarea {
  /** Última línea de la salida. */
  texto?: string;
  /** Imágenes hechas de las del lote (tareas de imágenes). */
  hecho?: number;
  total?: number;
  /** Progreso que da la propia herramienta («@progreso 7/18 Escena 7»): paso de pasos y etapa. */
  paso?: number;
  pasos?: number;
  etapa?: string;
  /** Lo que tardó la mediana de las últimas veces (segundos), para las tareas sin cifra. */
  suele?: number | null;
}

export interface Tarea {
  id: number;
  herramienta: string;
  titulo: string;
  canal: string | null;
  video_id: number | null;
  argumentos: Record<string, unknown>;
  pesada: boolean;
  estado: EstadoTarea;
  codigo: number | null;
  progreso: ProgresoTarea | null;
  creada: string;
  empezada: string | null;
  terminada: string | null;
}

export interface TareaDetalle extends Tarea {
  comando: string[];
  lineas: string[];
}

export interface Herramienta {
  clave: string;
  titulo: string;
  descripcion: string;
  pesada: boolean;
  necesita_video: boolean;
}

/** `cuota.py --json`: cifras reales de cada servicio. */
export interface DatosCuotas {
  consultado: string;
  cloudflare: {
    total: number;
    /** Leído de la analítica real de Cloudflare (si no, estimación con data/uso.jsonl). */
    real: boolean;
    usadas_dia: number;
    usadas_24h: number | null;
    libres: number;
    /** Hora local a la que cabe la siguiente imagen («ya» si cabe), con la ventana móvil de 24 h. */
    libre_imagen: string | null;
    /** Por qué no hay dato real: sin_conexion · rechazada (null si lo hay o si solo falta el permiso de analítica). */
    motivo?: string | null;
    reinicio: string;
  };
  azure: { total: number; usados: number; libres: number; reinicio: string };
  ai33: {
    saldo: number | null;
    /** Por qué no se ha podido leer el saldo: sin_conexion · rechazada · respuesta_rara. */
    motivo?: string | null;
    gastado_hoy: number;
    gastado_total: number;
    euros_por_millon: number;
    comprados: number;
    /** comprados − saldo: lo gastado de verdad, dentro o fuera de las herramientas. */
    gastado_real: number | null;
    /** gastado_real − gastado_total: lo que no pasó por las herramientas (web de ai33, pruebas). */
    sin_registrar: number | null;
    coste_video: number;
    coste_video_euros: number;
    videos_que_caben: number | null;
  };
}

export interface Cuotas {
  datos: DatosCuotas | null;
  /** Servicios con sus claves guardadas; sin clave, la cabecera dice «Sin conectar» en vez de una cuota teórica. */
  conectados?: { cloudflare: boolean; azure: boolean; ai33: boolean; gemini: boolean };
  /** Los que el usuario usa (Ajustes → Servicios); los demás no se enseñan en la cabecera. */
  activos?: { cloudflare: boolean; azure: boolean; ai33: boolean; gemini: boolean };
  /** Servicios usados que no saben decir su cuota (los conectados por el usuario…): nombre propio y gasto contado por el kit. */
  otros?: OtroServicio[];
  /** Nombre de cada servicio con cuota, tal como lo ve el usuario. */
  nombres?: Record<string, string>;
  error: string | null;
  consultado: string | null;
}

export interface OtroServicio {
  id: string;
  nombre: string;
  hace: string[];
  de_pago: boolean;
  gastado_total: number;
  gastado_hoy: number;
  unidad: string;
}

export interface EventoCuotas extends Cuotas {
  tipo: 'cuotas';
}

export interface EventoTarea {
  tipo: 'tarea';
  id: number;
  estado: EstadoTarea;
  codigo?: number | null;
  lineas?: string[];
  progreso?: ProgresoTarea;
}

export interface TareaAi33 {
  ident: string;
  tarea: string;
  estimado: number | null;
  mandada: string | null;
  minutos: number | null;
  estado: string | null;
  progreso: number | null;
}

export interface ColaAi33 {
  modelo: string;
  creditos_por_imagen: number;
  en_marcha: boolean;
  por_mandar: string[];
  previsto_creditos: number;
  previsto_euros: number;
  apuntadas: TareaAi33[];
}

/** GET /api/videos/:id/prompts: los prompts de guion.json por escenas, en bruto y como los recibe el modelo. */
export interface PromptImagen {
  ident: string;
  origen: Imagen['origen'];
  motor: Imagen['motor'];
  prompt: string | null;
  /** Personajes sustituidos, con el estilo y la paleta del canal. */
  prompt_final: string | null;
  rotulo: string | null;
  movimiento: string | null;
  fuente: string | null;
}

export interface EscenaPrompts {
  numero: number;
  capitulo: string | null;
  texto: string;
  imagenes: PromptImagen[];
}

export interface MiniaturaPrompt {
  numero: number;
  texto: string | null;
  lado: string | null;
  prompt: string | null;
  prompt_final: string | null;
  fondo: string | null;
}

export interface Prompts {
  estilo: string | null;
  personajes: Record<string, string>;
  escenas: EscenaPrompts[];
  miniaturas: MiniaturaPrompt[];
}

/** Chat con Claude por vídeo (backend: app/chat.py). */
export type EstadoConversacion = 'libre' | 'pensando' | 'error';

export interface Conversacion {
  id: number;
  video_id: number | null;
  estado: EstadoConversacion;
  turnos: number;
  creada: string;
  actualizada: string;
}

/** Lo que se ve en el chat: mensajes, herramientas que usa Claude, avisos y fin de turno. */
export interface EntradaChat {
  t: 'usuario' | 'texto' | 'herramienta' | 'fallo' | 'aviso' | 'error' | 'fin';
  fecha: string;
  texto?: string;
  /** Aviso: lo técnico, aparte (se ve al pasar el ratón). */
  detalle?: string;
  id?: string;
  nombre?: string;
  resumen?: string;
  sub?: boolean;
  segundos?: number;
  turnos?: number;
}

export interface Chat {
  conversacion: Conversacion | null;
  entradas: EntradaChat[];
}

export interface EventoClaude {
  tipo: 'claude';
  conversacion: number;
  evento: 'entrada' | 'delta' | 'estado';
  entrada?: EntradaChat;
  texto?: string;
  estado?: EstadoConversacion;
  video_id?: number | null;
}

/** Voz por la API de ai33 (GET /api/videos/{id}/voz): bloques, lo que falta y su coste. */
export interface BloqueVoz {
  escenas: number[];
  caracteres: number;
  hecho: boolean;
  de_pago: boolean;
  /** Bloque locutado en el que solo ha cambiado el texto de esta escena: se locuta ella sola (↻). */
  solo_escena?: number | null;
}

export interface VozPrevista {
  bloques: BloqueVoz[];
  pendientes: number;
  caracteres_de_pago: number;
  creditos: number;
  euros: number;
  voz: string | null;
  nombre_voz?: string | null;
  modelo?: string | null;
  prueba: { creditos: number; euros: number; caracteres_de_pago: number; escenas: number[] } | null;
  /** Locución hecha fuera (guion.json → "voz_archivo"): sustituye a la voz del canal y no cuesta nada. */
  externa: { archivo: string; existe: boolean; duracion: number | null } | null;
}

/** Música de fondo con Suno (GET /api/videos/{id}/musica). */
export interface VersionMusica {
  n: number;
  archivo: string;            // relativo a la carpeta del vídeo
  duracion: number | null;
}

export interface AmbienteMusica {
  ambiente: string;
  escenas: number[];
  prompt: string;
  prompt_propio: boolean;
  propia: string | null;
  versiones: VersionMusica[];
  elegida: number | null;
  fecha: string | null;
  creditos: number | null;
}

export interface MusicaVideo {
  creditos_por_encargo: number;
  euros_por_encargo: number;
  max_prompt: number;
  ambientes: AmbienteMusica[];
}

/** Un vídeo de referencia analizado con `estructura_referencia.py` (sin su transcripción). */
export interface EstructuraReferencia {
  id: string;
  titulo: string;
  canal: string | null;
  idioma: string | null;
  duracion_s: number;
  visitas: number;
  ratio: number | null;
  outlier: boolean;
  mrv: { reciente?: boolean; viral?: boolean; perenne?: boolean; dias?: number | null; veces_mediana?: number | null } | null;
}

/** `GET /api/asistente`: el camino desde cero (kit → canal → vídeo → publicar), leído de los archivos. */
export interface AsistenteEstado {
  kit: { items: { id: string; texto: string; ok: boolean; requerido: boolean; ayuda: string }[]; listo: boolean };
  pasos: { id: 'kit' | 'canal' | 'video' | 'publicar'; titulo: string; hecho: boolean; resumen: string }[];
  actual: 'kit' | 'canal' | 'video' | 'publicar';
  canal: {
    activo: string | null;
    hay_canal: boolean;
    pendientes: number;          // marcas <<RELLENAR>> del canal activo (0 = listo)
    creacion: { slug: string | null; nombre: string; fase: string; completadas: string[]; notas: string | null; carpeta: boolean } | null;
    fases: { letra: string; nombre: string }[];
  };
  video: {
    en_curso: { id: number; carpeta: string; titulo: string | null; fase: string | null; fase_nombre: string | null; tipo: string }[];
    publicables: { id: number; carpeta: string; titulo: string | null }[];
    publicados?: { id: number; carpeta: string; titulo: string | null }[];
  };
}

/** Fase B guiada (`GET /api/videos/{id}/fase-b`): enfoques propuestos por Claude y medidos por la herramienta. */
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'gris';

/** Un nicho medido con `mercado.py --json` (paso 1 de la creación del canal). Sin datos de YouTube: `incompleto`. */
export interface MedidaNicho {
  ok: boolean;
  semaforo: Semaforo;
  motivo: string;
  incompleto?: boolean;
  demanda?: { nivel: string; mediana: number };
  puerta?: { nivel: string; n_evidencias: number };
  concentracion?: { nivel: string; top3: number };
  ingresos_mes?: { bajo: number; medio: number; alto: number } | null;
  canales?: { nombre: string; subs: number | null }[];
  informe?: string;
}

export interface NichoPropuesto {
  id: number;
  nicho: string;
  porque: string;
  publico: string;
  busquedas: string[];
  categoria: string;
  recomendado: boolean;
  medida: MedidaNicho | null;
  midiendo: boolean;
}

/** Paso 2 de la creación del canal: un concepto que propone Claude (no se mide: elegirlo crea la carpeta). */
export interface ConceptoPropuesto {
  id: number;
  nombre: string;
  promesa: string;
  pilares: string[];
  publico: string;
  para_ninos: boolean;
  formato: string;
  narrador: string;
  ritmo: string;
  monetizacion: string;
  recomendado: boolean;
}

/** Lo que mide `nombre_canal.py --json`: búsqueda limpia y @ libre. */
export interface MedidaNombre {
  ok: boolean;
  semaforo: Semaforo;
  motivo: string;
  id?: string;
  arroba_libre?: boolean | null;
  canales_iguales?: string[];
  canales_parecidos?: string[];
  videos?: number;
  ejemplos?: { titulo: string; canal: string }[];
  fecha?: string;
}

/** Paso 3: un nombre (de Claude o del usuario, `propio`) con su medida. */
export interface NombrePropuesto {
  id: number;
  nombre: string;
  arroba: string | null;
  porque: string;
  recomendado: boolean;
  propio: boolean;
  medida: MedidaNombre | null;
  midiendo: boolean;
}

/** `GET /api/asistente/canal`: los 11 pasos de la creación del canal y, en el paso actual si tiene pantalla (1-3), sus
 * propuestas. */
export interface DatosCrearCanal {
  pasos: { letra: string; nombre: string; guiado: boolean; estado: 'hecho' | 'actual' | 'pendiente' }[];
  actual: string;
  creacion: { slug: string | null; nombre: string; fase: string; completadas: string[]; carpeta: boolean } | null;
  /** El nicho elegido en el paso 1 (con su semáforo, si se pudo medir). */
  nicho: { nicho: string; semaforo: Semaforo | null } | null;
  mercado: {
    intereses: string | null;
    propuestas: NichoPropuesto[];
    error: string | null;
    elegido: { nicho: string } | null;
    por_medir: number[];
  } | null;
  /** El concepto elegido en el paso 2. */
  concepto: { nombre: string; promesa: string } | null;
  conceptos: { indicaciones: string | null; propuestas: ConceptoPropuesto[]; error: string | null } | null;
  nombres: { propuestas: NombrePropuesto[]; error: string | null; por_medir: number[] } | null;
  estilos: EstilosCanal | null;
  voces: VocesCanal | null;
  marcas: MarcasCanal | null;
  reglas: ReglasCanal | null;
  equipo: EquipoCanal | null;
  alta: AltaCanal | null;
  ideas: IdeasCanal | null;
  cierre: CierreCanal | null;
  trabajo: { estado: EstadoConversacion; accion: string | null; conversacion: number | null };
  /** La última tarea del paso actual (paso 4: las imágenes de los estilos; paso 5: las muestras de voz; paso 6: las muestras de la marca). */
  tarea: { id: number; estado: EstadoTarea; herramienta: string } | null;
}

/** Paso 4: las escenas de prueba y cada estilo con su imagen por escena (ruta bajo canales/, con `?v=`). */
export interface EstilosCanal {
  indicaciones: string | null;
  escenas: { id: string; texto: string }[];
  estilos: { id: string; nombre: string; porque: string; recomendado: boolean; imagenes: Record<string, string>;
    /** Lo que se le pide al modelo en cada escena, para hacerlo con otra herramienta. */
    pedidos: Record<string, string> }[];
  error: string | null;
  /** Imágenes que faltan por hacer (o hechas con otro prompt). */
  faltan: number;
  /** Imágenes de referencia del usuario (ruta bajo canales/, con `?v=`). */
  referencias: { nombre: string; url: string; descripcion: string }[];
}

/** Paso 5: el párrafo de muestra y cada voz con su muestra oficial y la del párrafo (rutas bajo canales/, con `?v=`). */
export interface VocesCanal {
  indicaciones: string | null;
  texto: string | null;
  estilo_voz?: string;
  narrador?: string;
  marcas?: string;
  voces: VozPropuesta[];
  error: string | null;
  /** Voces sin muestra (las de pago, solo si les falta también la oficial). */
  faltan: number;
  /** Lo que costaría la muestra del párrafo con una voz de pago. */
  coste_ai33: { creditos: number; euros: number } | null;
}

export interface VozPropuesta {
  id: string;
  voz: string;
  nombre: string;
  porque: string;
  motor: 'ai33' | 'gemini' | 'azure';
  de_pago: boolean;
  estilo: string | null;
  velocidad: string | null;
  recomendado: boolean;
  muestra: string | null;
  oficial: string | null;
  ppm: number | null;
  duracion: number | null;
  avisos: string[];
  error: string | null;
}

/** Paso 6: combinaciones de tipografía, colores y música, cada una con miniaturas de prueba y su música (rutas bajo canales/). */
export interface MarcasCanal {
  indicaciones: string | null;
  titulo?: string;
  propuestas: MarcaPropuesta[];
  marca?: { monograma: string; titulo: string; lema: string; pilares: string };
  pantalla_final?: { titulo: string; lema: string };
  hashtags?: string[];
  error: string | null;
  /** Miniaturas y músicas que faltan por preparar. */
  faltan: number;
  /** El estilo elegido no tiene imágenes donde pintar las miniaturas. */
  sin_fondos?: boolean;
}

export interface MarcaPropuesta {
  id: string;
  nombre: string;
  porque: string;
  fuente: string;
  fuente_nombre: string;
  colores: { acento: string; resaltado: string; texto: string; fondo: string };
  musica: string;
  recomendada: boolean;
  miniaturas: string[];
  audio: string | null;
}

export interface MedidaPropuesta {
  semaforo: Semaforo;
  motivo: string;
  clones: number;
  recientes: number;
  perennes: number;
  mediana: number;
  demanda: 'alta' | 'media' | 'baja';
  en_ingles?: number | null;
}

export interface PropuestaB {
  id: number;
  titulo: string;
  pilar: string;
  enfoque: string;
  gancho: string;
  porque: string;
  recomendada: boolean;
  medida: MedidaPropuesta | null;
  midiendo: boolean;
}

export interface DuracionB {
  minutos: number;
  palabras: number;
  imagenes: number;
  dias_imagenes: number;
  creditos_voz: number;
  recomendada: boolean;
}

export interface DatosFaseB {
  /** En un Short el enfoque se elige en su fase A y no hay duración que elegir. */
  tipo: 'largo' | 'short';
  /** Short: carpeta del vídeo largo al que apoya. */
  apoya: string | null;
  fase: string | null;
  tema: string | null;
  referencia: string | null;
  propuestas: PropuestaB[];
  error: string | null;
  duraciones: DuracionB[];
  elegido: { propuesta: number; minutos: number | null } | null;
  por_medir: number[];
  trabajo: { estado: 'libre' | 'pensando' | 'error'; accion: string | null; conversacion: number | null };
}

/** Fases C a I guiadas (`GET /api/videos/{id}/fase/{letra}`): tramos con su resultado, luces y datos de la vista. */
export interface LuzTramo {
  titulo: string;
  valor: string;
  color: Semaforo;
  detalle: string;
}

export interface TramoActual {
  id: string;
  titulo: string;
  ayuda: string;
  vista: string;
  boton: string | null;
  tarda: string | null;
  job: boolean;
  producido: boolean;
  aprobable: boolean;
  completable: boolean;
  aprobacion: string | null;
  cambios_pendientes: string[];
  luces: LuzTramo[];
  /** Depende de la vista (investigación, empaquetado, escaleta, guion…). */
  datos: Record<string, any>;
  docs: string[];
}

/** Un dato de investigacion.json (fase C). */
export interface DatoInvestigacion {
  texto: string;
  estado: string;               // comprobado | hipotesis | leyenda
  fuentes?: string[];
}

/** Un título propuesto en empaquetado.json (fase D). */
export interface TituloPropuesto {
  n: number;
  recomendado?: boolean;
}

export interface FaseTramos {
  letra: string;
  fase: string | null;
  /** En revisión (`?revision=true`) cada tramo trae su `detalle` para verlo sin cambiar de fase. */
  tramos: { id: string; titulo: string; estado: 'hecho' | 'actual' | 'pendiente'; detalle?: TramoActual }[];
  completa: boolean;
  actual: TramoActual | null;
  trabajo: { estado: 'libre' | 'pensando' | 'error'; accion: string | null; conversacion: number | null };
}

/** Un suceso del diario del vídeo (`GET /api/videos/{id}/diario`): decisiones, cambios y trabajo de Claude. */
export interface CambioArchivo {
  archivo: string;
  tipo: 'creado' | 'modificado' | 'borrado';
  mas: number;
  menos: number;
  resumen: string[];
  diff: string;
}

export interface SucesoDiario {
  id: string;
  fecha: string;
  quien: 'claude' | 'usuario' | 'sistema';
  tipo: string;
  titulo: string;
  detalle?: string;
  pedido?: string;
  fase?: string;
  cambios?: CambioArchivo[];
  segundos?: number;
  error?: boolean;
}

export type GravedadAviso = 'alta' | 'media' | 'baja' | 'sin_clasificar';

export interface AvisoTramo {
  texto: string;
  gravedad: GravedadAviso;
  que_hacer: string;
}

/** Un campo de una ficha del canal que Claude todavía no ha rellenado. */
export interface CampoPendiente { archivo: string; linea: number; marca: string }

/** Paso 7: lo que Claude ha escrito sobre las reglas y las dos preguntas de YouTube que decide el usuario. */
export interface ReglasCanal {
  indicaciones: string | null;
  prueba: {
    resumen: string[];
    sintetico: { respuesta: boolean; motivo: string };
    afiliacion: { respuesta: boolean; motivo: string };
    licencias: string;
  } | null;
  error: string | null;
  pendientes: CampoPendiente[];
}

/** Paso 8: los especialistas que se pueden tener en el equipo y si su ficha está escrita. */
export interface EquipoCanal {
  indicaciones: string | null;
  roles: { id: string; nombre: string; base: boolean; porque: string; recomendado: boolean; ficha?: boolean; rellena?: boolean }[];
  pruebas: { rol: string; resultado: string }[];
  error: string | null;
}

/** Paso 9: los textos para dar de alta el canal en YouTube y las imágenes de la marca. */
export interface AltaCanal {
  indicaciones: string | null;
  prueba: { nombre: string; arroba: string; descripcion: string; palabras_clave: string[]; categoria: string; audiencia: string } | null;
  error: string | null;
  avatar: string | null;
  banner: string | null;
  previas: string[];
}

/** Paso 10: una idea de vídeo con lo medido en YouTube (`medida` es null hasta medirla). */
export interface IdeaPropuesta {
  id: number;
  titulo: string;
  dato: string;
  amplio: string;
  en: string;
  pilar: string;
  enfoque: string;
  recomendada: boolean;
  medida: { semaforo: Semaforo; motivo: string; fecha: string } | null;
  midiendo: boolean;
}

export interface IdeasCanal {
  indicaciones: string | null;
  ideas: IdeaPropuesta[];
  error: string | null;
  por_medir: number[];
  minimo: number;
}

/** Paso 11: lo que falta por rellenar y si el canal ya es el activo. */
export interface CierreCanal {
  indicaciones: string | null;
  pendientes: CampoPendiente[];
  candidata: { id: number; titulo: string; semaforo: Semaforo } | null;
  activo: boolean;
}
