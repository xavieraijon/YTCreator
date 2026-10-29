import { expect, test } from '@playwright/test'
import { blockExternal, choose, connectAccount, heading, startServer, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4392 })
})

test.afterAll(async () => {
  await server.stop()
})

test('closing YTCreator on any step and opening it again comes back to the same step (FR-020)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  const reopenAt = async (title: string) => {
    await server.restart()
    await page.goto(server.baseURL)
    await expect(heading(page, title)).toBeVisible()
  }

  await page.goto(server.baseURL)
  await expect(heading(page, 'Te damos la bienvenida a YTCreator')).toBeVisible()
  await reopenAt('Te damos la bienvenida a YTCreator')

  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
  await reopenAt('Elige cómo usar la IA')

  await choose(page, 'Usar mi suscripción de Claude')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Conecta tu suscripción de Claude')).toBeVisible()
  await reopenAt('Conecta tu suscripción de Claude')

  // The connected account survives the restart too.
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await reopenAt('Conecta tu suscripción de Claude')
  await expect(page.getByText(/^Cuenta 1 · /)).toBeVisible()

  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await reopenAt('Todo listo')

  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await expect(heading(page, 'Inicio')).toBeVisible()
  await reopenAt('Inicio')
})
