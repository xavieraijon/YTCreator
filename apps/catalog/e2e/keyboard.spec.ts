import { expect, test, type Locator, type Page } from '@playwright/test'

const doc = (page: Page, id: string) => page.getByTestId(`doc-${id}`)

/** WebKit on macOS skips buttons and links with a bare Tab, as Safari does; Alt+Tab reaches every control. */
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab')

/** Tabs from the start of the main content until `target` has the focus. */
async function tabTo(page: Page, target: Locator, limit = 30) {
  await page.locator('#main').focus()
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press(tabKey(page))
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('The target never got the focus')
}

/** The toast title; the live region repeats it for screen readers. */
const toastTitle = (page: Page) =>
  page.getByRole('region', { name: /Avisos/ }).getByText('Guion guardado', { exact: true })

const focusedInside = (container: Locator) => container.evaluate((element) => element.contains(document.activeElement))

test.describe('teclado', () => {
  test('un botón se alcanza con Tab y se activa con Espacio (2.1, 2.2)', async ({ page }) => {
    await page.goto('/#/componentes/toast')
    const trigger = doc(page, 'toast').getByRole('button', { name: 'Mostrar aviso' }).first()
    await tabTo(page, trigger)
    await page.keyboard.press('Space')
    await expect(toastTitle(page)).toBeVisible()
  })

  for (const closeWith of ['Escape', 'botón']) {
    test(`el diálogo atrapa el foco y lo devuelve al cerrar con ${closeWith} (2.3)`, async ({ page }) => {
      await page.goto('/#/componentes/dialog')
      const trigger = doc(page, 'dialog').getByRole('button', { name: 'Abrir diálogo' }).first()
      await tabTo(page, trigger)
      await page.keyboard.press('Enter')

      const dialog = page.getByRole('dialog', { name: 'Cambiar el título' })
      await expect(dialog).toBeVisible()
      for (let step = 0; step < 8; step++) {
        await page.keyboard.press(tabKey(page))
        expect(await focusedInside(dialog)).toBe(true)
      }

      if (closeWith === 'Escape') await page.keyboard.press('Escape')
      else await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()

      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
    })
  }

  test('las pestañas se mueven con flechas, Inicio y Fin', async ({ page }) => {
    await page.goto('/#/componentes/tabs')
    const tabs = doc(page, 'tabs').getByRole('tablist').first()
    const tab = (name: string) => tabs.getByRole('tab', { name })

    await tab('Guion').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab('Esquema')).toBeFocused()
    await expect(tab('Esquema')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(tab('Notas')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tab('Guion')).toBeFocused()
  })

  test('el desplegable se abre, recorre y elige con teclado, y Escape cierra sin cambiar', async ({ page }) => {
    await page.goto('/#/componentes/select')
    const select = doc(page, 'select').getByRole('combobox', { name: 'Idioma del vídeo' }).first()
    await expect(select).toHaveText('Español')

    await select.focus()
    await page.keyboard.press('Enter')
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    await expect(page.getByRole('option', { name: 'Español' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    // Radix moves the focus on the next tick.
    await expect(page.getByRole('option', { name: 'Inglés' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(listbox).toBeHidden()
    await expect(select).toHaveText('Inglés')
    await expect(select).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(listbox).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(listbox).toBeHidden()
    await expect(select).toHaveText('Inglés')
  })

  test('el contenido de un plegable cerrado no recibe el foco (2.5)', async ({ page }) => {
    await page.goto('/#/componentes/disclosure')
    const section = doc(page, 'disclosure')
    const summary = section.getByText('Modo experto', { exact: true }).first()
    const field = section.getByRole('textbox', { name: 'Palabra clave', includeHidden: true }).first()

    await summary.focus()
    await page.keyboard.press('Tab')
    await expect(field).not.toBeFocused()

    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(field).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(field).toBeFocused()

    await summary.focus()
    await page.keyboard.press('Space')
    await expect(field).toBeHidden()
  })

  test('los avisos se alcanzan con F8', async ({ page }) => {
    await page.goto('/#/componentes/toast')
    await doc(page, 'toast').getByRole('button', { name: 'Mostrar aviso' }).first().click()
    await expect(toastTitle(page)).toBeVisible()
    await page.keyboard.press('F8')
    expect(await focusedInside(page.getByRole('region', { name: /Avisos/ }))).toBe(true)
  })

  test('el stepper distingue pasos sin depender del color (2.4)', async ({ page }) => {
    await page.goto('/#/componentes/stepper')
    const stepper = doc(page, 'stepper').getByRole('list').first()
    await expect(stepper.locator('[aria-current="step"]')).toHaveCount(1)
    await expect(stepper.locator('[aria-current="step"]')).toContainText('Escribir el guion')
    await expect(stepper.getByText('completado', { exact: true })).toHaveCount(2)
    await expect(stepper.getByText('pendiente', { exact: true })).toHaveCount(2)
    await expect(doc(page, 'stepper').getByText('Paso 3 de 5').first()).toBeVisible()
  })
})
