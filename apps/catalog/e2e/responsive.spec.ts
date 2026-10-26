import { expect, test, type Page } from '@playwright/test'

/** Every page of the catalog, read from its navigation, plus the sample. */
async function catalogPaths(page: Page) {
  await page.goto('/')
  const hrefs = await page
    .locator('a[href^="#/fundamentos/"], a[href^="#/componentes/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  return ['#/', ...new Set(hrefs), '#/muestra']
}

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

for (const width of [375, 320]) {
  test(`sin desplazamiento horizontal a ${width} px (SC-005)`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 800 })
    const paths = await catalogPaths(page)
    expect(paths.length).toBeGreaterThan(3)

    const failures: string[] = []
    for (const path of paths) {
      await page.goto(`/${path}`)
      await expect(page.locator('#main h1').first()).toBeVisible()
      if (await overflows(page)) failures.push(path)
    }
    expect(failures).toEqual([])
  })
}

test('los controles de la muestra miden al menos 24 × 24 px (2.5.8)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/#/muestra')
  const main = page.locator('#main')
  await main.getByText('Modo experto', { exact: true }).click()

  const small = await main.locator('button, a[href], input, select, textarea, summary').evaluateAll((elements) =>
    elements
      .filter((element) => element.checkVisibility())
      .map((element) => {
        // A radio, checkbox or switch is picked from its whole row (or card), not only from the small box.
        const checkable = element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)
        const target = (checkable && element.parentElement) || element
        const { width, height } = target.getBoundingClientRect()
        return { name: element.getAttribute('name') ?? element.textContent?.trim() ?? element.tagName, width, height }
      })
      .filter(({ width, height }) => width < 24 || height < 24),
  )
  expect(small).toEqual([])
})
