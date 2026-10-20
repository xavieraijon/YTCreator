/** Tipos y constantes de Ajustes (lo que devuelve /api/ajustes, /api/ia/* y /api/ajustes/proveedores). */
export interface ClaveServicio {
  clave: string;
  texto: string;
  ayuda: string;
  rellena: boolean;
}
export type Capacidad = 'imagen' | 'voz' | 'musica' | 'sincronia';
/** Un servicio del catálogo (herramientas/servicios.py). `disponible` = lo usa y está conectado. */
export interface Servicio {
  id: string;
  nombre: string;
  hace: Capacidad[];
  tipo: 'gratis' | 'pago' | 'local' | 'incluido';
  descripcion: string;
  claves: ClaveServicio[];
  activo: boolean;
  elegido: boolean;
  conectado: boolean;
  disponible: boolean;
  conector?: boolean;
}
export interface DatosServicios {
  servicios: Servicio[];
  capacidades: Record<Capacidad, string>;
  resumen: Record<Capacidad, string[]>;
}
export interface PerfilIA {
  modelo: string;
  esfuerzo: string;
}
export interface SaludIA {
  proveedor: string | null;
  etiqueta: string;
  disponible: boolean;
  estado: string;
  mensaje: string;
  cuando: string | null;
  modo?: string;
  perfiles?: Record<string, PerfilIA>;
}
export const ESTADO_IA: Record<string, string> = {
  ok: 'Funciona', cupo: 'Sin cupo', sesion: 'Sin sesión', tiempo: 'No contesta a tiempo', error: 'Con error', desconocido: 'Sin comprobar',
};
export const USO_IA: Record<string, string> = {
  produccion: 'Trabajo en un vídeo (guion, escaleta, investigación)', asistente: 'Asistente', sugerencia: 'Sugerencias de prompts',
  revision: 'Revisión de imágenes',
};
export interface ConexionIA {
  instalado: boolean;
  version: string | null;
  con_sesion: boolean;
  metodo: string | null;
  suscripcion: string | null;
  por_uso: boolean;
}
export interface Limite {
  clave: string;
  texto: string;
  unidad: string;
  origen: string;
  defecto: number;
  valor: number;
  cambiado: boolean;
}
export interface EstadoEspacio {
  kit: string;
  espacio: string;
  separado: boolean;
  enlaces_que_faltan: string[];
  carpetas_que_faltan: string[];
  env: boolean;
}
export interface DatosAjustes {
  espacio: EstadoEspacio;
  entorno: { texto: string; valor: string }[];
  tope_euros_video: number | null;
  sin_gasto: boolean;
  sin_gasto_activo: boolean;
}

const P = (modelo: string, esfuerzo: string) => ({ modelo, esfuerzo });
/** Niveles de calidad de la IA. «Equilibrado» = los perfiles de fábrica de herramientas/motor_ia.py. */
export const NIVELES_IA = [
  { clave: 'rapido', nombre: 'Rápido', texto: 'Contesta antes y gasta menos de tu cupo; los guiones salen menos pulidos.',
    perfiles: { produccion: P('sonnet', 'low'), asistente: P('sonnet', 'low'), sugerencia: P('sonnet', 'low'), revision: P('sonnet', 'medium') } },
  { clave: 'equilibrado', nombre: 'Equilibrado (recomendado)', texto: 'Buena calidad a un ritmo razonable.',
    perfiles: { produccion: P('sonnet', 'medium'), asistente: P('sonnet', 'medium'), sugerencia: P('sonnet', 'medium'), revision: P('sonnet', 'high') } },
  { clave: 'calidad', nombre: 'Máxima calidad', texto: 'El mejor modelo pensando más: más lento y gasta bastante más cupo.',
    perfiles: { produccion: P('opus', 'high'), asistente: P('opus', 'high'), sugerencia: P('opus', 'medium'), revision: P('opus', 'high') } },
] as const;
