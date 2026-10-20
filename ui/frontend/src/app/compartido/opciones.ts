/** Una opción de respuesta que Claude propone (la recomendada lleva ★ delante en su texto). */
export interface Opcion {
  texto: string;
  recomendada: boolean;
}

const BLOQUE = /```opciones[^\n]*\n([\s\S]*?)(?:```|$)/g;

/**
 * Separa del mensaje de Claude su bloque de opciones (```opciones, una por línea; regla en `chat.REGLAS_RESPUESTA`):
 * el texto se pinta sin él y las opciones, como botones. Se toma el último bloque; un bloque a medio escribir
 * (sin cerrar, mientras llega la respuesta) también se quita del texto.
 */
export function separarOpciones(mensaje: string): { texto: string; opciones: Opcion[] } {
  let ultimo: string | null = null;
  const texto = mensaje.replace(BLOQUE, (_, cuerpo: string) => {
    ultimo = cuerpo;
    return '';
  }).trim();
  const opciones = ((ultimo ?? '') as string)
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => ({ texto: l.replace(/^★\s*/, ''), recomendada: l.startsWith('★') }))
    .filter((o) => o.texto);
  return { texto, opciones };
}
