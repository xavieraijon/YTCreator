import { describe, expect, it } from 'vitest'
import { themeInitScript } from '../src/theme/init-script.ts'

function run(storage: { getItem(key: string): string | null }) {
  const documentElement = { dataset: {} as Record<string, string> }
  new Function('document', 'localStorage', themeInitScript)({ documentElement }, storage)
  return documentElement.dataset.theme
}

const stored = (value: string | null) => ({ getItem: (key: string) => (key === 'ytc.theme' ? value : null) })

describe('theme init script', () => {
  it('is smaller than 300 bytes', () => {
    expect(new TextEncoder().encode(themeInitScript).length).toBeLessThan(300)
  })

  it.each(['light', 'dark'])('applies a stored %s preference', (theme) => {
    expect(run(stored(theme))).toBe(theme)
  })

  it.each([null, 'auto', 'sepia', ''])('does nothing with %j', (value) => {
    expect(run(stored(value))).toBeUndefined()
  })

  it('does not throw when storage fails', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => run(blocked)).not.toThrow()
    expect(run(blocked)).toBeUndefined()
  })
})
