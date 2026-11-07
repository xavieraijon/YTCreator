// The order of the bank and of the queue (specs/004-idea-bank/data-model.md): every idea once, in its new place.

/** The new order names the same ideas as now, each once. */
export function checkOrder(ids: readonly string[], current: readonly string[]): boolean {
  if (ids.length !== current.length || new Set(ids).size !== ids.length) return false
  const known = new Set(current)
  return ids.every((id) => known.has(id))
}

const swap = (ids: readonly string[], at: number, to: number): string[] => {
  const next = [...ids]
  ;[next[at], next[to]] = [next[to]!, next[at]!]
  return next
}

/** «Subir»: one place up; the first stays where it is. */
export function moveUp(ids: readonly string[], id: string): string[] {
  const at = ids.indexOf(id)
  return at > 0 ? swap(ids, at, at - 1) : [...ids]
}

/** «Bajar»: one place down; the last stays where it is. */
export function moveDown(ids: readonly string[], id: string): string[] {
  const at = ids.indexOf(id)
  return at >= 0 && at < ids.length - 1 ? swap(ids, at, at + 1) : [...ids]
}

/**
 * «Subir» or «Bajar» with some ideas hidden by the filters: the idea passes the one seen next to it on screen, and the
 * hidden ones keep their places. With nothing hidden it is `moveUp` or `moveDown`.
 */
export function moveAmong(
  all: readonly string[],
  visible: readonly string[],
  id: string,
  direction: 'up' | 'down',
): string[] {
  const at = visible.indexOf(id)
  const neighbour = visible[direction === 'up' ? at - 1 : at + 1]
  if (at < 0 || neighbour === undefined) return [...all]
  const rest = all.filter((one) => one !== id)
  const place = rest.indexOf(neighbour) + (direction === 'up' ? 0 : 1)
  return [...rest.slice(0, place), id, ...rest.slice(place)]
}
