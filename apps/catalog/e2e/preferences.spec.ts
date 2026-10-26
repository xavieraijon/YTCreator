import { expect, test, type Locator, type Page } from '@playwright/test'

const doc = (page: Page, id: string) => page.getByTestId(`doc-${id}`)

/** Animations that never end; with reduced motion there must be none. */
const infiniteAnimations = (page: Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
        .length,
  )

const style = (locator: Locator, property: string) =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)

test.describe('movimiento reducido (FR-014)', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const path of [
    '#/componentes/ai-working',
    '#/componentes/spinner',
    '#/componentes/skeleton',
    '#/componentes/progress-bar',
    '#/fundamentos/movimiento',
  ]) {
    test(`sin animaciones infinitas en ${path}`, async ({ page }) => {
      await page.goto(`/${path}`)
      await expect(page.locator('#main h1')).toBeVisible()
      expect(await infiniteAnimations(page)).toBe(0)
    })
  }
})

test.describe('colores forzados', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
  })

  test('el foco de un botón sigue viéndose', async ({ page }) => {
    await page.goto('/#/componentes/button')
    const button = doc(page, 'button').getByRole('button').first()
    await page.locator('#main').focus()
    await page.keyboard.press(page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab')
    await button.focus()
    await expect(button).toBeFocused()
    expect(await style(button, 'outline-style')).not.toBe('none')
  })

  test('el foco de un campo sigue viéndose', async ({ page }) => {
    await page.goto('/#/componentes/text-field')
    const field = doc(page, 'text-field').getByRole('textbox').first()
    await field.focus()
    await expect(field).toBeFocused()
    // The field draws the ring on its frame, which wraps the input and its adornments.
    const ring = await field.evaluate((element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const outline = getComputedStyle(node).outlineStyle
        if (outline !== 'none') return outline
      }
      return 'none'
    })
    expect(ring).not.toBe('none')
  })
})

test.describe('transparencia reducida', () => {
  test('el cristal pasa a ser sólido', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Solo Chromium emula prefers-reduced-transparency')
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    })

    await page.goto('/#/componentes/glass-panel')
    const panel = doc(page, 'glass-panel').getByText('Ajustes rápidos').first().locator('..')
    expect(await style(panel, 'backdrop-filter')).toBe('none')

    await page.goto('/#/componentes/dialog')
    await doc(page, 'dialog').getByRole('button', { name: 'Abrir diálogo' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Cambiar el título' })
    await expect(dialog).toBeVisible()
    expect(await style(dialog, 'backdrop-filter')).toBe('none')
  })
})
