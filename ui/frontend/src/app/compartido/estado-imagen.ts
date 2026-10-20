import { Imagen } from '../core/modelos';

/**
 * El estado de una imagen, el mismo en toda la UI:
 * - lista: existe y está al día.
 * - nueva: todavía no existe (hay que generarla por primera vez).
 * - rehacer: existe, pero su prompt (o el estilo, la paleta…) ha cambiado: montar.py la sustituirá.
 * - cola: pagada y esperando en la cola de ai33.
 * - fija: no se genera (reutiliza otra imagen, clip animado o archivo propio).
 */
export type EstadoImagen = 'lista' | 'nueva' | 'rehacer' | 'cola' | 'fija';
export type Motor = 'klein' | 'ai33';

export const ESTADOS: Record<EstadoImagen, { etiqueta: string; icono: string; ayuda: string }> = {
  lista: { etiqueta: 'Listas', icono: 'check_circle', ayuda: 'Existen y están al día (también las que reutilizan otra): no hay que hacer nada.' },
  nueva: { etiqueta: 'Nuevas', icono: 'add_photo_alternate', ayuda: 'Todavía no existen: hay que generarlas por primera vez.' },
  rehacer: {
    etiqueta: 'A rehacer',
    icono: 'sync_problem',
    ayuda: 'Existen, pero su descripción (o el estilo) ha cambiado desde que se generaron: la actual se sustituirá.',
  },
  cola: { etiqueta: 'En espera', icono: 'schedule', ayuda: 'Ya pagadas, esperando en la cola del servicio de pago: llegan solas.' },
  fija: { etiqueta: 'No se generan', icono: 'content_copy', ayuda: 'Reutilizan otra imagen, o son un clip o un archivo propio.' },
};

export function estadoImagen(img: Imagen): EstadoImagen {
  if (img.origen !== 'prompt') return 'fija';
  if (img.en_cola) return 'cola';
  if (!img.existe) return 'nueva';
  return img.desactualizada ? 'rehacer' : 'lista';
}

/** Las que hay que generar (nuevas o a rehacer), sin las que ya esperan en la cola de ai33. */
export function porGenerar(img: Imagen): boolean {
  const e = estadoImagen(img);
  return e === 'nueva' || e === 'rehacer';
}

export interface Recuento {
  lista: number;
  nueva: number;
  rehacer: number;
  cola: number;
  fija: number;
  total: number;
}

export function recuento(imagenes: Imagen[], motor?: Motor): Recuento {
  const r: Recuento = { lista: 0, nueva: 0, rehacer: 0, cola: 0, fija: 0, total: 0 };
  for (const img of imagenes) {
    const e = estadoImagen(img);
    if (motor && (e === 'fija' || img.motor !== motor)) continue;
    r[e]++;
    r.total++;
  }
  return r;
}

/** «22 nuevas + 5 a rehacer» (sin los ceros). */
export function desglose(r: Pick<Recuento, 'nueva' | 'rehacer'>): string {
  return [r.nueva && `${r.nueva} ${r.nueva === 1 ? 'nueva' : 'nuevas'}`, r.rehacer && `${r.rehacer} a rehacer`]
    .filter(Boolean)
    .join(' + ');
}
