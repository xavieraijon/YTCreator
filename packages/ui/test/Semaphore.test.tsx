import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Semaphore, type SemaphoreState } from '../src/components/Semaphore/index.ts'
import { es } from '../src/strings/es.ts'

// Without a browser here: axe runs over the catalog page of each component (apps/catalog/e2e/a11y.spec.ts).
const STATES: SemaphoreState[] = ['verde', 'ambar', 'rojo', 'sin_comprobar']
const render = (state: SemaphoreState, label?: string) =>
  renderToStaticMarkup(<Semaphore state={state}>{label}</Semaphore>)

describe('Semaphore', () => {
  it.each(STATES)('%s has a text and an icon, not only a color', (state) => {
    const html = render(state)
    expect(html).toContain(es.semaphore[state])
    expect(html).toContain('<svg')
    expect(html).toContain(`data-state="${state}"`)
  })

  it('each state has its own icon and text', () => {
    const icons = STATES.map((state) => /class="lucide lucide-([a-z-]+)/.exec(render(state))?.[1])
    expect(new Set(icons).size).toBe(STATES.length)
    expect(new Set(STATES.map((state) => es.semaphore[state])).size).toBe(STATES.length)
  })

  it('the text can say what it means here', () => {
    const html = render('rojo', 'Ocupado')
    expect(html).toContain('Ocupado')
    expect(html).not.toContain(es.semaphore.rojo)
  })

  it('the icon is decorative: the text is what gets read', () => {
    expect(render('verde')).toContain('aria-hidden="true"')
  })
})
