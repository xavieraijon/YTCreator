import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { auditor } from './audit.ts'
import { api, profileByApi } from './channel-api.ts'
import { blockExternal, connectAccount, heading, startServer, toConnect, type TestServer } from './server.ts'

// US4 of the idea bank: the order, the queue, the filters, the archive and the downloads (quickstart.md).
let server: TestServer

test.beforeAll(async () => {
  server = await startServer({ port: 4401 })
})

test.afterAll(async () => {
  await server.stop()
})

const audit = async (page: Page) => {
  const { failures, audit: check } = auditor(page, { onlyWcag: false })
  await check(await page.locator('h1').first().innerText())
  expect(failures).toEqual([])
}

const listTitles = (page: Page) =>
  page
    .getByRole('region', { name: 'Tus ideas' })
    .getByRole('listitem')
    .getByRole('heading', { level: 3 })
    .allInnerTexts()
const queueTitles = (page: Page) =>
  page.getByRole('region', { name: 'Próximos vídeos' }).getByRole('heading', { level: 3 }).allInnerTexts()

test('orders the bank by keyboard, filters, chooses two, archives and recovers, and downloads it (US4)', async ({
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
  for (const [title, format] of [
    ['Pan de molde', 'largo'],
    ['Pan de pita', 'short'],
    ['Pan de centeno', 'largo'],
  ]) {
    await api(server, 'POST', `/api/channels/${channelId}/ideas`, { title, format })
  }

  await page.goto(`${server.baseURL}/canal/ideas`)
  await expect(heading(page, 'Banco de ideas')).toBeVisible()
  await expect.poll(() => listTitles(page)).toEqual(['Pan de molde', 'Pan de pita', 'Pan de centeno'])
  await expect(page.getByText('Todavía no has elegido ninguna.', { exact: false })).toBeVisible()
  await audit(page)

  // By keyboard: the focus stays on the same button, and the new place is said.
  const down = page.getByRole('button', { name: 'Bajar «Pan de molde»' })
  await down.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Movida a la posición 2.')).toBeVisible()
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita', 'Pan de molde', 'Pan de centeno'])
  await expect(down).toBeFocused()
  // The first one cannot go up: it says so, and nothing moves.
  await expect(page.getByRole('button', { name: 'Subir «Pan de pita»' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('button', { name: 'Subir «Pan de pita»' }).click({ force: true })
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita', 'Pan de molde', 'Pan de centeno'])

  // Filters: the Shorts only, then all again.
  await page.getByRole('combobox', { name: 'Formato' }).click()
  await page.getByRole('option', { name: 'Short' }).click()
  await expect(page.getByText('Se ven 1 de 3 ideas.')).toBeVisible()
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita'])
  await audit(page)
  await page.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect.poll(() => listTitles(page)).toHaveLength(3)
  // The button went away: the focus is on the first filter, not lost.
  await expect(page.getByRole('combobox', { name: 'Estado' })).toBeFocused()

  // Two chosen: they go to «Próximos vídeos» in the order they were chosen, and the queue can be reordered.
  await page.getByRole('button', { name: 'Elegir para guion «Pan de centeno»' }).click()
  await expect.poll(() => queueTitles(page)).toEqual(['1. Pan de centeno'])
  await page.getByRole('button', { name: 'Elegir para guion «Pan de pita»' }).click()
  await expect.poll(() => queueTitles(page)).toEqual(['1. Pan de centeno', '2. Pan de pita'])
  await expect(page.getByRole('button', { name: 'Preparar el guion de «Pan de centeno»' })).toBeVisible()
  // Its buttons say they change the queue, not the bank.
  const up = page.getByRole('button', { name: 'Subir en la cola «Pan de pita»' })
  await up.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => queueTitles(page)).toEqual(['1. Pan de pita', '2. Pan de centeno'])
  await expect(up).toBeFocused()
  await audit(page)

  // Archived, it leaves the bank; recovered, it comes back at the end.
  await page.getByRole('button', { name: 'Archivar «Pan de molde»' }).click()
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita', 'Pan de centeno'])
  // Its card is gone: the focus goes to the list.
  await expect(page.getByRole('heading', { name: 'Tus ideas' })).toBeFocused()
  await page.getByText('Archivadas', { exact: true }).click()
  await audit(page)
  await page.getByRole('button', { name: 'Recuperar «Pan de molde»' }).click()
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita', 'Pan de centeno', 'Pan de molde'])

  // After reloading, everything is where it was left.
  await page.reload()
  await expect.poll(() => queueTitles(page)).toEqual(['1. Pan de pita', '2. Pan de centeno'])
  await expect.poll(() => listTitles(page)).toEqual(['Pan de pita', 'Pan de centeno', 'Pan de molde'])

  // The document: the queue first.
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar como documento' }).click()
  const file = await downloading
  expect(file.suggestedFilename()).toMatch(/^banco-de-ideas-.+\.md$/)
  const text = await readFile((await file.path())!, 'utf8')
  expect(text.indexOf('1. Pan de pita')).toBeLessThan(text.indexOf('2. Pan de centeno'))
  expect(text.indexOf('## Próximos vídeos')).toBeLessThan(text.indexOf('## En el banco'))
  const data = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar como datos' }).click()
  expect((await data).suggestedFilename()).toMatch(/^banco-de-ideas-.+\.json$/)
})
