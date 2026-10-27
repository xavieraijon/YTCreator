import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

/** Component ids, read from the catalog navigation so the list always matches the registry. */
async function componentIds(page: Page) {
  await page.goto('/')
  const hrefs = await page
    .locator('a[href^="#/componentes/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  return hrefs.map((href) => href.replace('#/componentes/', ''))
}

for (const theme of ['light', 'dark'] as const) {
  test(`fichas de componentes sin infracciones de axe en tema ${theme} (SC-002)`, async ({ page }) => {
    test.setTimeout(120_000)
    const ids = await componentIds(page)
    expect(ids.length).toBeGreaterThan(0)

    await page.evaluate((value) => localStorage.setItem('ytc.theme', value), theme)
    const failures: string[] = []
    for (const id of ids) {
      await page.goto(`/#/componentes/${id}`)
      await page.reload()
      await expect(page.getByTestId(`doc-${id}`)).toBeVisible()
      const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze()
      for (const violation of violations) {
        failures.push(`${id}: ${violation.id} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`)
      }
    }
    expect(failures).toEqual([])
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`página de muestra sin infracciones de axe en tema ${theme} (SC-002)`, async ({ page }) => {
    await page.goto('/')
    await page.evaluate((value) => localStorage.setItem('ytc.theme', value), theme)
    await page.goto('/#/muestra')
    await page.reload()
    const main = page.locator('#main')
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
    await main.getByText('Modo experto', { exact: true }).click()

    const failures = async () => {
      const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze()
      return violations.map(
        (violation) => `${violation.id} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
      )
    }
    expect(await failures()).toEqual([])

    // The result and the toast only exist after a generation, so they are checked too.
    await main.getByRole('button', { name: 'Generar propuesta' }).click()
    await expect(main.getByRole('heading', { name: 'Tu propuesta' })).toBeVisible({ timeout: 10_000 })
    expect(await failures()).toEqual([])
  })
}
