import { expect, test } from '@playwright/test'
import { blockExternal, heading, startServer, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4398 })
})

test.afterAll(async () => {
  await server.stop()
})

test('the second click of a double click on «Empezar» does not choose for the creator', async ({ page, context }) => {
  await blockExternal(context)
  await page.goto(server.baseURL)
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
  // Paying per use is folded (decision 1 of 002): what is under the pointer is the subscription, already marked.
  await page.getByText('Usar mi suscripción de Claude', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /Usar mi suscripción de Claude/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Pagar solo lo que uses/ })).toHaveCount(0)
})
