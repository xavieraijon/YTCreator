import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataSource } from '../src/components/DataSource/index.ts'

// Without a browser here: axe runs over the catalog page of each component (apps/catalog/e2e/a11y.spec.ts).
describe('DataSource', () => {
  it('a YouTube figure says so, with its date', () => {
    const html = renderToStaticMarkup(<DataSource kind="youtube" date="2026-10-31" />)
    expect(html).toContain('Dato de YouTube · 31 oct 2026')
    expect(html).toContain('<svg')
  })

  it('knowledge says its name and the date it was reviewed', () => {
    const html = renderToStaticMarkup(<DataSource kind="conocimiento" label="Programa de socios" date="2026-11-01" />)
    expect(html).toContain('Programa de socios · revisado el 1 nov 2026')
    expect(html).toContain('<svg')
  })

  it('an opinion says it is the AI, and gives no date', () => {
    const html = renderToStaticMarkup(<DataSource kind="ia" />)
    expect(html).toContain('Opinión de la IA')
    expect(html.replace(/<[^>]*>/g, '')).toBe('Opinión de la IA')
  })

  it('each origin has its own icon', () => {
    const icons = [
      <DataSource key="y" kind="youtube" date="2026-10-31" />,
      <DataSource key="c" kind="conocimiento" label="Fuente" date="2026-10-31" />,
      <DataSource key="i" kind="ia" />,
    ].map((node) => /class="lucide lucide-([a-z-]+)/.exec(renderToStaticMarkup(node))?.[1])
    expect(new Set(icons).size).toBe(3)
  })

  it('a date with no time is the same day in any time zone', () => {
    expect(renderToStaticMarkup(<DataSource kind="youtube" date="2026-01-01" />)).toContain('1 ene 2026')
  })

  it('does not leak its data into the markup as attributes', () => {
    const html = renderToStaticMarkup(<DataSource kind="conocimiento" label="Fuente" date="2026-10-31" />)
    expect(html).not.toMatch(/\slabel=|\sdate=|\skind=/)
  })
})
