import * as ui from '@ytcreator/ui'
import { describe, expect, it } from 'vitest'
import { registry } from '../src/docs/registry.ts'

/** Exports without a page of their own: documented in the foundations or inside another page. */
const exempt = new Set([
  'Icon',
  'Logo',
  'ThemeSwitcher',
  'UiStringsProvider',
  'ToastProvider',
  'TooltipContainerContext',
])

const kebab = (name: string) => name.replace(/(?<=[a-z0-9])([A-Z])/g, '-$1').toLowerCase()

describe('docs coverage', () => {
  it('every exported component has a page in the registry', () => {
    const components = Object.keys(ui).filter((name) => /^[A-Z]/.test(name) && !exempt.has(name))
    const documented = new Set(registry.map((doc) => doc.id))
    const missing = components.filter((name) => !documented.has(kebab(name)))
    expect(missing, `Components without a page: ${missing.join(', ')}`).toEqual([])
  })

  it('ids are unique and every page meets the minimum content', () => {
    const ids = registry.map((doc) => doc.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const doc of registry) {
      expect(doc.variants.length, doc.id).toBeGreaterThan(0)
      expect(doc.dos.length, doc.id).toBeGreaterThan(0)
      expect(doc.donts.length, doc.id).toBeGreaterThan(0)
      expect(doc.a11y.length, doc.id).toBeGreaterThan(0)
      expect(doc.tokens.length, doc.id).toBeGreaterThan(0)
    }
  })
})
