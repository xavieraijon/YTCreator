import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// «¿Tiene hueco?» with the fake YouTube (specs/004-idea-bank/quickstart.md, US2).
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4400 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

// One idea for each answer of the fake: the four semaphores, a failure and an opportunity.
const IDEAS = [
  { title: 'Hueco', query: 'pan idea hueco', broadQuery: 'pan con publico' },
  { title: 'Competida', query: 'pan idea competida', broadQuery: 'pan con publico' },
  { title: 'Quemada', query: 'pan idea quemada', broadQuery: 'pan con publico' },
  { title: 'Fría', query: 'pan idea fria', broadQuery: 'pan casero' },
  { title: 'Oportunidad', query: 'pan idea oportunidad', broadQuery: 'pan con publico', queryEn: 'bread opportunity' },
  { title: 'Bloqueada', query: 'pan idea bloqueado', broadQuery: 'pan con publico' },
  { title: 'Sin búsquedas' },
]

const card = (page: Page, title: string) =>
  page
    .getByRole('region', { name: 'Tus ideas' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })

test('measures the bank: four semaphores, a failure, an opportunity, coming back mid-way (US2), and another angle (US3)', async ({
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
  for (const idea of IDEAS) {
    await api(server, 'POST', `/api/channels/${channelId}/ideas`, { format: 'largo', ...idea })
  }

  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(heading(page, 'Banco de ideas')).toBeVisible()
  await expect(card(page, 'Hueco').getByText('Sin medir')).toBeVisible()
  // Before measuring, how many (FR-007c): the idea without searches is left out, and said.
  await expect(page.getByText('Se medirán 6 ideas.')).toBeVisible()
  await expect(
    page.getByText('Hay una idea sin búsquedas: esa no se medirá aquí. Puedes medirla con su título desde su tarjeta.'),
  ).toBeVisible()
  await audit(page)

  // «Medir todas», and the tab closed as soon as the server has it: the measure goes on there.
  const started = page.waitForResponse((response) => response.url().endsWith('/idea-measures'))
  await page.getByRole('button', { name: 'Medir todas' }).click()
  expect((await started).status()).toBe(202)
  await page.close()
  const back = await context.newPage()
  await back.goto(`${server.baseURL}/canal/ideas`)
  await expect(card(back, 'Bloqueada').getByText('YouTube nos ha pedido que esperemos')).toBeVisible({
    timeout: 30_000,
  })

  await expect(card(back, 'Hueco').getByText('Hay hueco', { exact: true })).toBeVisible()
  await expect(card(back, 'Competida').getByText('Competido', { exact: true })).toBeVisible()
  await expect(card(back, 'Quemada').getByText('Quemado', { exact: true })).toBeVisible()
  await expect(card(back, 'Fría').getByText('Frío', { exact: true })).toBeVisible()
  await expect(card(back, 'Quemada').getByText(/son de los últimos 90 días/)).toBeVisible()
  await expect(card(back, 'Oportunidad').getByText(/puede ser una oportunidad/)).toBeVisible()
  await expect(card(back, 'Hueco').getByText(/le falta su búsqueda en inglés/)).toBeVisible()
  await expect(card(back, 'Hueco').getByText(/supuesto nuestro/)).toBeVisible()

  // The evidence, folded.
  await card(back, 'Quemada').getByText('Ver los vídeos parecidos').click()
  await expect(card(back, 'Quemada').getByText(/pan idea quemada \(1\)/)).toBeVisible()
  await audit(back)

  // The failed one is still unmeasured, and can be measured again; «Medir todas» takes it again.
  await expect(card(back, 'Bloqueada').getByText('Sin medir')).toBeVisible()
  await expect(card(back, 'Bloqueada').getByRole('button', { name: '¿Tiene hueco? «Bloqueada»' })).toBeVisible()
  await expect(back.getByRole('button', { name: 'Medir todas' })).toBeVisible()

  // Measured again by itself: the announcement is polite and names the idea.
  await card(back, 'Hueco').getByRole('button', { name: 'Volver a medir «Hueco»' }).click()
  await expect(back.getByRole('status').filter({ hasText: '«Hueco»: Hay hueco.' })).toBeVisible()

  // An idea without its searches: «¿Tiene hueco?» leads to «Preparar la medida», with its cost (R6).
  const bare = card(back, 'Sin búsquedas')
  await bare.getByRole('button', { name: '¿Tiene hueco? «Sin búsquedas»' }).click()
  await bare.getByRole('button', { name: /^Preparar la medida/ }).click()
  await expect(back.getByText('Búsquedas preparadas. Ya puedes ver si tiene hueco.', { exact: true })).toBeVisible()
  await expect(bare.getByRole('button', { name: '¿Tiene hueco? «Sin búsquedas»' })).toBeVisible()
  await expect(bare.getByText('Para medirla hacen falta sus búsquedas en YouTube.')).toHaveCount(0)
  await audit(back)

  // US3: another angle for the burnt one, with its cost first; one kept enters the bank unmeasured, linked.
  const burnt = card(back, 'Quemada')
  await expect(card(back, 'Hueco').getByRole('button', { name: /Buscar otro enfoque/ })).toHaveCount(0)
  await burnt.getByRole('button', { name: 'Buscar otro enfoque «Quemada»' }).click()
  await burnt.getByRole('textbox', { name: /pedirle algo concreto/ }).fill('para gente que empieza')
  await burnt.getByRole('button', { name: /^Buscar otro enfoque · / }).click()
  const angles = back.getByRole('region', { name: 'Otros enfoques de «Quemada»' })
  await expect(angles.getByText(/^Opinión de la IA:/).first()).toBeVisible()
  await audit(back)
  const keep = angles.getByRole('button', { name: /^Me la quedo «/ }).first()
  const title = ((await keep.getAttribute('aria-label')) ?? '').replace(/^Me la quedo «|»$/g, '')
  await keep.click()
  await expect(angles.getByText('Te la has quedado.')).toBeVisible()
  // The new idea is the last card with that title (the angle inside «Quemada» has it too).
  const kept = card(back, title).last()
  await expect(kept.getByText('Otro enfoque de «Quemada»')).toBeVisible()
  await expect(kept.getByText('Sin medir')).toBeVisible()
  await back.reload()
  const after = back.getByRole('region', { name: 'Otros enfoques de «Quemada»' })
  await expect(after).toBeVisible()
  // «Proponer otras variantes» goes back to the request in the card, with its instructions and its cost.
  await after.getByRole('button', { name: 'Proponer otras variantes de «Quemada»' }).click()
  await expect(card(back, 'Quemada').getByRole('button', { name: /^Buscar otro enfoque · / })).toBeVisible()
  await expect(card(back, 'Quemada').getByRole('textbox')).toBeFocused()
})
