import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// The publishing package, story by story (specs/006-publishing-package/quickstart.md).
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4470 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

async function connect(page: Page) {
  await page.goto(server.baseURL)
  await toConnect(page, 'Usar mi suscripción de Claude')
  await connectAccount(page)
  await expect(page.getByText('Cuenta 1 · Funciona')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(heading(page, 'Todo listo')).toBeVisible()
  await profileByApi(server)
}

// A script written and approved with the fake AI, through the API: the script has its own journeys (005).
async function approvedScript(channelId: string, title: string) {
  const { idea } = (await api(server, 'POST', `/api/channels/${channelId}/ideas`, { title, format: 'largo' })) as {
    idea: { id: string; revision: number }
  }
  await api(server, 'PATCH', `/api/ideas/${idea.id}`, { revision: idea.revision, status: 'elegida' })
  const scriptId = (await api(server, 'POST', `/api/ideas/${idea.id}/script`))['id'] as string
  const ask = async (use: string) => {
    const estimate = await api(server, 'POST', `/api/scripts/${scriptId}/estimate`, { use })
    await api(server, 'POST', `/api/scripts/${scriptId}/generate`, { use, estimateId: estimate['estimateId'] })
    await expect
      .poll(async () => ((await api(server, 'GET', `/api/scripts/${scriptId}`))['job'] as { status: string }).status)
      .toBe('hecho')
    return api(server, 'GET', `/api/scripts/${scriptId}`)
  }
  const outline = (await ask('escaleta'))['outline'] as { version: number }
  await api(server, 'POST', `/api/scripts/${scriptId}/outline/approve`, { version: outline.version })
  const draft = (await ask('guion'))['draft'] as { version: number; content: { claims: { status: string }[] } }
  await api(server, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((claim) => claim.status === 'pendiente').length,
  })
  return scriptId
}

