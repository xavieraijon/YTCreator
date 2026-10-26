import { expect, test, type Locator } from '@playwright/test'

/** True when the element's content fits its box without hidden overflow. */
const fits = (locator: Locator) => locator.evaluate((element) => element.scrollWidth <= element.clientWidth)

test.describe('textos largos (caso límite)', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('el aviso largo se ajusta en varias líneas y se lee entero', async ({ page }) => {
    await page.goto('/#/componentes/toast')
    await page.getByRole('button', { name: 'Aviso con texto largo' }).click()
    const region = page.getByRole('region', { name: /Avisos/ })
    const title = region.getByText('Configuración del canal guardada correctamente', { exact: true })
    await expect(title).toBeVisible()
    await expect(region.getByText(/se aplicarán a los próximos vídeos que prepares\.$/)).toBeVisible()
    await expect(region.getByRole('button', { name: 'Personalizar' })).toBeVisible()
    expect(await fits(title)).toBe(true)
  })

  test('las pestañas largas se desplazan dentro de su lista y se alcanzan con las flechas', async ({ page }) => {
    await page.goto('/#/componentes/tabs')
    const tablist = page.getByRole('tablist', { name: 'Ajustes' })
    await tablist.getByRole('tab', { name: 'Configuración' }).focus()
    await page.keyboard.press('End')
    const last = tablist.getByRole('tab', { name: 'Título y descripción' })
    await expect(last).toBeFocused()
    await expect(last).toBeInViewport()
    expect(await fits(last)).toBe(true)
  })

  test('la etiqueta larga se recorta con el texto completo disponible', async ({ page }) => {
    await page.goto('/#/componentes/badge')
    const badge = page.getByTestId('doc-badge').getByTitle('Programado para el martes a las nueve')
    await expect(badge).toBeVisible()
  })
})
