import { expect, test, type Page } from '@playwright/test'
import { blockExternal, choose, heading, startServer, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4391 })
})

test.afterAll(async () => {
  await server.stop()
})

const postponeAndResume = async (page: Page, title: string) => {
  await page.getByRole('button', { name: 'Lo haré más tarde' }).click()
  await expect(page).toHaveURL(/\/conectar-ia$/)
  await expect(heading(page, 'Conecta una IA')).toBeVisible()
  await page.getByRole('button', { name: 'Conectar ahora' }).click()
  await expect(heading(page, title)).toBeVisible()
}

test('«Lo haré más tarde» on each step goes to /conectar-ia, and «Conectar ahora» comes back to it (FR-021)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await page.goto(server.baseURL)
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
  await postponeAndResume(page, 'Elige cómo usar la IA')

  await choose(page, 'Pagar solo lo que uses')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await postponeAndResume(page, 'Conecta tu clave de Anthropic')

  // Going back keeps the choice.
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Pagar solo lo que uses/ })).toBeChecked()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()

  // While postponed, the home is reachable and says there is no AI; the wizard routes lead to /conectar-ia.
  await page.getByRole('button', { name: 'Lo haré más tarde' }).click()
  await expect(page).toHaveURL(/\/conectar-ia$/)
  await page.goto(`${server.baseURL}/inicio`)
  await expect(page.getByText('No tienes ninguna IA conectada.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sin IA conectada' })).toBeVisible()
  await page.goto(`${server.baseURL}/bienvenida/conectar`)
  await expect(page).toHaveURL(/\/conectar-ia$/)
})