test('title and thumbnail from an approved script, with the keyboard, coming back to it (US1)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id

  // With nothing approved yet it says where to start.
  await page.goto(`${server.baseURL}/canal/publicaciones`)
  await expect(heading(page, 'Mis publicaciones')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Todavía no has preparado ninguna publicación' })).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Ir a mis guiones' }).click()
  await expect(heading(page, 'Mis guiones')).toBeVisible()

  // From the approved script.
  const scriptId = await approvedScript(channelId, 'Pan sin amasar')
  await page.goto(`${server.baseURL}/canal/guiones/${scriptId}`)
  await page.getByRole('button', { name: 'Preparar la publicación' }).click()
  await expect(heading(page, 'Pan sin amasar')).toBeVisible()
  await expect(page.getByText('La gente ve el título y la miniatura juntos', { exact: false })).toBeVisible()
  await audit(page)

  // The price is on the button; the tab is closed while the AI works and the result is there on coming back.
  const propose = page.getByRole('button', { name: /^Proponer títulos/ })
  await expect(propose).toBeEnabled()
  await expect(propose).toContainText('·')
  const url = page.url()
  const asked = page.waitForResponse((response) => response.url().endsWith('/generate'))
  await propose.click()
  await asked
  await page.close()
  const back = await context.newPage()
  await back.goto(url)
  const first = 'Pan sin amasar: el truco que nadie te cuenta'
  await expect(back.getByRole('radio', { name: first })).toBeVisible()
  await expect(back.getByText('Opinión de la IA').first()).toBeVisible()
  await audit(back)

  // The main one with the keyboard, then two to try as well.
  await back.getByRole('radio', { name: first }).focus()
  await back.keyboard.press('Space')
  await expect(back.getByRole('radio', { name: first })).toBeChecked()
  // With the arrows the choice moves and the focus stays; it is saved once, a moment after the last change.
  await back.keyboard.press('ArrowDown')
  await back.keyboard.press('ArrowUp')
  await expect(back.getByRole('radio', { name: first })).toBeFocused()
  await expect(back.getByRole('radio', { name: first })).toBeChecked()
  for (const name of ['Así sale el pan de verdad en casa', 'El error que arruina tu pan casero']) {
    const box = back.getByRole('checkbox', { name })
    await box.focus()
    await back.keyboard.press('Space')
    await expect(box).toBeChecked()
    await expect(box).toBeFocused()
  }
  await expect(back.getByText('Ya tienes 2 para probar')).toBeVisible()
  await expect(back.getByRole('checkbox', { name: 'Pan crujiente sin esfuerzo, paso a paso' })).toBeDisabled()

  // A title of their own.
  await back.getByLabel('Escribir uno mío').fill('Mi pan de cada día')
  await back.getByRole('button', { name: 'Añadir' }).click()
  await expect(back.getByRole('radio', { name: 'Mi pan de cada día' })).toBeVisible()

  // Thumbnails for the main title, one of them edited and chosen.
  await back.getByRole('button', { name: /^Proponer ideas de miniatura/ }).click()
  await expect(back.getByRole('heading', { name: 'Idea 1' })).toBeVisible()
  await back.getByRole('button', { name: 'Editar la idea 1' }).click()
  await back.getByLabel('Texto grande').fill('¡SIN AMASAR!')
  await back.getByRole('button', { name: 'Guardar' }).click()
  await expect(back.getByText('¡SIN AMASAR!')).toBeVisible()
  const pick = back.getByRole('checkbox', { name: 'Elegir la idea de miniatura 1' })
  await pick.focus()
  await back.keyboard.press('Space')
  await expect(pick).toBeChecked()
  await audit(back)

  await back.getByRole('button', { name: 'Aprobar título y miniatura' }).focus()
  await back.keyboard.press('Enter')
  await expect(back.getByText('Título y miniatura aprobados.', { exact: false })).toBeVisible()
  // On coming back it opens where the package has got to: the description, with the cover still approved.
  await back.reload()
  await expect(back.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()
  await back
    .getByRole('navigation', { name: 'Pasos de la publicación' })
    .getByRole('button', { name: 'Título y miniatura' })
    .click()
  await expect(back.getByText('Título y miniatura aprobados.', { exact: false })).toBeVisible()
  await audit(back)

  // The list says where it is, with the main title.
  await back.goto(`${server.baseURL}/canal/publicaciones`)
  await expect(back.getByRole('heading', { name: first })).toBeVisible()
  await expect(back.getByText('Título y miniatura aprobados')).toBeVisible()
  await audit(back)
})

// A package with its cover approved, through the API: US1 is tested above.
async function approvedCover(scriptId: string) {
  const id = (await api(server, 'POST', `/api/scripts/${scriptId}/package`))['id'] as string
  const ask = async (use: string) => {
    const estimate = await api(server, 'POST', `/api/packages/${id}/estimate`, { use })
    await api(server, 'POST', `/api/packages/${id}/generate`, { use, estimateId: estimate['estimateId'] })
    await expect
      .poll(async () => ((await api(server, 'GET', `/api/packages/${id}`))['job'] as { status: string }).status)
      .toBe('hecho')
    return (await api(server, 'GET', `/api/packages/${id}`))['pieces'] as Record<
      string,
      { version: number; content: Record<string, unknown> }
    >
  }
  const titles = (await ask('titulos'))['titulos']!
  const main = (titles.content['candidates'] as { id: string }[])[0]!.id
  await api(server, 'PUT', `/api/packages/${id}/pieces/titulos`, {
    baseVersion: titles.version,
    content: { ...titles.content, main },
  })
  const thumbnails = (await ask('miniaturas'))['miniaturas']!
  const chosen = (thumbnails.content['concepts'] as { id: string }[])[0]!.id
  await api(server, 'PUT', `/api/packages/${id}/pieces/miniaturas`, {
    baseVersion: thumbnails.version,
    content: { ...thumbnails.content, chosen: [chosen] },
  })
  await api(server, 'POST', `/api/packages/${id}/approve`, {
    step: 'portada',
    versions: { titulos: titles.version + 1, miniaturas: thumbnails.version + 1 },
  })
  return id
}

