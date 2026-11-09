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

const toScript = async (page: Page) => {
  await page.goto(`${server.baseURL}/canal/guiones`)
  await page.getByRole('button', { name: 'Abrir el guion de «Pan sin amasar»' }).click()
}
const paragraphOf = (page: Page, title: RegExp) =>
  page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .locator('p')
    .first()

test('from the approved outline to a script edited by hand and block by block (US2)', async ({ page, context }) => {
  await blockExternal(context)
  await toScript(page)

  // Approved, the next thing to do is on screen, with its price.
  const write = page.getByRole('button', { name: /^Escribir el guion/ })
  await expect(write).toBeEnabled()
  await expect(write).toContainText('·')
  await write.click()
  await expect(page.getByText('Esto es lo que vas a decir.')).toBeVisible()
  await expect(page.getByText('Voz del canal: de tú y cercano, por defecto.')).toBeVisible()
  await expect(page.getByText('Opinión de la IA')).toBeVisible()
  await audit(page)

  // A mark is a button, and what is done with it brings the count down.
  const counter = page.getByText(/por comprobar$/)
  await expect(counter).toBeVisible()
  const count = await counter.innerText()
  const mark = page.getByRole('button', { name: 'Por comprobar: Esta parte sale del guion' })
  await mark.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await audit(page)
  await dialog.getByRole('button', { name: 'Es correcto' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'por comprobar' })).not.toHaveText(count)
  await expect(mark).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'por comprobar' })).toBeFocused()

  // Edit by hand: nothing is spent, the time changes.
  await page.getByRole('button', { name: 'Cambiar «Por qué pasa esto»' }).click()
  const spoken = page.getByLabel('Lo que se dice')
  await expect(spoken).toBeFocused()
  await spoken.fill('Lo cuento yo con mis palabras y sin prisa ninguna.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(paragraphOf(page, /Por qué pasa esto/)).toHaveText('Lo cuento yo con mis palabras y sin prisa ninguna.')
  await expect(page.getByRole('button', { name: 'Cambiar «Por qué pasa esto»' })).toBeFocused()

  // Ask for one block: only that one changes.
  const before = await paragraphOf(page, /Por qué pasa esto/).innerText()
  await page.getByRole('button', { name: 'Pedir de nuevo este bloque «Lo que hay que cambiar primero»' }).click()
  await page.getByLabel('Qué quieres que cambie en este bloque').fill('Más corto')
  const again = page.getByRole('button', { name: /^Pedir de nuevo este bloque ·/ })
  await expect(again).toBeEnabled()
  await again.click()
  await expect(paragraphOf(page, /Lo que hay que cambiar primero/)).toContainText('escrito de nuevo')
  await expect(paragraphOf(page, /Por qué pasa esto/)).toHaveText(before)
  await expect(page.getByRole('button', { name: 'Por comprobar: dos millones' })).toBeVisible()

  // Asking for a block with another one open saves what was being written first.
  await page.getByRole('button', { name: 'Cambiar «Por qué pasa esto»' }).click()
  await page.getByLabel('Lo que se dice').fill('Esto no se pierde.')
  await page
    .getByRole('button', { name: 'Pedir de nuevo este bloque «El error que comete casi todo el mundo»' })
    .click()
  const first = page.getByRole('button', { name: /^Pedir de nuevo este bloque ·/ })
  await expect(first).toBeEnabled()
  await first.click()
  await expect(paragraphOf(page, /Por qué pasa esto/)).toHaveText('Esto no se pierde.')
  await expect(paragraphOf(page, /El error que comete/)).toContainText('escrito de nuevo')

  // Two tabs: the one that is late is told, and keeps what it wrote.
  const other = await context.newPage()
  await toScript(other)
  await other.getByRole('button', { name: 'Guion', exact: true }).click()
  await other.getByRole('button', { name: 'Cambiar «Por qué pasa esto»' }).click()
  await page.getByRole('button', { name: 'Cambiar «Qué hacer esta noche»' }).click()
  await page.getByLabel('Lo que se dice').fill('Esto va primero.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(paragraphOf(page, /Qué hacer esta noche/)).toHaveText('Esto va primero.')
  await other.getByLabel('Lo que se dice').fill('Esto llega tarde.')
  await other.getByRole('button', { name: 'Guardar' }).click()
  await expect(other.getByLabel('Lo que se dice')).toHaveValue('Esto llega tarde.')
  await expect(other.getByRole('alert').first()).toBeVisible()
  await other.close()

  // Closing the tab does not stop it: the result is there on coming back.
  await page.reload()
  await page.getByRole('button', { name: 'Guion', exact: true }).click()
  await page.getByText('Quiero otro guion').click()
  const started = page.waitForResponse((response) => response.url().endsWith('/generate'))
  await page.getByRole('button', { name: /^Pedir otro guion/ }).click()
  await started
  await page.close()
  const back = await context.newPage()
  await toScript(back)
  await back.getByRole('button', { name: 'Guion', exact: true }).click()
  await expect(paragraphOf(back, /Por qué pasa esto/)).toContainText('Esto es lo que dirías', { timeout: 15_000 })

  // The voice: what is written stays, and it says what it uses now.
  const written = await paragraphOf(back, /Por qué pasa esto/).innerText()
  await back.getByRole('button', { name: 'Cambiar la voz' }).click()
  await expect(back.getByRole('heading', { name: 'Voz del canal', level: 1 })).toBeVisible()
  await audit(back)
  await back.getByRole('radio', { name: 'de usted' }).check()
  await back.getByRole('button', { name: 'Guardar' }).click()
  await expect(back.getByText('Guardado', { exact: true })).toBeVisible()
  await toScript(back)
  await expect(back.getByText('Voz del canal: de usted y cercano.')).toBeVisible()
  await expect(paragraphOf(back, /Por qué pasa esto/)).toHaveText(written)
})
