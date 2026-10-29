import { expect, test, type Page } from '@playwright/test'
import { blockExternal, connectAccount, FAKE_KEY, heading, startServer, toConnect, type TestServer } from './server.ts'

// Each failure comes from the fake AI (YTCREATOR_FAKE_AI), on a YTCreator of its own: nothing leaves the machine.
let server: TestServer | null = null

test.afterEach(async () => {
  await server?.stop()
  server = null
})

async function open(page: Page, scenario: string) {
  server = await startServer({ port: 4394, scenario })
  await blockExternal(page.context())
  await page.goto(server.baseURL)
}

async function saveKey(page: Page) {
  await toConnect(page, 'Pagar solo lo que uses')
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await page.getByLabel('Tu clave').fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
}

async function toSubscription(page: Page) {
  await toConnect(page, 'Usar mi suscripción de Claude')
  await expect(heading(page, 'Conecta tu suscripción de Claude')).toBeVisible()
}

test('an invalid key says so and offers a new one', async ({ page }) => {
  await open(page, 'sin_sesion:clave_no_valida')
  await saveKey(page)
  await expect(page.getByText('La clave no es válida.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Conseguir una clave nueva' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0)
})

test('no internet while checking the key offers to check again', async ({ page }) => {
  await open(page, 'no_disponible:sin_conexion')
  await saveKey(page)
  await expect(page.getByText('No hay conexión a internet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Comprobar ahora' })).toBeVisible()
})

test('a slow check gets «Cancelar» after a few seconds, and cancelling leaves no error', async ({ page }) => {
  await open(page, 'lento')
  await saveKey(page)
  await expect(page.getByText('Comprobando tu clave…')).toBeVisible()
  const cancel = page.getByRole('button', { name: 'Cancelar' })
  await expect(cancel).toBeVisible({ timeout: 10_000 })
  await cancel.click()
  await expect(page.getByText('Comprobando tu clave…')).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Comprobar y guardar' })).toBeEnabled()
})

test('a plan without Claude Code offers another option, which goes back to choosing', async ({ page }) => {
  await open(page, 'sin_sesion:plan_sin_acceso')
  await toSubscription(page)
  await connectAccount(page)
  await expect(page.getByText('Tu plan de Claude no incluye Claude Code.').first()).toBeVisible()
  await page.getByRole('button', { name: 'Elegir otra opción' }).first().click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
})

test('an account out of quota is kept, with the date it comes back', async ({ page }) => {
  await open(page, 'cupo:2026-11-02T18:00:00.000Z')
  await toSubscription(page)
  await connectAccount(page)
  await expect(page.getByText(/^Cuenta 1 · Sin cupo hasta el /)).toBeVisible()
  await expect(page.getByText(/Has llegado al límite de uso hasta el /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar de opción' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0)
})

test('a wrong code asks for a new link', async ({ page }) => {
  await open(page, 'login:codigo_malo')
  await toSubscription(page)
  await connectAccount(page)
  await expect(page.getByText('El código no es válido o ha caducado.')).toBeVisible()
  const popup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Pedir un enlace nuevo' }).click()
  await (await popup).close()
  await expect(page.getByLabel('Código de Claude')).toBeVisible()
})

test('the same account twice is refused and the first one stays', async ({ page }) => {
  await open(page, 'login:duplicada')
  await toSubscription(page)
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir otra cuenta' }).click()
  await connectAccount(page)
  await expect(page.getByText('Esta cuenta ya está conectada.')).toBeVisible()
  await expect(page.getByText(/^Cuenta \d · /)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled()
})
