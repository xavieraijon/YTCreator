import { expect, test, type Page } from '@playwright/test'
import {
  blockExternal,
  closeClaudePage,
  connectAccount,
  FAKE_CODE,
  FAKE_KEY,
  heading,
  startServer,
  toConnect,
  type TestServer,
} from './server.ts'

// Outside 4310–4329, other than 4390–4399 which the other specs already use (server.ts's own comment).
const GENERAL_TAB_PORT = 4389
const SAVED_KEY_PORT = 4384

let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4397 })
})

test.afterAll(async () => {
  await server.stop()
})

const badge = (page: Page, name: string) => page.getByRole('link', { name })
const accountRows = (page: Page) =>
  page.getByRole('region', { name: 'Cuentas de suscripción' }).getByRole('list').first().getByRole('listitem')
const others = (page: Page) => page.getByRole('region', { name: 'Otras opciones' })

async function removeAccount(page: Page, row: number, name: string) {
  await accountRows(page).nth(row).getByRole('button', { name: 'Borrar' }).click()
  const dialog = page.getByRole('dialog', { name: `¿Borrar ${name}?` })
  await dialog.getByRole('button', { name: 'Borrar' }).click()
  await expect(dialog).toBeHidden()
}

test('the AI settings: accounts, reconnecting, changing the option and back, and removing the last account (US4)', async ({
  page,
  context,
}) => {
  await blockExternal(context)
  await page.goto(server.baseURL)

  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir otra cuenta' }).click()
  await connectAccount(page)
  await expect(page.getByText('Cuenta 2 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ir al inicio' }).click()

  await badge(page, 'Tu suscripción de Claude · Funciona').click()
  await expect(heading(page, 'Ajustes')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'IA' })).toHaveAttribute('aria-selected', 'true')
  await expect(accountRows(page)).toHaveCount(2)

  // Renamed on leaving the field; it survives a reload.
  const firstName = accountRows(page).nth(0).getByLabel('Nombre de la cuenta')
  await firstName.fill('Personal')
  await firstName.press('Tab')
  await page.reload()
  await expect(accountRows(page).nth(0).getByLabel('Nombre de la cuenta')).toHaveValue('Personal')

  // Reordered: «Personal» goes second.
  await expect(accountRows(page).nth(0).getByRole('button', { name: 'Subir' })).toBeDisabled()
  await accountRows(page).nth(0).getByRole('button', { name: 'Bajar' }).click()
  await expect(accountRows(page).nth(0).getByLabel('Nombre de la cuenta')).toHaveValue('Cuenta 2')
  await expect(accountRows(page).nth(1).getByLabel('Nombre de la cuenta')).toHaveValue('Personal')

  await removeAccount(page, 1, 'Personal')
  await expect(accountRows(page)).toHaveCount(1)

  // Claude now says the session of the account left has expired (the fake gives each login a new access, and
  // after the restart the first one again, which no row has any more).
  await server.restart('cuentas:ok,sin_sesion:sesion_caducada')
  await page.reload()
  const row = accountRows(page).nth(0)
  await row.getByRole('button', { name: 'Comprobar', exact: true }).click()
  await expect(row).toContainText('Sesión caducada')

  // Claude's page opens on the click itself; the form below takes the code.
  const popup = page.waitForEvent('popup')
  await row.getByRole('button', { name: 'Volver a conectar' }).click()
  await closeClaudePage(popup)
  await expect(row.getByText(/Entra con la misma cuenta de Claude/)).toBeVisible()
  await expect(row.getByRole('link', { name: /Volver a abrir la página de Claude/ })).toBeVisible()
  await row.getByLabel('Código de Claude').fill(FAKE_CODE)
  await row.getByRole('button', { name: 'Conectar', exact: true }).click()
  // Renewed in place: still one account, with its name, working again.
  await expect(accountRows(page)).toHaveCount(1)
  await expect(row.getByLabel('Nombre de la cuenta')).toHaveValue('Cuenta 2')
  await expect(row).toContainText('Funciona')
  await expect(row.getByRole('button', { name: 'Volver a conectar' })).toHaveCount(0)

  // To pay per use, folded under «Más opciones» (decision 1 of 002): the key, «Usar esta opción», and the limits it
  // cannot do without (FR-021).
  await others(page).getByText('Más opciones', { exact: true }).click()
  await others(page).getByRole('button', { name: 'Configurar' }).click()
  await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
  await expect(page).toHaveURL(/\/ajustes\/ia\/cambiar\/pago_por_uso$/)
  await page.getByLabel('Tu clave').fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
  await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
  await page.getByRole('button', { name: 'Usar esta opción' }).click()
  await expect(heading(page, 'Límites de gasto')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar límites' }).click()

  await expect(heading(page, 'Ajustes')).toBeVisible()
  await expect(page).toHaveURL(/\/ajustes\/ia$/)
  await expect(badge(page, 'Pago por uso de Anthropic · Funciona')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Claves guardadas' })).toContainText(`••••${FAKE_KEY.slice(-4)}`)
  await expect(page.getByRole('region', { name: 'Límites de gasto' })).toBeVisible()

  // And back to the subscription, already connected: no wizard.
  await others(page).getByRole('button', { name: 'Usar esta opción' }).click()
  await expect(badge(page, 'Tu suscripción de Claude · Funciona')).toBeVisible()

  // Without accounts the subscription cannot be the option in use: the key, which works and has limits, takes over.
  await accountRows(page).nth(0).getByRole('button', { name: 'Borrar' }).click()
  const removeLast = page.getByRole('dialog', { name: '¿Borrar Cuenta 2?' })
  await expect(removeLast).toContainText('pasará a usar «Pagar solo lo que uses»')
  await removeLast.getByRole('button', { name: 'Borrar' }).click()
  await expect(removeLast).toBeHidden()
  await expect(
    page.getByText('Listo. Ahora YTCreator usa «Pagar solo lo que uses».', { exact: true }).last(),
  ).toBeVisible()
  await expect(badge(page, 'Pago por uso de Anthropic · Funciona')).toBeVisible()

  // And with the key gone too, nothing is left to take over.
  await page.getByRole('region', { name: 'Claves guardadas' }).getByRole('button', { name: 'Borrar' }).click()
  const removeKey = page.getByRole('dialog', { name: '¿Borrar esta clave?' })
  await expect(removeKey).toContainText('se quedará sin IA conectada')
  await removeKey.getByRole('button', { name: 'Borrar' }).click()
  await expect(removeKey).toBeHidden()
  await expect(badge(page, 'Sin IA conectada')).toBeVisible()
})

