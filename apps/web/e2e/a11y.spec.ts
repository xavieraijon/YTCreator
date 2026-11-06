import { expect, test, type Page } from '@playwright/test'
import { auditor, tabTo } from './audit.ts'
import {
  blockExternal,
  choose,
  closeClaudePage,
  connectAccount,
  FAKE_CODE,
  FAKE_KEY,
  heading,
  startServer,
  toConnect,
} from './server.ts'

// SC-010: every screen of contracts/ui-screens.md without axe violations in both themes, at 375 px and at 200 %
// zoom, and the wizard done with the keyboard alone and a visible focus. Ports outside 4310–4329, other than the
// ones the other specs use.

// The new-version band only shows after the daily check, which never runs in these builds: its answer is faked.
async function withUpdateNotice(page: Page) {
  await page.route('**/api/updates', (route) =>
    route.fulfill({ json: { current: '0.1.0', latest: '0.2.0', show: true } }),
  )
}

test('the subscription screens, the home and the settings pass axe in both themes, at 375 px and at 200 % (SC-010)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  const server = await startServer({ port: 4387 })
  try {
    await blockExternal(context)
    await withUpdateNotice(page)
    const { failures, audit } = auditor(page)
    await page.goto(server.baseURL)

    await expect(heading(page, 'Te damos la bienvenida a YTCreator')).toBeVisible()
    await audit('Welcome')
    await page.getByRole('button', { name: 'Empezar' }).click()
    await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()
    await audit('ChooseAi')

    await page.getByRole('button', { name: 'Lo haré más tarde' }).click()
    await expect(heading(page, 'Conecta una IA')).toBeVisible()
    await audit('ConnectAi')
    await page.getByRole('button', { name: 'Conectar ahora' }).click()

    await choose(page, 'Usar mi suscripción de Claude')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(heading(page, 'Conecta tu suscripción de Claude')).toBeVisible()
    await audit('ConnectSubscription · inicio')
    const popup = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Abrir la página de Claude' }).click()
    await closeClaudePage(popup)
    await expect(page.getByLabel('Código de Claude')).toBeVisible()
    await audit('ConnectSubscription · pegar el código')
    await page.getByLabel('Código de Claude').fill(FAKE_CODE)
    await page.getByRole('button', { name: 'Conectar', exact: true }).click()
    await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
    await audit('ConnectSubscription · conectada')

    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(heading(page, 'Todo listo')).toBeVisible()
    await audit('Done · suscripción')
    await page.getByRole('button', { name: 'Ir al inicio' }).click()
    await expect(heading(page, 'Inicio')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
    await audit('Home con el aviso de versión nueva')

    await page.getByRole('button', { name: 'Crear mi primer canal' }).click()
    await expect(page.getByRole('heading', { name: 'Tu canal', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear mi canal' })).toBeVisible()
    await audit('Inicio del canal')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Cerrar YTCreator' }).click()
    await expect(page.getByRole('dialog', { name: '¿Cerrar YTCreator?' })).toBeVisible()
    await audit('Cabecera · diálogo «¿Cerrar YTCreator?»')
    await page.getByRole('button', { name: 'Seguir usándolo' }).click()

    await page.getByRole('link', { name: 'Tu suscripción de Claude · Funciona' }).click()
    await expect(heading(page, 'Ajustes')).toBeVisible()
    await audit('AiSettings · suscripción')

    // A key refused, then one that works, to pay per use from the settings.
    await server.restart('sin_sesion:clave_no_valida')
    await page.reload()
    const others = page.getByRole('region', { name: 'Otras opciones' })
    await others.getByRole('button', { name: 'Configurar' }).click()
    await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
    await audit('ChangeAi · clave')
    await page.getByLabel('Tu clave').fill(FAKE_KEY)
    await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
    await expect(page.getByText('La clave no es válida.')).toBeVisible()
    await audit('ChangeAi · clave rechazada')

    await server.restart('ok')
    await page.reload()
    await page.getByLabel('Tu clave').fill(FAKE_KEY)
    await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
    await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
    await audit('ChangeAi · clave guardada')
    await page.getByRole('button', { name: 'Usar esta opción' }).click()
    await expect(heading(page, 'Límites de gasto')).toBeVisible()
    await audit('ChangeAi · límites')
    await page.getByRole('button', { name: 'Guardar límites' }).click()
    await expect(heading(page, 'Ajustes')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Claves guardadas' })).toBeVisible()
    await audit('AiSettings · pago por uso, cuenta, clave y límites')

    await page.getByRole('tab', { name: 'General' }).click()
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    await page.getByText('Modo experto', { exact: true }).click()
    await expect(page.getByText('Tiempo máximo de espera de la IA')).toBeVisible()
    await audit('GeneralSettings con el modo experto abierto')

    // Without any AI connected, the home warns above its content.
    await page.getByRole('tab', { name: 'IA' }).click()
    await page.getByRole('region', { name: 'Claves guardadas' }).getByRole('button', { name: 'Borrar' }).click()
    await page.getByRole('dialog', { name: '¿Borrar esta clave?' }).getByRole('button', { name: 'Borrar' }).click()
    await page.getByRole('region', { name: 'Cuentas de suscripción' }).getByRole('button', { name: 'Borrar' }).click()
    await expect(page.getByRole('dialog', { name: '¿Borrar Cuenta 1?' })).toBeVisible()
    await audit('AiSettings · diálogo «¿Borrar Cuenta 1?»')
    await page.getByRole('dialog', { name: '¿Borrar Cuenta 1?' }).getByRole('button', { name: 'Borrar' }).click()
    await expect(page.getByRole('link', { name: 'Sin IA conectada' })).toBeVisible()
    await audit('AiSettings · sin IA conectada')

    expect(failures).toEqual([])
  } finally {
    await server.stop()
  }
})

test('the pay-per-use wizard screens pass axe in both themes, at 375 px and at 200 % (SC-010)', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  const server = await startServer({ port: 4386 })
  try {
    await blockExternal(context)
    const { failures, audit } = auditor(page)
    await page.goto(server.baseURL)

    await toConnect(page, 'Pagar solo lo que uses')
    await expect(heading(page, 'Conecta tu clave de Anthropic')).toBeVisible()
    await page.getByLabel('Tu clave').fill(FAKE_KEY)
    await page.getByRole('button', { name: 'Comprobar y guardar' }).click()
    await expect(page.getByText(`Clave guardada ••••${FAKE_KEY.slice(-4)} · Funciona`)).toBeVisible()
    await audit('ConnectApiKey · clave guardada')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(heading(page, 'Pon tus límites de gasto')).toBeVisible()
    await audit('Limits')
    const perOperation = page.getByLabel('Por operación (€)')
    await perOperation.fill('cinco')
    await page.getByLabel('Por mes (€)').fill('2000')
    await page.getByRole('button', { name: 'Guardar límites' }).click()
    await expect(perOperation).toHaveAccessibleDescription(/Este valor no es válido/)
    await audit('Limits con errores')
    await perOperation.fill('0,50')
    await page.getByLabel('Por mes (€)').fill('20')
    await page.getByRole('button', { name: 'Guardar límites' }).click()

    await expect(heading(page, 'Todo listo')).toBeVisible()
    await audit('Done · pago por uso')

    expect(failures).toEqual([])
  } finally {
    await server.stop()
  }
})

test('the whole wizard with the keyboard alone, the focus always visible (SC-010)', async ({ page, context }) => {
  const server = await startServer({ port: 4385 })
  try {
    await blockExternal(context)
    await page.goto(server.baseURL)

    await tabTo(page, page.getByRole('button', { name: 'Empezar' }))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Elige cómo usar la IA')).toBeVisible()

    // The arrows move the choice; the first option is the one already marked.
    const subscription = page.getByRole('radio', { name: /Usar mi suscripción de Claude/ })
    const perUse = page.getByRole('radio', { name: /Pagar solo lo que uses/ })
    await tabTo(page, subscription)
    await page.keyboard.press('ArrowDown')
    await expect(perUse).toBeChecked()
    await page.keyboard.press('ArrowUp')
    await expect(subscription).toBeChecked()
    await tabTo(page, page.getByRole('button', { name: 'Continuar' }))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Conecta tu suscripción de Claude')).toBeVisible()

    const popup = page.waitForEvent('popup')
    await tabTo(page, page.getByRole('button', { name: 'Abrir la página de Claude' }))
    await page.keyboard.press('Enter')
    await closeClaudePage(popup)
    await page.bringToFront()
    await tabTo(page, page.getByLabel('Código de Claude'))
    await page.keyboard.type(FAKE_CODE)
    await tabTo(page, page.getByRole('button', { name: 'Conectar', exact: true }))
    await page.keyboard.press('Enter')
    await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()

    await tabTo(page, page.getByRole('button', { name: 'Continuar' }))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Todo listo')).toBeVisible()
    await tabTo(page, page.getByRole('button', { name: 'Ir al inicio' }))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Inicio')).toBeVisible()

    // The way into the channel also works with the keyboard alone.
    await tabTo(page, page.getByRole('button', { name: 'Crear mi primer canal' }))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Tu canal')).toBeVisible()
  } finally {
    await server.stop()
  }
})

test('a new channel from the interests to the name with the keyboard alone (T123)', async ({ page, context }) => {
  test.setTimeout(180_000)
  const server = await startServer({ port: 4386 })
  const press = async (name: string | RegExp) => {
    await tabTo(page, page.getByRole('button', { name }).first())
    await page.keyboard.press('Enter')
  }
  try {
    await blockExternal(context)
    await page.goto(server.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Ir al inicio' }).click()
    await press('Crear mi primer canal')
    await press('Crear mi canal')

    await expect(heading(page, '¿Qué te interesa?')).toBeVisible()
    await tabTo(page, page.getByLabel('Cuéntalo con tus palabras'))
    await page.keyboard.type('Me gusta cocinar rápido y explicar recetas.')
    await press('Seguir')

    await expect(heading(page, 'Unas preguntas')).toBeVisible()
    await press(/Preparar las preguntas/)
    await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible()
    await press('Saltar')

    await expect(heading(page, 'Elige el tema de tu canal')).toBeVisible()
    await press(/Proponer nichos/)
    await expect(page.getByRole('button', { name: 'Elegir este nicho' }).first()).toBeEnabled()

    // The niche of your own: the disclosure opens with the keyboard, the same as its form.
    await tabTo(page, page.locator('summary', { hasText: 'Escribir mi propio nicho' }))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByLabel('Tu nicho'))
    await page.keyboard.type('Cocina de aprovechamiento')
    await press('Medir mi nicho')
    await expect(page.getByRole('article', { name: 'Cocina de aprovechamiento' })).toBeVisible()

    await press('Elegir este nicho')
    await expect(page.getByText('Nicho elegido')).toBeVisible()
    await press('Ver canales de referencia')
    const references = page.getByRole('region', { name: 'Canales de referencia' })
    await expect(references.getByRole('article').first()).toBeVisible()
    await tabTo(page, references.getByRole('button', { name: 'Quitar' }).first())
    await tabTo(page, page.getByRole('button', { name: 'Seguir', exact: true }).last())
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Tu ritmo')).toBeVisible()
    await tabTo(page, page.getByLabel(/Horas por semana/))
    await page.keyboard.type('8')
    await tabTo(page, page.getByRole('radio').first())
    await page.keyboard.press('Space')
    await press('Seguir')

    await expect(heading(page, 'La idea de tu canal')).toBeVisible()
    await press(/Proponer ideas/)
    await expect(page.getByRole('button', { name: 'Elegir esta idea' }).first()).toBeVisible()

    // Changing something in a concept, without leaving the keyboard.
    await press('Cambiar algo')
    await tabTo(page, page.getByLabel('La promesa'))
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Cenas de diario sin complicarte la vida.')
    await press('Guardar cambios')
    await expect(page.getByRole('article', { name: 'Cenas de diario sin complicarte la vida.' })).toBeVisible()

    await press('Elegir esta idea')
    await tabTo(page, page.getByRole('button', { name: 'Seguir', exact: true }))
    await page.keyboard.press('Enter')

    await expect(heading(page, 'El nombre de tu canal')).toBeVisible()
    await press('Decidir más tarde')
    await expect(page.getByRole('button', { name: 'Elegir el nombre' })).toBeVisible()
    await press('Elegir el nombre')

    // Entry 136: from the profile, in its own panel.
    await expect(page.getByRole('region', { name: 'Elegir el nombre' })).toBeVisible()
    await press(/Proponer nombres/)
    await expect(page.getByRole('article').first().getByText('Camino libre')).toBeVisible()

    // A name of your own, taken: the question that comes up is answered with the keyboard too.
    await tabTo(page, page.locator('summary', { hasText: 'Escribir el mío' }))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByLabel('Tu nombre'))
    await page.keyboard.type('Canal Ocupado')
    await tabTo(page, page.getByLabel('La @ que quieres'))
    await page.keyboard.type('ocupado1')
    await press('Comprobar mi nombre')
    const mine = page.getByRole('article', { name: 'Canal Ocupado' })
    await expect(mine.getByText('Problema')).toBeVisible()
    await tabTo(page, mine.getByRole('button', { name: 'Quedarme con este nombre' }))
    await page.keyboard.press('Enter')
    const ask = page.getByRole('dialog', { name: /Quedarte con «Canal Ocupado»/ })
    await expect(ask).toBeVisible()
    await tabTo(page, ask.getByRole('button', { name: 'Mirar otros' }))
    await page.keyboard.press('Enter')
    await expect(ask).toHaveCount(0)

    await press('Quedarme con este nombre')
    await expect(page.getByText('Elegido, aún sin usar')).toBeVisible()
    await press('Usar este nombre')
    await expect(page.getByText(/Nombre cambiado: ahora es/).first()).toBeVisible()
    await expect(page).toHaveURL(/\/canal$/)
  } finally {
    await server.stop()
  }
})

test('an existing channel from its link to the profile with the keyboard alone (T123)', async ({ page, context }) => {
  test.setTimeout(180_000)
  const server = await startServer({ port: 4382 })
  const press = async (name: string | RegExp) => {
    await tabTo(page, page.getByRole('button', { name }).first())
    await page.keyboard.press('Enter')
  }
  try {
    await blockExternal(context)
    await page.goto(server.baseURL)
    await toConnect(page, 'Usar mi suscripción de Claude')
    await connectAccount(page)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Ir al inicio' }).click()
    await press('Crear mi primer canal')
    await press('Ya tengo un canal')

    await expect(heading(page, 'Busca tu canal')).toBeVisible()
    await tabTo(page, page.getByLabel('El enlace de tu canal o su @'))
    await page.keyboard.type('@cocinacorta30')
    await press('Buscar mi canal')

    await expect(heading(page, '¿Es este tu canal?')).toBeVisible()
    await tabTo(page, page.getByRole('button', { name: 'No, buscar otro' }))
    await press('Sí, es mi canal')

    await expect(heading(page, 'Lo que hemos leído de tu canal')).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver mi perfil actual/ })).toBeEnabled()
    await press(/Ver mi perfil actual/)

    const profile = page.getByRole('region', { name: 'Tu perfil actual' })
    await tabTo(page, profile.getByRole('button', { name: 'Aprobar' }))
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Tu ritmo')).toBeVisible()
    await tabTo(page, page.getByLabel(/Horas por semana/))
    await page.keyboard.type('8')
    await tabTo(page, page.getByRole('radio').first())
    await page.keyboard.press('Space')
    await press('Seguir')

    await expect(heading(page, 'Cómo enfocar tu canal')).toBeVisible()
    await tabTo(page, profile.getByRole('button', { name: 'Editar' }))
    await page.keyboard.press('Enter')
    await tabTo(page, profile.getByLabel('De qué va tu canal'))
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Recetas de diario para gente con prisa.')
    await tabTo(page, profile.getByRole('button', { name: 'Guardar cambios' }))
    await page.keyboard.press('Enter')
    await expect(profile.getByText('Recetas de diario para gente con prisa.')).toBeVisible()

    await press(/Proponer cómo enfocarlo/)
    const proposal = page.getByRole('region', { name: 'Lo que te proponemos' })
    await expect(proposal.getByRole('button', { name: 'Aprobar' })).toBeVisible()
    await tabTo(page, proposal.getByRole('button', { name: 'Editar' }))
    await tabTo(page, proposal.getByRole('button', { name: 'Aprobar' }))
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: 'Cocina Corta' })).toBeVisible()

    // The profile (US5): edited, and back to the version before, with the keyboard alone.
    await press('Editar')
    await tabTo(page, page.getByLabel('La promesa'))
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Cenas de diario en veinte minutos.')
    await press('Guardar cambios')
    await expect(page.getByText('Cenas de diario en veinte minutos.')).toBeVisible()
    await tabTo(page, page.locator('summary', { hasText: 'Versiones anteriores' }))
    await page.keyboard.press('Enter')
    await press('Volver a esta versión')
    await expect(page.getByText(/Has vuelto a la versión \d+/)).toBeVisible()
    await tabTo(page, page.getByRole('button', { name: 'Descargar como documento' }))

    // Ajustes → YouTube: the key in «Modo experto», reached with the keyboard.
    await page.goto(`${server.baseURL}/ajustes/youtube`)
    await tabTo(page, page.locator('summary', { hasText: 'Modo experto' }))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByLabel('Tu clave de YouTube'))
    await page.keyboard.type('AIzaFAKE-keyboard-0000')
    await press('Comprobar y guardar')
    await expect(page.getByText('Clave guardada ••••0000')).toBeVisible()
  } finally {
    await server.stop()
  }
})
