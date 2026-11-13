import { readFileSync } from 'node:fs'
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

// A package with its cover approved, through the API: US1 is tested above. With `mainText`, the creator rewrote the
// main title.
async function approvedCover(scriptId: string, mainText?: string) {
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
  const candidates = titles.content['candidates'] as { id: string; text: string }[]
  const main = candidates[0]!.id
  await api(server, 'PUT', `/api/packages/${id}/pieces/titulos`, {
    baseVersion: titles.version,
    content: {
      ...titles.content,
      candidates: mainText ? [{ ...candidates[0]!, text: mainText }, ...candidates.slice(1)] : candidates,
      main,
    },
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

// A package with both steps approved, a main title of 110 characters and a last chapter of 5 seconds: what the
// independent test of US3 starts from (spec.md).
async function packageToReview(channelId: string) {
  const longTitle = `Pan de centeno en casa: ${'paso a paso '.repeat(8)}`.slice(0, 110)
  const id = await approvedCover(await approvedScript(channelId, 'Pan de centeno'), longTitle)
  const estimate = await api(server, 'POST', `/api/packages/${id}/estimate`, { use: 'descripcion' })
  await api(server, 'POST', `/api/packages/${id}/generate`, { use: 'descripcion', estimateId: estimate['estimateId'] })
  await expect
    .poll(async () => ((await api(server, 'GET', `/api/packages/${id}`))['job'] as { status: string }).status)
    .toBe('hecho')
  const view = (await api(server, 'GET', `/api/packages/${id}`)) as {
    script: { blocks: { seconds: number }[] }
    pieces: Record<string, { version: number; content: Record<string, unknown> }>
    texts: { chapters: { startSeconds: number }[] }
  }
  const total = view.script.blocks.reduce((sum, block) => sum + block.seconds, 0)
  const chapters = view.pieces['capitulos']!.content['chapters'] as { startSeconds: number | null; manual: boolean }[]
  const last = chapters.length - 1
  // The last one starts 5 seconds before the end: YouTube needs 10 in each chapter.
  expect(total - 5 - view.texts.chapters[last - 1]!.startSeconds).toBeGreaterThanOrEqual(10)
  await api(server, 'PUT', `/api/packages/${id}/pieces/capitulos`, {
    baseVersion: view.pieces['capitulos']!.version,
    content: {
      chapters: chapters.map((chapter, index) =>
        index === last ? { ...chapter, startSeconds: total - 5, manual: true } : chapter,
      ),
    },
  })
  const texts = ['descripcion', 'capitulos', 'etiquetas', 'comentario']
  const latest = (await api(server, 'GET', `/api/packages/${id}`))['pieces'] as Record<string, { version: number }>
  await api(server, 'POST', `/api/packages/${id}/approve`, {
    step: 'textos',
    versions: Object.fromEntries(texts.map((kind) => [kind, latest[kind]!.version])),
  })
  return { id, longTitle, lastChapter: last + 1 }
}

test('reviewing, copying with and without the clipboard, approving with notices and downloading (US3)', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000)
  await blockExternal(context)
  if (!(await api(server, 'GET', '/api/channels/current'))['channel']) await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const { id, longTitle, lastChapter } = await packageToReview(channelId)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.baseURL })

  // With both steps approved it opens on «Revisar y copiar», with the two notices and nothing spent.
  await page.goto(`${server.baseURL}/canal/publicaciones/${id}`)
  await expect(page.getByRole('heading', { name: 'Revisar y copiar', level: 2 })).toBeVisible()
  await expect(page.getByText(`El título «${longTitle}» tiene 110 caracteres`, { exact: false })).toBeVisible()
  const shortChapter = page.getByText(/dura unos 5 segundos según el guion/)
  await expect(shortChapter).toBeVisible()
  await audit(page)

  // Each notice leads to its piece: the title to its step, the chapter to the description, where it is fixed.
  await page.getByRole('button', { name: 'Corregirlo en «Título y miniatura»' }).first().click()
  await expect(page.getByRole('heading', { name: 'Título y miniatura', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Revisar y copiar', exact: true }).click()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'dura unos 5 segundos' })
    .getByRole('button', { name: 'Corregirlo en «Descripción»' })
    .click()
  await expect(page.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()
  await page.getByLabel(`Minuto del capítulo ${lastChapter}`).fill('')
  await page.getByRole('button', { name: 'Guardar los capítulos' }).click()
  await expect(page.getByRole('button', { name: 'Aprobar descripción' })).toBeEnabled()
  await page.getByRole('button', { name: 'Aprobar descripción' }).click()
  await page.getByRole('button', { name: 'Seguir con revisar y copiar' }).click()
  await expect(page.getByRole('heading', { name: 'Revisar y copiar', level: 2 })).toBeVisible()
  await expect(shortChapter).toHaveCount(0)

  // Copied with the keyboard; the app says so, and what is pasted is the title.
  const copyTitle = page.getByRole('button', { name: 'Copiar Título' })
  await copyTitle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Título: copiado. Pégalo en YouTube Studio.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(longTitle)
  await page.getByRole('button', { name: 'Copiar Descripción' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^0:00 /m)
  // The thumbnail is copied as its indications, for whoever makes the image.
  await page.getByRole('button', { name: 'Copiar Miniatura' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Idea \d+: /)

  // Without the clipboard (no permission, or a server without HTTPS) the text is there, selected, to copy by hand.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Sin permiso', 'NotAllowedError')) },
    })
  })
  await page.getByRole('button', { name: 'Copiar Etiquetas' }).click()
  const manual = page.getByLabel('Etiquetas, para copiar')
  await expect(manual).toBeFocused()
  await expect(manual).toHaveAttribute('readonly', '')
  await expect(page.getByText('pulsa Ctrl+C (⌘C en Mac) para copiarlo', { exact: false })).toBeVisible()
  const selected = await manual.evaluate((field: HTMLTextAreaElement) => field.selectionEnd - field.selectionStart)
  expect(selected).toBe(((await manual.inputValue()) as string).length)
  await audit(page)

  // The guided list: a mark is kept, and it makes no version.
  const language = page.getByRole('checkbox', { name: /^Idioma:/ })
  await language.focus()
  await page.keyboard.press('Space')
  await expect(language).toBeChecked()

  // A notice is left (the long title): the app says how many before approving, and lets the creator decide.
  await page.getByRole('button', { name: 'Aprobar la publicación' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /avisos? sin resolver/ })).toBeVisible()
  await audit(page)
  await dialog.getByRole('button', { name: 'Aprobar igual' }).click()
  await expect(page.getByText(/^Publicación aprobada con \d+ avisos? sin resolver/)).toBeVisible()
  await audit(page)

  // On coming back it is still approved, with the mark; any other step warns before a change.
  await page.reload()
  await expect(page.getByText(/^Publicación aprobada con \d+ avisos? sin resolver/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Idioma:/ })).toBeChecked()
  // Going to change it asks first; staying changes nothing.
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  const leave = page.getByRole('dialog')
  await expect(leave.getByRole('heading', { name: 'Si cambias algo, dejará de estar aprobada' })).toBeVisible()
  await audit(page)
  await leave.getByRole('button', { name: 'Quedarme en revisar y copiar' }).click()
  await expect(page.getByRole('heading', { name: 'Revisar y copiar', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Seguir' }).click()
  await expect(page.getByText('La publicación está aprobada: si cambias algo aquí', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Revisar y copiar', exact: true }).click()

  // The document reads without the app; the thumbnail brief goes apart.
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar el documento' }).click()
  const document = await downloaded
  expect(document.suggestedFilename()).toMatch(/^publicacion-pan-de-centeno-en-casa[a-z0-9-]*\.md$/)
  const text = readFileSync((await document.path())!, 'utf8')
  for (const section of ['## Título', '## Descripción', '## Miniatura', '## Etiquetas', '## Ajustes de YouTube Studio'])
    expect(text).toContain(section)
  expect(text).toContain('- [x] Idioma:')
  const data = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar los datos' }).click()
  const parsed = JSON.parse(readFileSync((await (await data).path())!, 'utf8')) as {
    packages: { titles: { main: string } }[]
  }
  expect(parsed.packages[0]?.titles.main).toBe(longTitle)
  const brief = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar las indicaciones para la miniatura' }).click()
  const briefText = readFileSync((await (await brief).path())!, 'utf8')
  expect(briefText).toContain('# Indicaciones para la miniatura')
  expect(briefText).not.toContain('## Etiquetas')

  // In the queue the idea is ready to publish, and stays there until it is marked as done.
  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Pan de centeno' }).getByText('Lista para publicar'),
  ).toBeVisible()
  await audit(page)

  // Every package of the channel at once.
  await page.goto(`${server.baseURL}/canal/publicaciones`)
  const all = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar todas en un documento' }).click()
  expect((await all).suggestedFilename()).toMatch(/^publicaciones-[a-z0-9-]+\.md$/)
})

// A Short drawn from an approved long video, written and approved through the API (005).
async function approvedShortFromLong(channelId: string) {
  const longId = await approvedScript(channelId, 'Pan de espelta')
  const askOn = async (scriptId: string, use: string) => {
    const estimate = await api(server, 'POST', `/api/scripts/${scriptId}/estimate`, { use })
    await api(server, 'POST', `/api/scripts/${scriptId}/generate`, { use, estimateId: estimate['estimateId'] })
    await expect
      .poll(async () => ((await api(server, 'GET', `/api/scripts/${scriptId}`))['job'] as { status: string }).status)
      .toBe('hecho')
    return api(server, 'GET', `/api/scripts/${scriptId}`)
  }
  const long = await askOn(longId, 'enfoques_short')
  const chosen = await api(server, 'POST', `/api/scripts/${longId}/short-angles/0/choose`, {
    baseUpdatedAt: long['updatedAt'],
  })
  const shortId = chosen['scriptId'] as string
  const draft = (await askOn(shortId, 'guion_short'))['draft'] as {
    version: number
    content: { claims: { status: string }[] }
  }
  await api(server, 'POST', `/api/scripts/${shortId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((claim) => claim.status === 'pendiente').length,
  })
  return shortId
}

test('the package of a Short: no chapters nor thumbnails, a suggested cover and its long video (US4)', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000)
  await blockExternal(context)
  if (!(await api(server, 'GET', '/api/channels/current'))['channel']) await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const shortId = await approvedShortFromLong(channelId)

  // It asks for no chapters nor thumbnail ideas, and says in a sentence how a Short's cover is chosen.
  await page.goto(`${server.baseURL}/canal/guiones/${shortId}`)
  await page.getByRole('button', { name: 'Preparar la publicación' }).click()
  await expect(page.getByRole('heading', { name: 'Título y portada', level: 2 })).toBeVisible()
  await expect(page.getByText('Un Short no lleva miniatura', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Proponer miniaturas/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Proponer títulos/ })).toHaveCount(0)
  await audit(page)

  // One request brings it all: titles, the suggested cover and the texts.
  const ask = page.getByRole('button', { name: /^Proponer la publicación del Short/ })
  await expect(ask).toContainText('·')
  await ask.click()
  const main = page.getByRole('group', { name: 'Principal' })
  await expect(main.getByRole('radio')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Portada sugerida', level: 3 })).toBeVisible()
  await expect(page.getByLabel('Momento del vídeo')).not.toHaveValue('')
  await expect(page.getByRole('button', { name: /^Proponer miniaturas/ })).toHaveCount(0)
  await audit(page)

  // The creator chooses with the keyboard and rewrites the moment; then approves the step.
  await main.getByRole('radio').first().focus()
  await page.keyboard.press('Space')
  await page.getByLabel('Momento del vídeo').fill('Cuando parto el pan y se oye crujir.')
  // What is approved is what is on screen: not before saving it.
  await expect(page.getByRole('button', { name: 'Aprobar título y portada' })).toBeDisabled()
  await expect(page.getByText('Guarda los cambios antes de aprobar.')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar la portada' }).click()
  await expect(page.getByLabel('Momento del vídeo')).toHaveValue('Cuando parto el pan y se oye crujir.')
  await expect(page.getByRole('button', { name: 'Aprobar título y portada' })).toBeEnabled()
  await page.getByRole('button', { name: 'Aprobar título y portada' }).click()
  await expect(page.getByText('Título y portada aprobados', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Seguir con la descripción' }).click()

  // The description: brief, with its hashtags and the long video named, without chapters.
  await expect(page.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()
  await expect(page.getByLabel('Hashtags')).toHaveValue('#pan #receta #shorts')
  await expect(page.getByText('«Vídeo relacionado»', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Este Short sale de tu vídeo «Pan de espelta»', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Capítulos' })).toHaveCount(0)
  await audit(page)
  await page.getByLabel('Hashtags').fill('pan, #espelta')
  await page.getByRole('button', { name: 'Guardar la descripción' }).click()
  await expect(page.getByLabel('Hashtags')).toHaveValue('#pan #espelta')
  await page.getByRole('button', { name: 'Aprobar descripción' }).click()
  await page.getByRole('button', { name: 'Seguir con revisar y copiar' }).click()

  // Reviewed and approved as a long video; the cover goes as indications, with the reminder of the long video.
  await expect(page.getByRole('heading', { name: 'Revisar y copiar', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Portada del Short', level: 4 })).toBeVisible()
  await expect(page.getByText('Este Short sale de tu vídeo «Pan de espelta»', { exact: false })).toBeVisible()
  await audit(page)
  await page.getByRole('button', { name: 'Aprobar la publicación' }).click()
  // With notices left (the fake AI writes no sources), the app asks first, as in a long video.
  const dialog = page.getByRole('dialog')
  const done = page.getByText(/^Publicación aprobada/)
  await expect(dialog.or(done)).toBeVisible()
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Aprobar igual' }).click()
  await expect(done).toBeVisible()
  const brief = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar las indicaciones para la portada' }).click()
  const download = await brief
  expect(download.suggestedFilename()).toMatch(/^portada-[a-z0-9-]+\.md$/)
  expect(readFileSync((await download.path())!, 'utf8')).toContain('Cuando parto el pan y se oye crujir.')
  await audit(page)
})

test('the history of a piece: compare an older version and go back to it, losing none (US5)', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000)
  await blockExternal(context)
  if (!(await api(server, 'GET', '/api/channels/current'))['channel']) await connect(page)
  const channelId = ((await api(server, 'GET', '/api/channels/current'))['channel'] as { id: string }).id
  const { id } = await packageToReview(channelId)

  // A description with four versions: the AI's and three edits of the body; then the texts approved again.
  const pieces = async () =>
    (await api(server, 'GET', `/api/packages/${id}`))['pieces'] as Record<
      string,
      { version: number; content: Record<string, unknown> }
    >
  for (const body of ['La segunda versión del cuerpo.', 'La tercera versión.', 'La cuarta versión.']) {
    const description = (await pieces())['descripcion']!
    await api(server, 'PUT', `/api/packages/${id}/pieces/descripcion`, {
      baseVersion: description.version,
      content: { ...description.content, body },
    })
  }
  const latest = await pieces()
  await api(server, 'POST', `/api/packages/${id}/approve`, {
    step: 'textos',
    versions: Object.fromEntries(
      ['descripcion', 'capitulos', 'etiquetas', 'comentario'].map((kind) => [kind, latest[kind]!.version]),
    ),
  })

  // The whole package approved, as the creator would before going back.
  await page.goto(`${server.baseURL}/canal/publicaciones/${id}`)
  await expect(page.getByRole('heading', { name: 'Revisar y copiar', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar la publicación' }).click()
  const approveDialog = page.getByRole('dialog')
  const done = page.getByText(/^Publicación aprobada/)
  await expect(approveDialog.or(done)).toBeVisible()
  if (await approveDialog.isVisible()) await approveDialog.getByRole('button', { name: 'Aprobar igual' }).click()
  await expect(done).toBeVisible()
  await page.getByRole('button', { name: 'Descripción', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Seguir' }).click()
  await expect(page.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()

  // Every version, from the newest, with where it came from.
  const history = page.getByText('Historial de la descripción')
  await history.focus()
  await page.keyboard.press('Enter')
  const versions = page.locator('li', { hasText: /^Versión \d/ })
  await expect(versions).toHaveCount(4)
  await expect(versions.first()).toContainText('Versión 4 · Tu edición')
  await expect(versions.first()).toContainText('La actual')
  await expect(versions.last()).toContainText('Versión 1 · La IA')
  await audit(page)

  // The second one, compared with the current: only the body changed.
  await page.getByRole('button', { name: 'Comparar con la actual la versión 2 de la descripción' }).click()
  const comparison = page.getByRole('group', { name: 'Comparación de la versión 2 con la actual' })
  await expect(comparison).toBeFocused()
  await expect(comparison.getByRole('heading', { name: 'Cambiado El resto de la descripción' })).toBeVisible()
  await expect(comparison.getByText('La segunda versión del cuerpo.')).toBeVisible()
  await expect(comparison.getByText('La cuarta versión.')).toBeVisible()
  await audit(page)

  // The app already asked on entering the step (FR-015, decision 68): going back is one more version, with the keyboard.
  await comparison.getByRole('button', { name: 'Volver a esta versión' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Has vuelto a la versión 2.', { exact: false })).toBeFocused()
  await expect(page.getByLabel('El resto de la descripción')).toHaveValue('La segunda versión del cuerpo.')

  // None is lost: the fourth is still there, and the new one says where it came from (SC-008).
  await expect(versions).toHaveCount(5)
  await expect(versions.first()).toContainText('Versión 5 · Recuperada')
  await expect(versions.first()).toContainText('copia de la versión 2')
  await expect(page.locator('li', { hasText: /^Versión 4 · Tu edición/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aprobar descripción' })).toBeEnabled()
  await audit(page)

  // Reloading reads it all again from the app's database.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Descripción', level: 2 })).toBeVisible()
  await page.getByText('Historial de la descripción').click()
  await expect(versions).toHaveCount(5)
})
