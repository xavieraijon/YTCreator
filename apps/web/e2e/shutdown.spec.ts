import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// Closing YTCreator stops the server, so this spec runs its own instance (built by the shared webServer) on
// another port and with another HOME: the shared server stays up for the other specs.
const port = 4398
const baseURL = `http://127.0.0.1:${port}`
const serverMjs = fileURLToPath(new URL('../../server/dist/server.mjs', import.meta.url))

let server: ChildProcess | null = null

async function healthResponds(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) })
    return response.ok
  } catch {
    return false
  }
}

test.beforeAll(async () => {
  const home = mkdtempSync(join(tmpdir(), 'ytcreator-e2e-shutdown-'))
  server = spawn(process.execPath, [serverMjs, 'serve'], {
    env: {
      ...process.env,
      YTCREATOR_FAKE_AI: 'ok',
      YTCREATOR_PORT: String(port),
      HOME: home,
      XDG_DATA_HOME: join(home, '.local', 'share'),
    },
    stdio: 'ignore',
  })
  await expect.poll(healthResponds, { timeout: 15_000 }).toBe(true)
})

test.afterAll(() => {
  server?.kill()
})

test('«Cerrar YTCreator» asks first, then stops the server and shows the final message (FR-006)', async ({ page }) => {
  await page.goto(`${baseURL}/inicio`)

  await page.getByRole('button', { name: 'Cerrar YTCreator' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Cerrar YTCreator?' })
  await expect(dialog).toBeVisible()

  // «Seguir usándolo» keeps it running.
  await dialog.getByRole('button', { name: 'Seguir usándolo' }).click()
  await expect(dialog).toBeHidden()
  expect(await healthResponds()).toBe(true)

  await page.getByRole('button', { name: 'Cerrar YTCreator' }).click()
  await dialog.getByRole('button', { name: 'Sí, cerrar' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'YTCreator se ha cerrado. Puedes cerrar esta pestaña.' }),
  ).toBeFocused()
  await expect(page.getByRole('button', { name: 'Cerrar YTCreator' })).toHaveCount(0)
  await expect.poll(healthResponds, { timeout: 5_000 }).toBe(false)
})
