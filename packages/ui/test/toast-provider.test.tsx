import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../src/components/Toast/index.ts'

// Added in 003 (decision 143): the region can go below a fixed header, and with reduced motion nothing animates.
describe('ToastProvider', () => {
  it('offsetTop puts the region below a fixed bar; without it, at the very top', () => {
    const below = renderToStaticMarkup(<ToastProvider offsetTop="var(--app-header-height, 0px)">x</ToastProvider>)
    expect(below).toContain('--c-toast-offset-top:var(--app-header-height, 0px)')
    expect(renderToStaticMarkup(<ToastProvider>x</ToastProvider>)).not.toContain('--c-toast-offset-top')
  })

  it('with reduced motion, no animation when it opens, closes or is swiped away', () => {
    const css = readFileSync(new URL('../src/components/Toast/Toast.module.css', import.meta.url), 'utf8')
    const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'))
    for (const selector of ["[data-state='open']", "[data-state='closed']", "[data-swipe='end']"]) {
      expect(reduced).toContain(`.toast${selector}`)
    }
    expect(reduced).toMatch(/animation:\s*none/)
  })
})
