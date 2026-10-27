import { expect, test, type Locator, type Page } from '@playwright/test'

/** WebKit on macOS skips buttons and links with a bare Tab, as Safari does; Alt+Tab reaches every control. */
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab')

/** Tabs forward from the current focus until `target` has it. */
async function tabTo(page: Page, target: Locator, limit = 30) {
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press(tabKey(page))
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('The target never got the focus')
}

test('el paso de muestra se completa solo con teclado y sin red (escenario 4.1, SC-003)', async ({ page }) => {
  await page.goto('/#/muestra')
  const main = page.locator('#main')
  await expect(main.getByRole('heading', { level: 1, name: 'Elige el enfoque de tu vídeo' })).toBeVisible()

  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await main.focus()
  await tabTo(page, main.getByRole('radio', { name: /Tutorial paso a paso/ }))
  await page.keyboard.press('ArrowDown')
  await expect(main.getByRole('radio', { name: /Historia personal/ })).toBeChecked()

  const audience = main.getByRole('textbox', { name: /¿A quién va dirigido\?/ })
  await tabTo(page, audience)
  await page.keyboard.type('gente que empieza a correr')
  await expect(audience).toHaveValue('gente que empieza a correr')

  const expert = main.getByText('Modo experto', { exact: true })
  await tabTo(page, expert)
  await page.keyboard.press('Enter')
  const length = main.getByRole('combobox', { name: 'Duración del vídeo' })
  await expect(length).toBeVisible()

  const generate = main.getByRole('button', { name: 'Generar propuesta' })
  await tabTo(page, generate)
  await page.keyboard.press('Space')

  await expect(main.getByRole('status').filter({ hasText: 'Preparando la propuesta de tu vídeo…' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Tu propuesta' })).toBeVisible({ timeout: 10_000 })
  await expect(main.getByRole('textbox', { name: 'Título' })).toBeEditable()
  await expect(page.getByRole('region', { name: /Avisos/ }).getByText('Propuesta lista', { exact: true })).toBeVisible()
  await expect(main.getByRole('status').filter({ hasText: 'Preparando' })).toHaveCount(0)
  // The hook follows the switch, which was left off: a statement, not a question.
  await expect(main.getByRole('textbox', { name: 'Primera frase' })).not.toHaveValue(/^¿/)
  await expect(main.getByRole('button', { name: 'Seguir al guion' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Probar otra propuesta' })).toBeVisible()

  expect(requests).toEqual([])
})
