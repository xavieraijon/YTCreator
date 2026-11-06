import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4388 })
})

test.afterAll(async () => {
  await server.stop()
})

// Every screen of the journey in both themes, at 1280 and 375 px and at 200 % zoom (T123).
const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

const addOwn = async (page: Page, label: string) => {
  // It stays open after adding one.
  const field = page.getByLabel('Tu nicho')
  if (!(await field.isVisible())) await page.getByText('Escribir mi propio nicho').click()
  await field.fill(label)
  await page.getByRole('button', { name: 'Medir mi nicho' }).click()
}

test('from the interests to the rhythm with the fakes (US1)', async ({ page: first, context }) => {
  test.setTimeout(300_000)
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
  // The newer batch was not lost (P3): it can be brought back, and gone back from again.
  await page.getByRole('button', { name: 'Volver a la tanda más nueva' }).click()
  await expect(page.getByRole('button', { name: 'Volver a la tanda más nueva' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a la tanda anterior' }).click()
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

  await concepts.first().getByRole('button', { name: 'Elegir esta idea' }).click()
  await expect(page.getByText('Idea elegida')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir', exact: true }).click()
  await expect(page).toHaveURL(/\/canal\/nuevo\/nombres$/)

  // Going back to the niches warns; cancelling changes nothing.
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(heading(page, 'La idea de tu canal')).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(heading(page, 'Tu ritmo')).toBeVisible()
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /Tu idea se basaba en el nicho anterior/ })
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
  await concepts.first().getByRole('button', { name: 'Elegir esta idea' }).click()
  await page.getByRole('button', { name: 'Seguir', exact: true }).click()
  await expect(page).toHaveURL(/\/canal\/nuevo\/nombres$/)

  // Names: each with its semaphore; a taken @ is red and asks, it does not forbid.
  await expect(heading(page, 'El nombre de tu canal')).toBeVisible()
  await expect(page.getByText(/la @ solo queda confirmada al crearla/)).toBeVisible()

  // Left for later: the channel goes on with a provisional name and the start reminds it.
  await page.getByRole('button', { name: 'Decidir más tarde' }).click()
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByRole('button', { name: 'Elegir el nombre' })).toBeVisible()
  await page.goto(`${server.baseURL}/inicio`)
  await expect(page.getByText('Te falta elegir el nombre.')).toBeVisible()
  await page.getByRole('button', { name: 'Ver mi canal' }).click()
  await page.getByRole('button', { name: 'Elegir el nombre' }).click()

  // Entry 136: the name is chosen in a panel of «Tu canal», not in the journey again.
  const choosing = page.getByRole('region', { name: 'Elegir el nombre' })
  await expect(choosing).toBeVisible()
  await expect(page).toHaveURL(/\/canal$/)
  await page.getByRole('button', { name: /Proponer nombres/ }).click()
  const names = choosing.getByRole('article')
  await expect(names.first().getByText('Camino libre')).toBeVisible()
  await audit(page)

  await page.getByText('Escribir el mío').click()
  await page.getByLabel('Tu nombre').fill('Canal Ocupado')
  await page.getByLabel('La @ que quieres').fill('a!b')
  await page.getByRole('button', { name: 'Comprobar mi nombre' }).click()
  await expect(page.getByText('Esa @ no vale')).toBeVisible()
  await page.getByLabel('La @ que quieres').fill('ocupado1')
  await page.getByRole('button', { name: 'Comprobar mi nombre' }).click()
  const mine = page.getByRole('article', { name: 'Canal Ocupado' })
  await expect(mine.getByText('Problema')).toBeVisible()

  await mine.getByRole('button', { name: 'Quedarme con este nombre' }).click()
  const askRed = page.getByRole('dialog', { name: /Quedarte con «Canal Ocupado»/ })
  await expect(askRed.getByText('Esa @ ya la tiene otro canal.')).toBeVisible()
  await audit(page)
  await askRed.getByRole('button', { name: 'Mirar otros' }).click()
  await expect(mine.getByText('Elegido, aún sin usar')).toHaveCount(0)

  // A name whose check fails is never green.
  await page.getByLabel('Tu nombre').fill('nombre bloqueado')
  await page.getByLabel('La @ que quieres').fill('')
  await page.getByRole('button', { name: 'Comprobar mi nombre' }).click()
  const blocked2 = page.getByRole('article', { name: 'nombre bloqueado' })
  await expect(blocked2.getByText('Sin comprobar')).toBeVisible()
  await expect(blocked2.getByText('Camino libre')).toHaveCount(0)
  await audit(page)

  // Chooses one and the journey ends at the channel, with its name.
  await names.first().getByRole('button', { name: 'Quedarme con este nombre' }).click()
  await expect(names.first().getByText('Elegido, aún sin usar')).toBeVisible()
  await names.first().getByRole('button', { name: 'Usar este nombre' }).click()
  await expect(page.getByText(/Nombre cambiado: ahora es/).first()).toBeVisible()
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByRole('button', { name: 'Elegir el nombre' })).toHaveCount(0)
  await audit(page)

  // The profile (US5): downloaded as a document and as data, edited, and back to the first version.
  const document = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar como documento' }).click()
  expect((await document).suggestedFilename()).toMatch(/^perfil-.+\.md$/)
  await expect(
    page.getByText(/Hemos preparado tu perfil\. Si el navegador no te pregunta dónde guardarlo/).first(),
  ).toBeVisible()
  const data = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar como datos' }).click()
  expect((await data).suggestedFilename()).toMatch(/^perfil-.+\.json$/)

  await page.getByRole('button', { name: 'Editar' }).click()
  await audit(page)
  await page.getByLabel('La promesa').fill('Una promesa cambiada a mano.')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(/Cambios guardados\. Es la versión \d+\./).first()).toBeVisible()
  await expect(page.getByText('Una promesa cambiada a mano.')).toBeVisible()
  await page.getByText('Versiones anteriores').click()
  await audit(page)
  await page.getByRole('button', { name: 'Volver a esta versión' }).first().click()
  await expect(page.getByText(/Has vuelto a la versión \d+/).first()).toBeVisible()
  await expect(page.getByText('Una promesa cambiada a mano.')).toHaveCount(0)

  // Entry 117: the answers can be edited too; the money and the warnings are worked out again.
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByLabel('Está hecho para niños').check()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText(/Parece contenido para niños/)).toBeVisible()

  // Entry 115: one part rewritten by the AI, the cost on the button, saved only once approved.
  await page.getByRole('button', { name: 'Reescribir con la IA' }).click()
  await page.getByLabel('Los temas').check()
  await expect(page.getByRole('button', { name: /^Pedir a la IA · / })).toBeEnabled()
  await audit(page)
  await page.getByRole('button', { name: /^Pedir a la IA/ }).click()
  await expect(page.getByRole('heading', { name: 'Los temas que propone la IA' })).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Guardar como versión nueva' }).click()
  await expect(page.getByText(/Cambios guardados\. Es la versión \d+\./).first()).toBeVisible()
  await expect(page.getByText(/Comidas que aguantan bien en el tupper/).first()).toBeVisible()

  // Entry 136: the name changes in a panel of the profile, with the @ checked again; «Cancelar» changes nothing.
  await page.getByRole('button', { name: 'Cambiar el nombre' }).click()
  const panel = page.getByRole('region', { name: 'Cambiar el nombre' })
  await expect(panel.getByRole('article').first()).toBeVisible()
  await audit(page)
  await panel.getByRole('button', { name: 'Cancelar' }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Cambiar el nombre' }).click()
  const proposed = panel.getByRole('article')
  await proposed.nth(2).getByRole('button', { name: 'Quedarme con este nombre' }).click()
  await expect(proposed.nth(2).getByText('Elegido, aún sin usar')).toBeVisible()
  await proposed.nth(2).getByRole('button', { name: 'Usar este nombre' }).click()
  await expect(page.getByText(/Nombre cambiado: ahora es «.+»\. Es la versión \d+ del perfil\./).first()).toBeVisible()
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/\/canal$/)
  await expect(page.getByRole('button', { name: 'Cambiar el nombre' })).toBeVisible()
  // Entry 122: only the name moved; what was rewritten and edited since the journey stays.
  await expect(page.getByText(/Comidas que aguantan bien en el tupper/).first()).toBeVisible()
  await expect(page.getByText(/Parece contenido para niños/)).toBeVisible()

  // Ajustes → YouTube and Consumo (US5).
  await page.goto(`${server.baseURL}/ajustes/youtube`)
  await expect(page.getByRole('button', { name: 'Actualizar el lector' })).toBeVisible()
  await audit(page)
  await page.getByRole('tab', { name: 'Consumo' }).click()
  await expect(page).toHaveURL(/\/ajustes\/consumo$/)
  await expect(page.getByText(/^Este mes: /)).toBeVisible()
  await audit(page)

  await page.goto(`${server.baseURL}/inicio`)
  await expect(page.getByText(/ya tiene tema, idea y nombre/)).toBeVisible()
})
