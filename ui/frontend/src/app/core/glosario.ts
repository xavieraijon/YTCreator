/**
 * Glosario de la UI: cómo se llaman las cosas para el usuario. Los nombres de proveedores, modelos y archivos (klein,
 * ai33, Nano Banana, guion.json…) solo aparecen en el detalle, en una línea que empieza por «Servicio:», o en el detalle
 * técnico («Detalles técnicos» de cada paso y «Archivos y notas del vídeo»). tests/test_glosario.py (backend) falla si una palabra del kit se cuela en una pantalla de usuario.
 */
export type MotorImagen = 'klein' | 'ai33';

/** «Prompt» se dice «descripción de la imagen» en todas las pantallas. */
export const MOTOR: Record<MotorImagen, { corto: string; largo: string; nota: string }> = {
  klein: { corto: 'gratis', largo: 'Gratis', nota: 'en el servicio gratuito o en este ordenador' },
  ai33: { corto: 'de pago', largo: 'De pago', nota: 'más calidad, sobre todo con personas y manos' },
};

const DOCUMENTOS: Record<string, string> = {
  'guion.md': 'Guion', 'fuentes.md': 'Fuentes', 'escaleta.md': 'Escaleta (la historia)', 'empaquetado.md': 'Título y miniatura',
  'verificacion.md': 'Verificación de datos', 'revision_estructura.md': 'Ritmo y estructura', 'brief_visual.md': 'Brief visual',
  'publicacion.md': 'Textos de publicación (borrador)', 'publicacion_final.md': 'Textos de publicación',
  'aprendizajes.md': 'Aprendizajes', 'estructura.md': 'Estructura del vídeo de referencia',
};

/** Nombre de persona de un documento del vídeo («fuentes.md» → «Fuentes»); los desconocidos, sin extensión ni guiones. */
export function nombreDocumento(archivo: string): string {
  const conocido = DOCUMENTOS[archivo];
  if (conocido) return conocido;
  const base = archivo.replace(/\.md$/, '').replace(/[_-]+/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
