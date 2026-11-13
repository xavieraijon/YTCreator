// «la descripción, los capítulos y las etiquetas»: the parts that are there, said as a Spanish list.
const list = new Intl.ListFormat('es', { type: 'conjunction' })

export function listOf(parts: readonly (string | false)[]): string {
  return list.format(parts.filter((part): part is string => part !== false))
}
