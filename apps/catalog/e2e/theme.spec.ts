import { expect, test, type Page } from '@playwright/test'

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const dataTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null)
const option = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })

function collectConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('tema', () => {
  test('sin preferencia sigue al sistema en oscuro (1.1)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const light = await background(page)

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    await expect(option(page, 'Automático')).toBeChecked()
    expect(await dataTheme(page)).toBeNull()
    expect(await background(page)).not.toBe(light)
  })

  test('en «automático» cambia en caliente con el sistema (1.2)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const light = await background(page)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => background(page)).not.toBe(light)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => background(page)).toBe(light)
  })

  test('«Claro» se recuerda aunque el sistema esté en oscuro (1.3)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const light = await background(page)

    await option(page, 'Claro').check()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()

    await expect(option(page, 'Claro')).toBeChecked()
    expect(await dataTheme(page)).toBe('light')
    expect(await background(page)).toBe(light)
  })

  test('con el almacenamiento bloqueado queda en «automático» sin errores', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await page.addInitScript(() => {
      const fail = () => {
        throw new DOMException('Bloqueado', 'SecurityError')
      }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: fail })
    })
    await page.goto('/')

    await expect(option(page, 'Automático')).toBeChecked()
    await option(page, 'Oscuro').check()
    await expect(option(page, 'Oscuro')).toBeChecked()
    expect(errors).toEqual([])
  })

  test('un valor corrupto equivale a «automático»', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ytc.theme', 'sepia'))
    await page.goto('/')

    await expect(option(page, 'Automático')).toBeChecked()
    expect(await dataTheme(page)).toBeNull()
  })

  test('10 cargas con tema guardado sin destello (SC-006)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('ytc.theme', 'dark')
        sessionStorage.setItem('seeded', 'true')
      }
      document.addEventListener('DOMContentLoaded', () => {
        Object.assign(window, {
          firstPaint: {
            theme: document.documentElement.dataset.theme ?? null,
            background: getComputedStyle(document.body).backgroundColor,
          },
        })
      })
    })

    await page.goto('/')
    const settled = await background(page)

    for (let load = 0; load < 10; load++) {
      await page.reload()
      const firstPaint = await page.evaluate(
        () => (window as unknown as { firstPaint: { theme: string | null; background: string } }).firstPaint,
      )
      expect(firstPaint).toEqual({ theme: 'dark', background: settled })
    }
  })
})
