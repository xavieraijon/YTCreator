import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The idea bank with the fakes (specs/004-idea-bank/quickstart.md).
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4378 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

test('fills the bank: a batch of the AI, two kept, the rest left, and one of their own (US1)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)

  // From the channel to the bank.
  await page.goto(`${server.baseURL}/canal`)
  await page.getByRole('button', { name: 'Ir al banco de ideas' }).click()
  await expect(page).toHaveURL(/\/canal\/ideas$/)
  await expect(heading(page, 'Banco de ideas')).toBeVisible()
  await expect(page.getByText('Todavía no tienes ideas en el banco.')).toBeVisible()
  await audit(page)

  // A batch: two kept, the rest left.
  await page.getByRole('button', { name: /Proponer ideas de vídeo/ }).click()
  const batch = page.getByRole('region', { name: 'Ideas propuestas' })
  await expect(batch.getByRole('listitem').first()).toBeVisible()
  await audit(page)
  for (let kept = 0; kept < 2; kept += 1) {
    await batch
      .getByRole('button', { name: /^Me la quedo «/ })
      .first()
      .click()
    await expect(batch.getByText('Te la has quedado.')).toHaveCount(kept + 1)
    // The focus goes to what replaced the button, not to the page.
    await expect(batch.getByText('Te la has quedado.').nth(kept)).toBeFocused()
  }
  while ((await batch.getByRole('button', { name: /^No me interesa «/ }).count()) > 0) {
    const left = await batch.getByRole('button', { name: /^No me interesa «/ }).count()
    await batch
      .getByRole('button', { name: /^No me interesa «/ })
      .first()
      .click()
    await expect(batch.getByRole('button', { name: /^No me interesa «/ })).toHaveCount(left - 1)
  }
  await expect(batch).toHaveCount(0)
  const list = page.getByRole('region', { name: 'Tus ideas' })
  await expect(list.getByRole('listitem')).toHaveCount(2)

  // One of their own, a Short.
  await page.getByText('Escribir una idea mía').click()
  await page.getByRole('textbox', { name: 'Título' }).fill('Mi receta de pan sin amasar')
  await page.getByText('Short', { exact: true }).last().click()
  await audit(page)
  await page.getByRole('button', { name: 'Guardar la idea' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(list.getByText('Tuya', { exact: true })).toBeVisible()

  // The same title again, written another way: it is saved, and the app says the bank already had it (R15).
  await page.getByRole('textbox', { name: 'Título' }).fill('mi receta de pan sin amasar')
  await page.getByRole('button', { name: 'Guardar la idea' }).click()
  await expect(page.getByText('Ya tenías una idea con el mismo título: «Mi receta de pan sin amasar».')).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(4)

  // Everything is still there after a reload.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Tus ideas' }).getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /Proponer más ideas de vídeo/ })).toBeVisible()
  await audit(page)
})
