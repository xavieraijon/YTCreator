import { expect, test } from '@playwright/test'
import { blockExternal, choose, heading, startServer, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4393 })
})

test.afterAll(async () => {
  await server.stop()
})

test('a step taken in another tab wins: the stale tab moves to it instead of overwriting it (FR-020)', async ({
  context,
}) => {
  await blockExternal(context)
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto(server.baseURL)
  await second.goto(server.baseURL)
  await expect(heading(first, 'Te damos la bienvenida a YTCreator')).toBeVisible()
  await expect(heading(second, 'Te damos la bienvenida a YTCreator')).toBeVisible()

  // The first tab moves on twice; the second still shows the welcome.
  await first.getByRole('button', { name: 'Empezar' }).click()
  await choose(first, 'Pagar solo lo que uses')
  await first.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(first, 'Conecta tu clave de Anthropic')).toBeVisible()

  // Its old revision gets a conflict, and it lands where the first tab is.
  await second.getByRole('button', { name: 'Empezar' }).click()
  await expect(heading(second, 'Conecta tu clave de Anthropic')).toBeVisible()
  await expect(second).toHaveURL(/\/bienvenida\/conectar$/)

  // The first tab was not moved back.
  await first.reload()
  await expect(heading(first, 'Conecta tu clave de Anthropic')).toBeVisible()
})
