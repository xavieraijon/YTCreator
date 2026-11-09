import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The script of an idea, story by story (specs/005-script-and-outline/quickstart.md).
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4460 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

const blockTitles = (page: Page) =>
  page.getByRole('main').getByRole('listitem').getByRole('heading', { level: 2 }).allInnerTexts()

async function connect(page: Page) {
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)
}

test('from a chosen idea to an approved outline, with the keyboard, surviving a reload (US1)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id

  // With no scripts it says where to start.
  await page.goto(`${server.baseURL}/canal/guiones`)
  await expect(heading(page, 'Mis guiones')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Todavía no tienes guiones' })).toBeVisible()
  await audit(page)

  const { idea } = (await api(server, 'POST', `/api/channels/${channelId}/ideas`, {
    title: 'Pan sin amasar',
    format: 'largo',
    hook: 'El truco que lo cambia todo',
    query: 'pan sin amasar en casa',
  })) as { idea: { id: string; revision: number } }
  await api(server, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })

  await page.goto(`${server.baseURL}/canal/ideas`)
  await page.getByRole('button', { name: 'Preparar el guion de «Pan sin amasar»' }).click()
  await expect(heading(page, 'Pan sin amasar')).toBeVisible()
  await expect(page.getByText('Dato concreto: pan sin amasar en casa')).toBeVisible()
  await expect(page.getByText('Formato: Vídeo largo')).toBeVisible()
  await expect(page.getByLabel('Cuánto quieres que dure, en minutos')).toHaveValue('10')
  await expect(page.getByText('La escaleta es el esquema de tu vídeo', { exact: false })).toBeVisible()
  await audit(page)

  await page.getByLabel('Tus apuntes').fill('Harina, agua y tiempo.')
  // The price is on the button before anything is asked for.
  const propose = page.getByRole('button', { name: /^Proponer escaleta/ })
  await expect(propose).toBeEnabled()
  await expect(propose).toContainText('·')
  await propose.click()

  await expect(page.getByRole('heading', { level: 2, name: /El error que comete/ })).toBeVisible()
  await expect(page.getByText('En total, unos 10 min. Querías 10 min.')).toBeVisible()
  await audit(page)

  // By keyboard, and the focus stays on the same button of the same block.
  const down = page.getByRole('button', { name: 'Bajar «El error que comete casi todo el mundo»' })
  await down.focus()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await blockTitles(page))[1]).toContain('El error que comete')
  await expect(down).toBeFocused()
  const up = page.getByRole('button', { name: 'Subir «El error que comete casi todo el mundo»' })
  await up.click()
  await expect.poll(async () => (await blockTitles(page))[0]).toContain('El error que comete')

  // Change a block.
  await page.getByRole('button', { name: 'Cambiar «Qué hacer mañana»' }).click()
  const titleField = page.getByLabel('De qué va este bloque')
  await expect(titleField).toBeFocused()
  // What is being typed cannot be approved or replaced from outside.
  await expect(page.getByRole('button', { name: 'Aprobar la escaleta' })).toBeDisabled()
  await expect(page.getByText('Guarda o cancela el bloque')).toBeVisible()
  await audit(page)
  await titleField.fill('Qué hacer esta noche')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: /Qué hacer esta noche/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar «Qué hacer esta noche»' })).toBeFocused()

  // The price moved between looking and pressing: nothing is spent and the new one is shown.
  await page.getByText('Quiero otra escaleta').click()
  const again = page.getByRole('button', { name: /Pedir otra escaleta/ })
  await expect(again).toBeEnabled()
  await page.route('**/api/scripts/*/estimate', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), cents: 999 } })
  })
  await again.click()
  await expect(page.getByText('El coste ha cambiado')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Qué hacer esta noche/ })).toBeVisible()
  await page.unroute('**/api/scripts/*/estimate')

  // A price that cannot be worked out says so, with a way out.
  await page.route('**/api/scripts/*/estimate', (route) =>
    route.fulfill({ status: 409, json: { error: { code: 'sin_conexion' } } }),
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Volver a intentarlo' }).first()).toBeVisible()
  await page.unroute('**/api/scripts/*/estimate')
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: /Qué hacer esta noche/ })).toBeVisible()

  await page.getByRole('button', { name: 'Aprobar la escaleta' }).click()
  await expect(page.getByText('Escaleta aprobada.', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Escaleta aprobada.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Qué hacer esta noche/ })).toBeVisible()
  await audit(page)

  // The list says where it was left.
  await page.getByRole('button', { name: 'Volver a mis guiones' }).click()
  await expect(page.getByText('Escaleta aprobada', { exact: true })).toBeVisible()
  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(page.getByRole('button', { name: 'Seguir con el guion de «Pan sin amasar»' })).toBeVisible()
})
