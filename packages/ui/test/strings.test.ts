import { describe, expect, it } from 'vitest'
import { es } from '../src/strings/es.ts'
import { format } from '../src/strings/format.ts'
import { mergeStrings } from '../src/strings/UiStringsProvider.tsx'
import { flattenStrings } from './forbidden-terms.ts'

describe('UiStrings (FR-019)', () => {
  it('format replaces every placeholder', () => {
    expect(format(es.stepper.position, { current: 2, total: 5 })).toBe('Paso 2 de 5')
  })

  it('format throws when a placeholder has no value', () => {
    expect(() => format(es.stepper.position, { current: 2 })).toThrow('{total}')
  })

  it('no default text has an unnamed or malformed placeholder', () => {
    const malformed = flattenStrings(es).filter(({ value }) => /\{(?!\w+\})|(?<!\{\w*)\}/.test(value))
    expect(malformed).toEqual([])
  })

  it('a partial override keeps every key it leaves out', () => {
    const merged = mergeStrings(es, { dialog: { close: 'Close' } })
    expect(merged.dialog.close).toBe('Close')
    expect(merged.toast).toEqual(es.toast)
    expect(merged.stepper).toEqual(es.stepper)
    expect(flattenStrings(merged).map(({ key }) => key)).toEqual(flattenStrings(es).map(({ key }) => key))
  })

  it('a deep override keeps the sibling keys of the same group', () => {
    const merged = mergeStrings(es, { theme: { dark: 'Noche' } })
    expect(merged.theme).toEqual({ ...es.theme, dark: 'Noche' })
  })
})
