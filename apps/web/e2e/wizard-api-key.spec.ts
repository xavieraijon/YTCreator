import { expect, test } from '@playwright/test'
import { blockExternal, FAKE_KEY, heading, startServer, toConnect, type TestServer } from './server.ts'

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4395 })
})

test.afterAll(async () => {
  await server.stop()
})

test('the whole wizard paying per use: key, spending limits, and the home afterwards (US3)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await page.goto(server.baseURL)

  await toConnect(page, 'Pagar solo lo que uses')
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await expect(page.getByText('Necesitas saldo en tu cuenta de Anthropic.')).toBeVisible()

  // Pasted with spaces around it, as it often comes out of a web page.
  await page.getByLabel('Tu clave').fill(`  ${FAKE_KEY}  `)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // FR-021: the proposed limits, already written.
  await expect(heading(page, 'Pon tus límites de gasto')).toBeVisible()
  await expect(page).toHaveURL(/\/bienvenida\/limites$/)
  const perOperation = page.getByLabel('Por operación (€)')
  const daily = page.getByLabel('Por día (€)')
  const monthly = page.getByLabel('Por mes (€)')
  await expect(perOperation).toHaveValue('0,50')
  await expect(daily).toHaveValue('3,00')
  await expect(monthly).toHaveValue('20,00')
  await expect(page.getByText(/Al llegar, YTCreator deja de usar la IA hasta el día siguiente/)).toBeVisible()

  // FR-022: each error under its own field, and the wizard does not move on.
  await perOperation.fill('5')
  await monthly.fill('2000')
  await page.getByRole('button', { name: 'Guardar límites' }).click()
  await expect(perOperation).toHaveAccessibleDescription(/No puede ser mayor que el límite por día/)
  await expect(monthly).toHaveAccessibleDescription(/Es demasiado alto/)
  await expect(daily).not.toHaveAccessibleDescription(/No puede|Es demasiado|no es válido/)
  await expect(page).toHaveURL(/\/bienvenida\/limites$/)

  await perOperation.fill('cinco')
  await page.getByRole('button', { name: 'Guardar límites' }).click()
  await expect(perOperation).toHaveAccessibleDescription(/Este valor no es válido/)

  // A comma or a point, both are euros.
  await perOperation.fill('1.5')
  await monthly.fill('40,00')
  await page.getByRole('button', { name: 'Guardar límites' }).click()

  await expect(heading(page, 'Todo listo')).toBeVisible()
  await expect(page.getByText('Usas: Pago por uso de Anthropic.')).toBeVisible()

  // «Volver» from listo goes back to the limits, now the saved ones.
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(heading(page, 'Pon tus límites de gasto')).toBeVisible()
  await expect(perOperation).toHaveValue('1,50')
  await expect(monthly).toHaveValue('40,00')
  await page.getByRole('button', { name: 'Guardar límites' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()

  await page.getByRole('button', { name: 'Ir al inicio' }).click()
  await expect(heading(page, 'Inicio')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pago por uso de Anthropic · Funciona' })).toHaveAttribute(
    'href',
    '/ajustes/ia',
  )
})
