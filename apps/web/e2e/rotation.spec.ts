import { expect, test } from '@playwright/test'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4396 })
})

test.afterAll(async () => {
  await server.stop()
})

test('when the first account runs out of quota, the next one takes over and the creator is told (US4)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await page.goto(server.baseURL)

  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir otra cuenta' }).click()
  await connectAccount(page)
  await expect(page.getByText('Cuenta 2 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await expect(heading(page, 'Inicio')).toBeVisible()

  // From now on Claude says the first account has no quota left.
  await server.restart('cuentas:cupo,ok')
  await page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' }).click()
  await expect(heading(page, 'Ajustes')).toBeVisible()
  await expect(page).toHaveURL(/\/ajustes\/ia$/)

  await page.getByRole('button', { name: 'Comprobar ahora' }).click()
  await expect(page.getByText('Cuenta 1 se ha quedado sin cupo. Ahora usas Cuenta 2.')).toBeVisible()

  const accounts = page.getByRole('region', { name: 'Cuentas de suscripción' }).getByRole('listitem')
  await expect(accounts).toHaveCount(2)
  await expect(accounts.nth(0)).toContainText(/Sin cupo hasta el/)
  await expect(accounts.nth(1)).toContainText('Funciona')
  // The option keeps working: the work goes on with the second account.
  await expect(page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' })).toBeVisible()
})
