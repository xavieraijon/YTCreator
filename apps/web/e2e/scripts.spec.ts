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

test('reviewing for free, approving knowing what is left, downloading and reopening (US3)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await toScript(page)
  await page.getByRole('button', { name: 'Cambiar «El error que comete casi todo el mundo»' }).click()
  // Added to what the AI wrote, so its marks stay.
  const said = page.getByLabel('Lo que se dice')
  await said.fill(`${'Ir poco a poco. '.repeat(30)}Cabe destacar que esto va muy en serio. ${await said.inputValue()}`)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(paragraphOf(page, /El error que comete/)).toContainText('Cabe destacar')
  await page.getByRole('button', { name: 'Revisar el guion' }).click()

  await expect(page.getByText('Lo que se ve aquí se arregla gratis antes de grabar.')).toBeVisible()
  await expect(page.getByText('Suena a texto de IA: «cabe destacar».')).toBeVisible()
  await expect(page.getByText(/Dura unos .* y querías 10 min\./)).toBeVisible()
  await expect(page.getByText(/^El gancho dura unos/)).toBeVisible()
  await audit(page)

  // A notice leads to its block.
  const notice = page.getByRole('listitem').filter({ hasText: 'Suena a texto de IA' })
  await notice.getByRole('button', { name: 'Ir al bloque «El error que comete casi todo el mundo»' }).click()
  await expect(page.getByRole('heading', { level: 2, name: /El error que comete/ })).toBeFocused()
  await page.getByRole('button', { name: 'Revisar el guion' }).click()

  // With marks left, the creator decides.
  await expect(page.getByText(/por comprobar\.$/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar el guion' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /sin comprobar/ })).toBeVisible()
  await audit(page)
  await dialog.getByRole('button', { name: 'Aprobar igualmente' }).click()
  await expect(page.getByText(/Guion aprobado, sabiendo que quedaba/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Guion aprobado, sabiendo que quedaba/)).toBeVisible()

  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar como documento' }).click()
  expect((await downloaded).suggestedFilename()).toBe('guion-pan-sin-amasar.md')

  // In the queue it says so, and the idea is still there.
  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(page.getByText('Guion listo')).toBeVisible()
  await page.getByRole('button', { name: 'Ver el guion de «Pan sin amasar»' }).click()

  // Changing it says first that it will stop being approved.
  await page.getByRole('button', { name: 'Guion', exact: true }).click()
  await page.getByRole('button', { name: 'Cambiar «Por qué pasa esto»' }).click()
  const warning = page.getByRole('dialog')
  await expect(warning.getByRole('heading', { name: 'Si lo cambias, dejará de estar aprobado' })).toBeVisible()
  await warning.getByRole('button', { name: 'Cambiarlo' }).click()
  // While a block is open, leaving the step would lose what is being written.
  await expect(
    page.getByRole('navigation', { name: 'Pasos de este guion' }).getByRole('button', { name: 'Revisar' }),
  ).toBeDisabled()
  await page.getByLabel('Lo que se dice').fill('Ahora lo cambio y deja de estar aprobado.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('button', { name: 'Revisar el guion' }).click()
  await expect(page.getByRole('button', { name: 'Aprobar el guion' })).toBeVisible()
})

test('a Short goes straight to its three parts and warns how much is over (US4)', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const { idea } = (await api(server, 'POST', `/api/channels/${channelId}/ideas`, {
    title: 'Pan en un minuto',
    format: 'short',
  })) as { idea: { id: string; revision: number } }
  await api(server, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })

  await page.goto(`${server.baseURL}/canal/ideas`)
  await page.getByRole('button', { name: 'Preparar el guion de «Pan en un minuto»' }).click()
  await expect(heading(page, 'Pan en un minuto')).toBeVisible()
  await expect(page.getByText('En un Short, los primeros segundos deciden', { exact: false })).toBeVisible()
  await expect(page.getByLabel(/en segundos/)).toHaveValue('45')
  const steps = page.getByRole('navigation', { name: 'Pasos de este guion' })
  await expect(steps.getByRole('button', { name: 'Escaleta' })).toHaveCount(0)
  await audit(page)

  const write = page.getByRole('button', { name: /^Escribir el guion/ })
  await expect(write).toContainText('·')
  await write.click()
  await expect(page.getByRole('heading', { level: 2, name: 'Gancho' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 2, name: 'Desarrollo' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Cierre' })).toBeVisible()
  await expect(steps.getByRole('button', { name: 'Escaleta' })).toHaveCount(0)
  await expect(page.getByLabel('En qué paso va este guion')).not.toContainText('Escaleta')
  await audit(page)

  // Another one, as in a long video.
  await page.getByText('Quiero otro guion').click()
  const asked = page.waitForResponse(/\/generate$/)
  await page.getByRole('button', { name: /^Pedir otro guion/ }).click()
  await asked
  await expect(page.getByRole('button', { name: 'Cambiar «Desarrollo»' })).toBeEnabled({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Cambiar «Desarrollo»' }).click()
  await page.getByLabel('Lo que se dice').fill('Ir poco a poco. '.repeat(130))
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('button', { name: 'Revisar el guion' }).click()
  await expect(page.getByText(/el máximo de un Short es .* Sobran/)).toBeVisible()
  await audit(page)

  await page.getByRole('button', { name: 'Aprobar el guion' }).click()
  await expect(page.getByText('Guion aprobado.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Guion aprobado.')).toBeVisible()
})

test('every version stays, and going back to one adds another (US5)', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  await page.goto(`${server.baseURL}/canal/guiones`)
  await page.getByRole('button', { name: 'Abrir el guion de «Pan sin amasar»' }).click()
  await page.getByRole('button', { name: 'Guion', exact: true }).click()

  await page.getByText('Historial').click()
  const history = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Historial' }) })
  const items = history.getByRole('listitem').filter({ hasText: /^Versión/ })
  await expect(items.first()).toContainText('La actual')
  const before = await items.count()
  expect(before).toBeGreaterThan(2)
  await expect(items.last()).toContainText('La IA')
  await audit(page)

  await page.getByRole('button', { name: 'Comparar con la actual la versión 1' }).click()
  await expect(page.getByText('Cambiado', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('En esta versión:').first()).toBeVisible()
  await expect(page.getByRole('group', { name: 'Comparación de la versión 1 con la actual' })).toBeFocused()
  await audit(page)

  const was = await items.first().innerText()
  await page.getByRole('button', { name: 'Volver a esta versión' }).click()
  await expect(page.getByText('Has vuelto a la versión 1.', { exact: false })).toBeFocused()
  await expect(items).toHaveCount(before + 1)
  await expect(items.first()).toContainText('Recuperada')
  await expect(items.first()).toContainText('copia de la versión 1')
  expect(was).toContain('La actual')

  await page.reload()
  await page.getByText('Historial').click()
  await expect(items).toHaveCount(before + 1)

  // On an approved script it says first that it will stop being approved.
  await page.goto(`${server.baseURL}/canal/guiones`)
  await page.getByRole('button', { name: 'Abrir el guion de «Pan en un minuto»' }).click()
  await page.getByText('Historial').click()
  await page.getByRole('button', { name: 'Comparar con la actual la versión 1' }).click()
  await page.getByRole('button', { name: 'Volver a esta versión' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Si lo cambias, dejará de estar aprobado' })).toBeVisible()
  await audit(page)
  await dialog.getByRole('button', { name: 'Volver a esta versión' }).click()
  await expect(page.getByRole('button', { name: 'Aprobar el guion' })).toBeVisible()
})

const newScript = async (target: TestServer, page: Page, title: string) => {
  const channelId = ((await api(target, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const { idea } = (await api(target, 'POST', `/api/channels/${channelId}/ideas`, { title, format: 'largo' })) as {
    idea: { id: string; revision: number }
  }
  await api(target, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })
  await page.goto(`${target.baseURL}/canal/ideas`)
  await page.getByRole('button', { name: `Preparar el guion de «${title}»` }).click()
  await expect(heading(page, title)).toBeVisible()
}

const toDraft = async (page: Page) => {
  await page.getByRole('button', { name: /^Proponer escaleta/ }).click()
  await page.getByRole('button', { name: 'Aprobar la escaleta' }).click()
  await page.getByRole('button', { name: /^Escribir el guion/ }).click()
  await expect(page.getByRole('button', { name: 'Revisar el guion' })).toBeVisible()
}

test('facts with their links, a list of your own and a script checked on the internet (US6)', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await blockExternal(context)
  await newScript(server, page, 'Masa madre')
  await expect(page.getByText('Si pides investigar, tus apuntes se usan para buscar.', { exact: false })).toBeVisible()
  await expect(page.getByText('Todavía no hay hechos.', { exact: false })).toBeVisible()
  await audit(page)

  const research = page.getByRole('button', { name: /^Investigar el tema/ })
  await expect(research).toContainText('·')
  await research.click()

  // The link that does not open is pointed out and does not count.
  const facts = page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByText(/^(Comprobado|Una sola fuente|Leyenda)/) })
  await expect(facts).toHaveCount(3)
  await expect(facts.nth(0)).toContainText('Comprobado')
  await expect(facts.nth(1)).toContainText('Una sola fuente')
  await expect(facts.nth(1)).toContainText('Este enlace no abre: no cuenta.')
  await expect(facts.nth(1)).toContainText('No se pudo comprobar si abre: no cuenta.')
  await expect(facts.nth(1)).toContainText('consultado el')
  await expect(facts.nth(2)).toContainText('Leyenda o sin confirmar')
  await expect(facts.nth(2)).toContainText('Otra versión: Otra versión la sitúa en un molino.')
  await expect(facts.nth(2)).toContainText('Sin ningún enlace que lo respalde.')
  await expect(page.getByText('La app comprueba que el enlace abre, no que diga lo que se afirma.')).toBeVisible()
  await audit(page)

  // Yours say they are yours, and a bad address is explained before saving.
  await page.getByRole('button', { name: 'Añadir un hecho o una fuente' }).click()
  const dialog = page.getByRole('dialog')
  await audit(page)
  await dialog.getByLabel('Qué has averiguado').fill('Mi abuela la alimentaba cada mañana.')
  await dialog.getByLabel('Enlace (opcional)').fill('eso no es una dirección')
  await expect(dialog.getByText('Tiene que ser una dirección web completa', { exact: false })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  await dialog.getByLabel('Enlace (opcional)').fill('')
  await dialog.getByLabel('O de dónde lo sacas', { exact: false }).fill('Lo que me contó mi abuela')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).toBeHidden()
  const mine = page.getByRole('listitem').filter({ hasText: 'Mi abuela la alimentaba' })
  await expect(mine).toContainText('Lo aportas tú')
  await expect(mine).toContainText('Lo que me contó mi abuela')

  // Taking one out, with the keyboard, leaves the focus on the list.
  const remove = page.getByRole('button', { name: 'Quitar: Esta receta nació en un convento.' })
  await remove.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Hechos y fuentes' })).toBeFocused()
  await expect(page.getByText('Esta receta nació en un convento.')).toBeHidden()

  await page.reload()
  await expect(mine).toContainText('Lo aportas tú')
  await expect(facts).toHaveCount(2)

  await toDraft(page)
  const check = page.getByRole('button', { name: /^Comprobar con internet/ })
  await expect(check).toContainText('·')
  await audit(page)
  const body = page.getByRole('main')
  const before = await body.locator('mark').first().innerText()
  await check.click()
  await expect(page.getByRole('button', { name: `Por comprobar: ${before}` }).first()).toBeVisible()
  await expect(check).toBeEnabled()

  // Nothing has changed: the verdict waits for a decision.
  await page
    .getByRole('button', { name: `Por comprobar: ${before}` })
    .first()
    .click()
  const verdict = page.getByRole('dialog')
  await expect(verdict.getByText('Resultado de la comprobación: Hay que matizarlo')).toBeVisible()
  await expect(verdict.getByRole('link', { name: 'Guía de fermentación' })).toBeVisible()
  await expect(verdict.getByText('Una redacción posible: «Una redacción con más cuidado»')).toBeVisible()
  await audit(page)
  await verdict.getByRole('button', { name: 'Usar esta redacción' }).click()
  await expect(verdict).toBeHidden()
  await expect(body.getByText('Una redacción con más cuidado').first()).toBeVisible()
})

test('a Short out of an approved long video, linked to it both ways (US7)', async ({ page, context }) => {
  test.setTimeout(180_000)
  await blockExternal(context)
  await newScript(server, page, 'Vídeo con Short')
  await toDraft(page)
  await page.getByRole('button', { name: 'Revisar el guion' }).click()
  await expect(page.getByText('Para sacar un Short, aprueba antes el guion.')).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar el guion' }).click()
  await page.getByRole('button', { name: 'Aprobar igualmente' }).click()

  const makeShort = page.getByRole('button', { name: /^Sacar un Short/ })
  await expect(makeShort).toContainText('·')
  await makeShort.click()
  await expect(page.getByRole('heading', { name: 'Enfoques para el Short' })).toBeVisible()
  await expect(page.getByText('Gancho: Si haces esto, tu pan no sube.')).toBeVisible()
  await expect(page.getByText('Sale de:', { exact: false }).first()).toBeVisible()
  await audit(page)

  await page.getByRole('button', { name: 'Elegir este: El error que arruina tu masa madre' }).click()
  await expect(heading(page, 'El error que arruina tu masa madre')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Escribir el guion/ })).toContainText('·')
  await expect(page.getByText('Este Short sale del vídeo:')).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: /^Escribir el guion/ }).click()
  await expect(page.getByRole('button', { name: 'Revisar el guion' })).toBeVisible()

  await page.getByRole('button', { name: 'Vídeo con Short' }).click()
  await expect(heading(page, 'Vídeo con Short')).toBeVisible()
  await expect(page.getByText('Shorts sacados de este vídeo:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'El error que arruina tu masa madre', exact: true })).toBeVisible()
  // The angle chosen says so and leads to its Short; the other one can still be chosen.
  await expect(page.getByText('Ya has sacado un Short de este enfoque.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir su guion: «El error que arruina tu masa madre»' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Elegir este: El truco de la temperatura' })).toBeVisible()
  await audit(page)
  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(page.getByText('Short del vídeo «Vídeo con Short»')).toBeVisible()
})

test('a search that finds nothing reliable says so and changes nothing (US6)', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  const other = await startServer({ port: 4462, scenario: 'sin_resultados' })
  try {
    await page.goto(other.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(heading(page, 'Todo listo')).toBeVisible()
    await profileByApi(other)
    await newScript(other, page, 'Sin resultados')
    await page.getByRole('button', { name: /^Investigar el tema/ }).click()
    await expect(page.getByText('No se ha encontrado nada fiable sobre este tema.', { exact: false })).toBeVisible()
    await audit(page)
  } finally {
    await other.stop()
  }
})

test('a connection that cannot search says so and lets you go on (US6)', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  const other = await startServer({ port: 4461, scenario: 'sin_web' })
  try {
    await page.goto(other.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(heading(page, 'Todo listo')).toBeVisible()
    await profileByApi(other)
    await newScript(other, page, 'Sin internet')
    await expect(page.getByText('Tu conexión de IA no puede buscar en internet.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Investigar el tema/ })).toHaveCount(0)
    await expect(page.getByText('tus apuntes se usan para buscar', { exact: false })).toHaveCount(0)
    await audit(page)
    await toDraft(page)
    await expect(page.getByRole('button', { name: /^Comprobar con internet/ })).toHaveCount(0)
  } finally {
    await other.stop()
  }
})
