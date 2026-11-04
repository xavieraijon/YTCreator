import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4388 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  // As in a11y.spec.ts: the colours are measured once the animations have settled.
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target).join(', ')}`)).toEqual([])
}

const addOwn = async (page: Page, label: string) => {
  // It stays open after adding one.
  const field = page.getByLabel('Tu nicho')
  if (!(await field.isVisible())) await page.getByText('Escribir mi propio nicho').click()
  await field.fill(label)
  await page.getByRole('button', { name: 'Medir mi nicho' }).click()
}

test('from the interests to the rhythm with the fakes (US1)', async ({ page: first, context }) => {
  test.setTimeout(120_000)
  let page = first
  await blockExternal(context)
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
  await page.getByRole('button', { name: 'Crear mi canal' }).click()

  // Interests: says what a niche is and asks for something to go on.
  await expect(heading(page, '¿Qué te interesa?')).toBeVisible()
  await expect(page.getByText(/Un nicho es el tema concreto/)).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(page.getByText('Cuéntanos un poco más')).toBeVisible()
  await page.getByLabel('Cuéntalo con tus palabras').fill('Me gusta cocinar rápido y explicar recetas.')
  await page.getByRole('button', { name: 'Seguir' }).click()

  // Questions: they can be skipped without spending.
  await expect(heading(page, 'Unas preguntas')).toBeVisible()
  await page.getByRole('button', { name: /Preparar las preguntas/ }).click()
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Saltar' }).click()

  // Niches: measured by themselves, and each figure says where it comes from.
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await page.getByRole('button', { name: /Proponer nichos/ }).click()
  let cards = page.getByRole('article')
  await expect(cards.first()).toBeVisible()
  await expect(cards.first().getByText('Público', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Elegir este nicho' }).first()).toBeEnabled()
  await expect(page.getByText(/Midiendo \d+ de \d+ nichos/)).toHaveCount(0)
  await audit(page)

  // Another batch, and back to the one before.
  await page.getByRole('button', { name: /Proponer otra/ }).click()
  await page.getByRole('button', { name: 'Volver a la tanda anterior' }).click()
  await expect(page.getByRole('button', { name: 'Volver a la tanda anterior' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Elegir este nicho' }).first()).toBeEnabled()

  // A niche with no videos has no figures and no verdict.
  await addOwn(page, 'nicho sin datos')
  const empty = page.getByRole('article', { name: 'nicho sin datos' })
  await expect(
    empty
      .getByRole('alert')
      .or(empty.getByText(/no hay suficientes|No hemos encontrado/i))
      .first(),
  ).toBeVisible()
  await expect(empty.getByText('Conviene', { exact: true })).toHaveCount(0)

  // A blocked one offers to try again, and the rest stay.
  await addOwn(page, 'nicho bloqueado')
  const blocked = page.getByRole('article', { name: 'nicho bloqueado' })
  await expect(blocked.getByRole('button', { name: 'Volver a intentarlo' })).toBeVisible()
  await expect(cards.first().getByText('Público', { exact: false }).first()).toBeVisible()

  // Closing the tab in the middle of a measure loses nothing: it goes on and the journey is resumed from the start.
  await addOwn(page, 'Mi nicho al cerrar')
  await page.close()
  page = await context.newPage()
  await page.goto(`${server.baseURL}/canal`)
  await page.getByRole('button', { name: 'Seguir donde lo dejaste' }).click()
  cards = page.getByRole('article')
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await expect(
    page.getByRole('article', { name: 'Mi nicho al cerrar' }).getByText('Público', { exact: false }).first(),
  ).toBeVisible()

  // Chooses one: its references are optional, and it goes on.
  await cards.first().getByRole('button', { name: 'Elegir este nicho' }).click()
  await expect(cards.first().getByText('Nicho elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Ver canales de referencia' }).click()
  await expect(page.getByRole('region', { name: 'Canales de referencia' }).getByRole('article').first()).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Seguir', exact: true }).last().click()

  // Rhythm: and back to the niches without losing the choice.
  await expect(heading(page, 'Tu ritmo')).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(page.getByText('Escribe un número del 1 al 60.')).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await expect(page.getByText('Nicho elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir', exact: true }).last().click()
  await expect(heading(page, 'Tu ritmo')).toBeVisible()

  await page.getByLabel(/Horas por semana/).fill('8')
  await page.getByText('Solo con mi voz').click()
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(page).toHaveURL(/\/canal\/nuevo\/conceptos$/)

  // Concepts: money in ranges with the source, and one is chosen.
  await expect(heading(page, 'La idea de tu canal')).toBeVisible()
  await page.getByRole('button', { name: /Proponer ideas/ }).click()
  const concepts = page.getByRole('article')
  await expect(concepts.first().getByText(/De [\d.]+ a [\d.]+ € al mes/)).toBeVisible()
  await audit(page)

  // An edit keeps the concept and its figures.
  await concepts.first().getByRole('button', { name: 'Cambiar algo' }).click()
  await page.getByLabel('La promesa').fill('Cenas de diario sin complicarte la vida.')
  await audit(page)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('article', { name: 'Cenas de diario sin complicarte la vida.' })).toBeVisible()

  await concepts.first().getByRole('button', { name: 'Elegir este concepto' }).click()
  await expect(page.getByText('Concepto elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir', exact: true }).click()
  await expect(page).toHaveURL(/\/canal\/nuevo\/nombres$/)

  // Going back to the niches warns; cancelling changes nothing.
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(heading(page, 'La idea de tu canal')).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(heading(page, 'Tu ritmo')).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /Tu concepto se basaba en el nicho anterior/ })
  await expect(dialog).toBeVisible()
  await audit(page)
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(heading(page, 'Tu ritmo')).toBeVisible()

  // Confirming goes back, and the concept has to be chosen again.
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cambiar igualmente' }).click()
  await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir', exact: true }).last().click()
  await expect(heading(page, 'Tu ritmo')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir' }).click()
  await expect(heading(page, 'La idea de tu canal')).toBeVisible()
  await expect(page.getByText(/se basaba en el nicho anterior/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toHaveCount(0)
  await concepts.first().getByRole('button', { name: 'Elegir este concepto' }).click()
  await page.getByRole('button', { name: 'Seguir', exact: true }).click()
  await expect(page).toHaveURL(/\/canal\/nuevo\/nombres$/)
})
