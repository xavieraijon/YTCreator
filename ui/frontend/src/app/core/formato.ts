/**
 * Cifras para el usuario, en castellano y siempre igual que el backend: «1.725 créditos» (Python escribe «1.030»).
 * `toLocaleString('es')` NO agrupa los números de 4 cifras («1725»): por eso todo número que se enseñe pasa por aquí.
 */

// useGrouping: 'always' (ES2023) aún no está en los tipos de la lib ES2022 del proyecto; todos los navegadores lo admiten.
const AGRUPAR = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
const formatos = new Map<string, Intl.NumberFormat>();

function formato(minimo: number, maximo: number): Intl.NumberFormat {
  const clave = `${minimo}-${maximo}`;
  let f = formatos.get(clave);
  if (!f) {
    f = new Intl.NumberFormat('es', { ...AGRUPAR, minimumFractionDigits: minimo, maximumFractionDigits: maximo });
    formatos.set(clave, f);
  }
  return f;
}

/** 1725 → «1.725»; con decimales: miles(10.25, 1) → «10,3». */
export function miles(n: number, decimales = 0): string {
  return formato(0, decimales).format(n);
}

/** Euros de un coste: «menos de 1 céntimo», «≈ 0,46 €», «≈ 1.250,00 €». */
export function euros(e: number): string {
  return e < 0.01 ? 'menos de 1 céntimo' : `≈ ${formato(2, 2).format(e)} €`;
}