test('the General tab: disabling the update notice and the AI timeout override, both surviving a reload (US5)', async ({
  page,
  context,
}) => {
  // Its own server: the previous test ends with no AI connected, which would redirect this one out of /ajustes.
  const local = await startServer({ port: GENERAL_TAB_PORT })
  try {
    await blockExternal(context)
    await page.goto(local.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Ir al inicio' }).click()

    await page.goto(`${local.baseURL}/ajustes/general`)
    await expect(heading(page, 'Ajustes')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')

    const notice = page.getByLabel('Avisarme cuando haya una versión nueva')
    await expect(notice).toBeChecked()
    await notice.click()
    await expect(notice).not.toBeChecked()
    await page.reload()
    await expect(page.getByLabel('Avisarme cuando haya una versión nueva')).not.toBeChecked()

    await page.locator('summary', { hasText: 'Modo experto' }).click()
    const timeout = page.getByLabel('Tiempo máximo de espera de la IA')

    // Out of range (FR: 10 to 300 seconds): rejected with its field message, nothing saved.
    await timeout.fill('5')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Este valor no es válido.')).toBeVisible()

    await timeout.fill('120')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Guardado')).toBeVisible()
    await page.reload()
    await page.locator('summary', { hasText: 'Modo experto' }).click()
    await expect(page.getByLabel('Tiempo máximo de espera de la IA')).toHaveValue('120')
  } finally {
    await local.stop()
  }
})

test('using a saved key that has no limits yet asks only for the limits, not for the key again (T158)', async ({
  page,
  context,
}) => {
  // Its own server: the first test leaves limits saved, and they are what this one goes without.
  const local = await startServer({ port: SAVED_KEY_PORT })
  try {
    await blockExternal(context)
    await page.goto(local.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Ir al inicio' }).click()

    // The key is saved from «Configurar», but the creator goes back without using it: no limits yet.
    await page.goto(`${local.baseURL}/ajustes/ia`)
    await others(page).getByText('Más opciones', { exact: true }).click()
    await others(page).getByRole('button', { name: 'Configurar' }).click()
    await page.getByLabel('Tu clave').fill(FAKE_KEY)
    await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
    await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
    await page.goto(`${local.baseURL}/ajustes/ia`)

    await others(page).getByRole('button', { name: 'Usar esta opción' }).click()
    await expect(heading(page, 'Límites de gasto')).toBeVisible()
    await expect(page.getByLabel('Tu clave')).toHaveCount(0)
    await page.getByRole('button', { name: 'Guardar límites' }).click()

    await expect(heading(page, 'Ajustes')).toBeVisible()
    await expect(badge(page, 'Pago por uso de Anthropic · Funciona')).toBeVisible()
  } finally {
    await local.stop()
  }
})
