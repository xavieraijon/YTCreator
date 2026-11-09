import { expect, type Page, test } from '@playwright/test'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The steps of specs/004-idea-bank/quickstart.md that the other journeys of the bank do not walk (T064): a batch
// with repeated ideas, a measure without the reader, and the filter by semaphore.
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4402 })
})

test.afterAll(async () => {
  await server.stop()
})

const card = (page: Page, title: string) =>
  page
    .getByRole('region', { name: 'Tus ideas' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })

test('quickstart: repeated ideas taken out, a measure without the reader, the filter by semaphore', async ({
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
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const broadQuery = 'pan con publico'
  for (const idea of [
    { title: 'Hueco', query: 'pan idea hueco', broadQuery },
    { title: 'Quemada', query: 'pan idea quemada', broadQuery },
    { title: 'Sin lector', query: 'pan sin lector', broadQuery },
    { title: 'Sin búsquedas' },
  ]) {
    await api(server, 'POST', `/api/channels/${channelId}/ideas`, { format: 'largo', ...idea })
  }

  // Quickstart 2.6: a batch that repeats two ideas of the bank says so, and they are taken out.
  await server.restart('ideas_repetidas')
  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(heading(page, 'Banco de ideas')).toBeVisible()
  await page.getByRole('button', { name: /Proponer más ideas de vídeo/ }).click()
  const batch = page.getByRole('region', { name: 'Ideas propuestas' })
  await expect(batch.getByText('La IA repitió 2 ideas que ya tenías; las hemos quitado.')).toBeVisible()
  await expect(batch.getByRole('heading', { name: 'Hueco', exact: true })).toHaveCount(0)

  // Quickstart 3: without the reader the idea stays «Sin medir», with «Ir a Ajustes» and the way to measure again.
  await server.restart('ok')
  await page.reload()
  await card(page, 'Sin lector').getByRole('button', { name: '¿Tiene hueco? «Sin lector»' }).click()
  await expect(card(page, 'Sin lector').getByRole('button', { name: 'Ir a Ajustes' })).toBeVisible({ timeout: 30_000 })
  await expect(card(page, 'Sin lector').getByText('Sin medir')).toBeVisible()
  await expect(card(page, 'Sin lector').getByRole('button', { name: '¿Tiene hueco? «Sin lector»' })).toBeVisible()
  await card(page, 'Hueco').getByRole('button', { name: '¿Tiene hueco? «Hueco»' }).click()
  await expect(card(page, 'Hueco').getByText('Hay hueco', { exact: true })).toBeVisible({ timeout: 30_000 })

  // Quickstart 5.2: the filter «Hay hueco» leaves that one only.
  await page.getByRole('combobox', { name: 'Semáforo' }).click()
  await page.getByRole('option', { name: 'Hay hueco' }).click()
  await expect(page.getByRole('region', { name: 'Tus ideas' }).getByRole('heading', { level: 3 })).toHaveText(['Hueco'])

  // Decision 66: an idea of one's own saved under a filter is seen, because saving clears the filters.
  await page.getByText('Escribir una idea mía').click()
  await page.getByRole('textbox', { name: 'Título' }).fill('Guardada con filtro')
  await page.getByRole('button', { name: 'Guardar la idea' }).click()
  await expect(card(page, 'Guardada con filtro')).toBeVisible()
  await expect(card(page, 'Quemada')).toBeVisible()

  // Quickstart 3: «Medir con el título» writes the searches from the title and measures, without the AI.
  await card(page, 'Sin búsquedas').getByRole('button', { name: 'Medir con el título «Sin búsquedas»' }).click()
  await expect(card(page, 'Sin búsquedas').getByText('Sin medir')).toHaveCount(0, { timeout: 30_000 })

  // Novice audit 004, round 2: angles that only repeat say so and what it cost, and the request keeps what was written.
  await card(page, 'Quemada').getByRole('button', { name: '¿Tiene hueco? «Quemada»' }).click()
  await expect(card(page, 'Quemada').getByText('Quemado', { exact: true })).toBeVisible({ timeout: 30_000 })
  await card(page, 'Quemada').getByRole('button', { name: 'Buscar otro enfoque «Quemada»' }).click()
  const wish = card(page, 'Quemada').getByRole('textbox')
  await wish.fill('para gente que empieza')
  // The server's own answer, as if every angle had been taken out as a repeat.
  await page.route('**/api/ideas/*/angles', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...((await response.json()) as object), candidates: [] } })
  })
  await card(page, 'Quemada')
    .getByRole('button', { name: /^Buscar otro enfoque · / })
    .click()
  // In the toast: the live region repeats the text a moment later, so the page alone can match it twice.
  await expect(
    page.getByRole('region', { name: /^Avisos/ }).getByText(/no hay ninguna nueva\. La petición cuenta en tu consumo/),
  ).toBeVisible()
  await expect(wish).toHaveValue('para gente que empieza')
  await expect(card(page, 'Quemada').getByRole('button', { name: /^Buscar otro enfoque · / })).toBeEnabled()
})
