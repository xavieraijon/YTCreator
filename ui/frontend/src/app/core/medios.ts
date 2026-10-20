/** URL de un archivo de un canal (ruta relativa al canal) servida por /api/medios. */
export function urlMedio(canal: string, ruta: string, ancho?: 240 | 480 | 960): string {
  const url = `/api/medios/${canal}/${ruta}`.split('/').map(encodeURIComponent).join('/');
  return ancho ? `${url}?ancho=${ancho}` : url;
}

/** URL de los picos de amplitud de un audio (bloque D: onda sin descargar ni decodificar el archivo entero). */
export function urlPicos(canal: string, ruta: string, n = 200): string {
  const url = `/api/medios/${canal}/${ruta}`.split('/').map(encodeURIComponent).join('/');
  return `${url}?picos=${n}`;
}

export function esVideo(ruta: string | null): boolean {
  return !!ruta && /\.(mp4|mov|webm)$/i.test(ruta);
}
