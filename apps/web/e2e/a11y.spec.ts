import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  blockExternal,
  choose,
  closeClaudePage,
  FAKE_CODE,
  FAKE_KEY,
  heading,
  startServer,
  toConnect,
} from './server.ts'

// SC-010: every screen of contracts/ui-screens.md without axe violations in both themes, at 375 px and at 200 %
// zoom, and the wizard done with the keyboard alone and a visible focus. Ports outside 4310–4329, other than the
// ones the other specs use.
const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

// 200 % zoom on a 1280 × 800 window leaves a 640 × 400 CSS viewport.
const sizes = [
  { name: 'escritorio', width: 1280, height: 800 },
  { name: '375 px', width: 375, height: 800 },
  { name: 'zoom 200 %', width: 640, height: 400 },
] as const

// Each screen in each theme and size: axe, and no horizontal scroll (reflow, WCAG 1.4.10). Collected, not thrown, so
// one run lists them all.
function auditor(page: Page) {
  const failures: string[] = []
  const audit = async (screen: string) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      for (const size of sizes) {
        await page.setViewportSize(size)
        // The colours of a control just clicked or of the theme just switched are measured once settled.
        await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
        })
        const where = `${screen} · ${colorScheme} · ${size.name}`
        const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze()
        for (const violation of violations) {
          failures.push(
            `${where}: ${violation.id} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
          )
        }
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
          failures.push(`${where}: desplazamiento horizontal`)
        }
      }
    }
    await page.setViewportSize(sizes[0])
  }
  return { failures, audit }
}

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
    await expect(page.getByRole('dialog', { name: 'Muy pronto' })).toBeVisible()
    await audit('Home · diálogo «Muy pronto»')
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
  test.setTimeout(120_000)
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

// Tabs until `target` has the focus, and checks a focus ring shows: on it (base.css) or on the box around it, as
// the fields of packages/ui draw it.
async function tabTo(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 40; tabs++) {
    if (await target.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
  const ring = await target.evaluate((element) => {
    if (!element.matches(':focus-visible')) return false
    for (let node: Element | null = element, up = 0; node && up < 3; node = node.parentElement, up++) {
      const style = getComputedStyle(node)
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) return true
    }
    return false
  })
  expect(ring, 'foco visible').toBe(true)
}

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

    // The dialog closes with Escape and gives the focus back to what opened it.
    const create = page.getByRole('button', { name: 'Crear mi primer canal' })
    await tabTo(page, create)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Muy pronto' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Muy pronto' })).toBeHidden()
    await expect(create).toBeFocused()
  } finally {
    await server.stop()
  }
})
