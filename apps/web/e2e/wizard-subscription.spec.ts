import { expect, test } from '@playwright/test'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4390 })
})

test.afterAll(async () => {
  await server.stop()
})

test('the whole wizard with the subscription, two accounts, and the home afterwards (US2)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await page.goto(server.baseURL)

  // FR-018: what is needed; only the subscription has a link (decision 1 of 002).
  await expect(heading(page, 'Te damos la bienvenida a YTCreator')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver las suscripciones de Claude' })).toHaveAttribute(
    'href',
    /claude\.ai/,
  )
  await expect(page.getByText(/también vale una cuenta de Anthropic con saldo/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crear una cuenta de Anthropic' })).toHaveCount(0)
  // The header has no badge nor settings during the wizard.
  await expect(page.getByRole('link', { name: 'Ajustes' })).toHaveCount(0)

  await toConnect(page, 'Usar mi suscripción de Claude')
  await expect(heading(page, 'Conecta tu suscripción de Claude')).toBeVisible()
  await expect(page).toHaveURL(/\/bienvenida\/conectar$/)

  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()

  await page.getByRole('button', { name: 'Añadir otra cuenta' }).click()
  await connectAccount(page)
  await expect(page.getByText('Cuenta 2 · Funciona')).toBeVisible()
  await expect(page.getByText(/no puede saber si dos accesos son de la misma cuenta/)).toBeVisible()

  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await expect(page.getByText('Usas: Tu suscripción de Claude.')).toBeVisible()

  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await expect(heading(page, 'Inicio')).toBeVisible()
  await expect(page).toHaveURL(/\/inicio$/)
  await expect(page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' })).toHaveAttribute(
    'href',
    '/ajustes/ia',
  )

  // «Crear mi primer canal» leads to the start of the channel.
  await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByRole('button', { name: 'Crear mi canal' })).toBeVisible()

  // Once completed, the wizard routes lead home.
  await page.goto(`${server.baseURL}/bienvenida`)
  await expect(page).toHaveURL(/\/inicio$/)
})
