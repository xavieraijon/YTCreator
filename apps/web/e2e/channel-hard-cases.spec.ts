import { expect, type Page, test } from '@playwright/test'
import { profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, FAKE_KEY, heading, startServer, toConnect, type TestServer } from './server.ts'

// The hard cases of quickstart §4 the other specs leave out (T125): no reader, a limit of 2 cents, a figure the AI made
// up, and the versions of the profile. A server of their own for each scenario of the fake AI.
let normal: TestServer
let versioned: TestServer
let invented: TestServer
let limited: TestServer
let guarded: TestServer

test.beforeAll(async () => {
  ;[normal, versioned, invented, limited, guarded] = await Promise.all([
    startServer({ port: 4389 }),
    startServer({ port: 4379 }),
    startServer({ port: 4381, scenario: 'cifra_inventada' }),
    startServer({ port: 4380 }),
    startServer({ port: 4399 }),
  ])
})

test.afterAll(async () => {
  await Promise.all([normal.stop(), versioned.stop(), invented.stop(), limited.stop(), guarded.stop()])
})

async function withSubscription(page: Page, server: TestServer) {
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
}

async function toQuestions(page: Page) {
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
  await page.getByRole('button', { name: 'Crear mi canal' }).click()
  await expect(heading(page, '¿Qué te interesa?')).toBeVisible()
  await page.getByLabel('Cuéntalo con tus palabras').fill('Me gusta cocinar rápido y explicar recetas.')
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(heading(page, 'Unas preguntas')).toBeVisible()
}

test('without the reader: the niche says so and takes to Ajustes, where it is prepared', async ({ page, context }) => {
  test.setTimeout(180_000)
  await blockExternal(context)
  await withSubscription(page, normal)
  await toQuestions(page)
  await page.getByRole('button', { name: /Preparar las preguntas/ }).click()
  await page.getByRole('button', { name: 'Saltar' }).click()
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await page.getByRole('button', { name: /Proponer nichos/ }).click()
  await expect(page.getByRole('article').first()).toBeVisible()

  await page.getByText('Escribir mi propio nicho').click()
  await page.getByLabel('Tu nicho').fill('nicho sin lector')
  await page.getByRole('button', { name: 'Medir mi nicho' }).click()
  const card = page.getByRole('article', { name: 'nicho sin lector' })
  await expect(
    card.getByText('No hemos podido usar el lector de YouTube. Desde Ajustes puedes prepararlo o actualizarlo.'),
  ).toBeVisible()
  await expect(card.getByText('Conviene', { exact: true })).toHaveCount(0)

  await card.getByRole('button', { name: 'Ir a Ajustes' }).click()
  await expect(page).toHaveURL(/\/ajustes\/youtube$/)
  await expect(
    page.getByText('El lector de YouTube no está preparado. Pulsa «Actualizar el lector» para prepararlo.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar el lector' }).click()
  await expect(page.getByText(/Versión del lector: /)).toBeVisible()
})

test('versions: edited twice and back to the first, which is saved as the 4th; the 2nd and 3rd stay', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await blockExternal(context)
  await withSubscription(page, versioned)
  await profileByApi(versioned)
  await page.goto(`${versioned.baseURL}/canal`)

  for (const promise of ['Primera promesa escrita a mano.', 'Segunda promesa escrita a mano.']) {
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('La promesa').fill(promise)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText(promise)).toBeVisible()
  }

  await page.getByText('Versiones anteriores').click()
  const versions = page.getByRole('listitem').filter({ hasText: /^Versión \d/ })
  await expect(versions).toHaveCount(3)
  await versions.filter({ hasText: 'Versión 1' }).getByRole('button', { name: 'Volver a esta versión' }).click()
  await expect(page.getByText('Has vuelto a la versión 1. Se ha guardado como la versión 4.').first()).toBeVisible()
  await expect(page.getByText('Segunda promesa escrita a mano.')).toHaveCount(0)

  await expect(versions).toHaveCount(4)
  await expect(versions.filter({ hasText: 'Versión 4' })).toContainText('Recuperada de una anterior')
  await expect(versions.filter({ hasText: 'Versión 3' })).toBeVisible()
  await expect(versions.filter({ hasText: 'Versión 2' })).toBeVisible()
})

test('leaving «Editar» with changes asks first: in the app and with the back arrow', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  await withSubscription(page, guarded)
  await profileByApi(guarded)
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await page.getByRole('button', { name: 'Ver mi canal' }).click()
  await expect(page).toHaveURL(/\/canal$/)

  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByLabel('La promesa').fill('Una promesa sin guardar.')
  const asked: string[] = []
  let answer = false
  page.on('dialog', (dialog) => {
    asked.push(dialog.message())
    void (answer ? dialog.accept() : dialog.dismiss())
  })

  // «Ajustes», declined: nothing moves and the text is still there.
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect.poll(() => asked.length).toBe(1)
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByLabel('La promesa')).toHaveValue('Una promesa sin guardar.')

  // The back arrow, declined: the page stays.
  await page.goBack()
  await expect.poll(() => asked.length).toBe(2)
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByLabel('La promesa')).toHaveValue('Una promesa sin guardar.')

  // Accepted: it leaves.
  answer = true
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page).toHaveURL(/\/ajustes$/)
  expect(asked.every((message) => message === asked[0])).toBe(true)
})

test('a figure the AI made up is taken out, and the screen says so', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  await withSubscription(page, invented)
  await toQuestions(page)
  await page.getByRole('button', { name: /Preparar las preguntas/ }).click()
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible()
  await expect(
    page.getByText('Hemos quitado frases u opciones que daban cifras que no podíamos comprobar.'),
  ).toBeVisible()
  await expect(page.getByText('Este tema mueve 250.000 visitas al mes.')).toHaveCount(0)
})

test('a limit of 2 cents per operation: the AI button is off and links to the limits', async ({ page, context }) => {
  test.setTimeout(120_000)
  await blockExternal(context)
  await page.goto(limited.baseURL)
  await toConnect(page, 'Pagar solo lo que uses')
  await page.getByLabel('Tu clave').fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  // Two calls are reserved (principle IV, entry 152): the questions, about 1 cent each, need 2.
  await page.getByLabel('Por operación (€)').fill('0,02')
  await page.getByRole('button', { name: 'Guardar límites' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()

  // The questions go through; the niches cost more and do not.
  await toQuestions(page)
  await page.getByRole('button', { name: /Preparar las preguntas/ }).click()
  await page.getByRole('button', { name: 'Saltar' }).click()
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Proponer nichos/ })).toBeDisabled()
  await expect(page.getByText('Esto se pasa de tu límite por operación.')).toBeVisible()
  await page.getByRole('button', { name: 'Ver mis límites' }).click()
  await expect(page).toHaveURL(/\/ajustes\/ia$/)
})