test('the description, its chapters, tags and comment, and the publishing settings (US2)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000)
  await blockExternal(context)
  // The server is shared: when US1 ran first, the AI and the channel are already there.
  if (!(await api(server, 'GET', '/api/channels/current'))['channel']) await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const id = await approvedCover(await approvedScript(channelId, 'Masa madre en casa'))

  // With the cover approved it opens on the description, with its price on the button.
  await page.goto(`${server.baseURL}/canal/publicaciones/${id}`)
  await expect(page.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()
  const propose = page.getByRole('button', { name: /^Proponer descripción/ })
  await expect(propose).toBeEnabled()
  await expect(propose).toContainText('·')
  await audit(page)
  await propose.click()
  await expect(page.getByRole('heading', { name: 'Así queda la descripción' })).toBeVisible()
  // The script has no facts with a link: it says so instead of making sources up.
  await expect(page.getByText('La descripción no tiene fuentes', { exact: false })).toBeVisible()
  await expect(page.getByText('Ajústalos cuando tengas el vídeo montado.')).toBeVisible()
  await expect(page.getByText('(estimado)', { exact: false }).first()).toBeVisible()
  await audit(page)

  // The first lines, rewritten and saved, open the assembled text.
  const assembled = page.locator('p', { hasText: 'Suscríbete' }).first()
  await page.getByLabel('Primeras líneas').fill('Masa madre en casa, sin complicarte.')
  const firstSave = page.getByRole('button', { name: 'Guardar la descripción' })
  await firstSave.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Masa madre en casa, sin complicarte.').first()).toBeVisible()

  // A minute of their own for the second chapter; a wrong one is said before saving.
  const minute = page.getByLabel('Minuto del capítulo 2')
  await minute.fill('1:5')
  await expect(page.getByText('Escríbelo como 1:05 (minutos y segundos).')).toBeVisible()
  await minute.fill('1:05')
  await page.getByRole('button', { name: 'Guardar los capítulos' }).click()
  await expect(minute).toHaveValue('1:05')
  await expect(page.getByText(/^1:05 /m).first()).toBeAttached()

  // Only the pinned comment is written again; the rest stays as it was.
  const before = await page.getByLabel('Primeras líneas').inputValue()
  await page.getByText('Pedir de nuevo el comentario fijado').first().click()
  await page.getByLabel('Qué quieres que cambie en el comentario fijado (opcional)').fill('Más corto.')
  const asked = page.waitForResponse((response) => response.url().endsWith('/generate'))
  await page.getByRole('button', { name: /^Pedir de nuevo el comentario fijado ·/ }).click()
  await asked
  await expect(page.getByRole('button', { name: 'Aprobar descripción' })).toBeEnabled()
  await expect(page.getByLabel('Primeras líneas')).toHaveValue(before)
  await audit(page)

  // The fixed part is changed in the settings, which do not touch the description already written.
  await page.getByRole('button', { name: 'Ajustes de publicación' }).click()
  await expect(heading(page, 'Ajustes de publicación')).toBeVisible()
  await expect(page.getByText('Cambiarla no toca las publicaciones que ya tienes.')).toBeVisible()
  await audit(page)
  await page.getByLabel('Parte fija de la descripción').fill('Más recetas en mi canal.')
  await page.getByRole('combobox', { name: 'Categoría' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('option', { name: /la que te sugerimos/ }).press('Enter')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Ajustes guardados.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Categoría' })).toContainText('la que te sugerimos')
  await audit(page)

  await page.goto(`${server.baseURL}/canal/publicaciones/${id}`)
  await expect(page.getByText('La parte fija de tus descripciones ha cambiado', { exact: false })).toBeVisible()
  await expect(assembled).toBeVisible()
  await page.getByRole('button', { name: 'Usar la nueva' }).click()
  await expect(page.getByText('La parte fija de tus descripciones ha cambiado', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Más recetas en mi canal.').first()).toBeVisible()

  // Approved with the keyboard; it opens on the next step on coming back.
  await page.getByRole('button', { name: 'Aprobar descripción' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Descripción aprobada.', { exact: false })).toBeVisible()
  await audit(page)
  await page.goto(`${server.baseURL}/canal/publicaciones`)
  await expect(page.getByText('Descripción aprobada')).toBeVisible()
})
