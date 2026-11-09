import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

// «Descargar como documento» and «Descargar como datos» (data-model.md, «Exportación del banco»).
async function bank(t: TestApp) {
  const { channelId } = await finished(t)
  const make = (title: string, query?: string) =>
    t.ideas.ideas.create({
      channelId,
      origin: 'creador',
      title,
      format: 'largo',
      profileVersion: 1,
      ...(query ? { query, broadQuery: 'pan con publico' } : {}),
    })
  const measured = make('Medida', 'pan idea hueco')
  const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [measured.id] }))
    .body as { jobId: string }
  await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
  const second = make('Segunda de la cola')
  const first = make('Primera de la cola')
  const done = make('Ya hecha')
  const archived = make('Archivada')
  t.ideas.ideas.setStatus(first.id, 'elegida')
  t.ideas.ideas.setStatus(second.id, 'elegida')
  t.ideas.ideas.setStatus(done.id, 'hecha')
  t.ideas.ideas.setStatus(archived.id, 'archivada')
  return { channelId }
}
const download = async (t: TestApp, channelId: string, format: string) =>
  t.request('GET', `/api/channels/${channelId}/ideas/export?format=${format}`)

describe('the export of the bank (US4)', () => {
  it('as data: version 1, without the archived, the measure marked as an assumption', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await bank(t)
    const response = await download(t, channelId, 'json')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="banco-de-ideas-.+\.json"$/)
    const data = (await response.json()) as {
      version: number
      channel: { id: string }
      ideas: { title: string; status: string; queuePosition: number | null; measure: Record<string, unknown> | null }[]
    }
    expect(data).toMatchObject({ version: 1, channel: { id: channelId } })
    expect(data.ideas.map((idea) => idea.title)).not.toContain('Archivada')
    expect(data.ideas.find((idea) => idea.title === 'Medida')!.measure).toMatchObject({
      verdict: 'hueco',
      assumption: true,
      thresholdsVersion: expect.any(Number),
      source: expect.any(String),
    })
    expect(data.ideas.find((idea) => idea.title === 'Primera de la cola')).toMatchObject({ queuePosition: 1 })
    expect(data.ideas.find((idea) => idea.title === 'Ya hecha')!.measure).toBeNull()
  })

  it('as a document: the queue first, then the bank and the done ones, in plain words', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await bank(t)
    const response = await download(t, channelId, 'md')
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    expect(response.headers.get('Content-Disposition')).toMatch(/filename="banco-de-ideas-.+\.md"$/)
    const text = await response.text()
    const at = (part: string) => text.indexOf(part)
    expect(at('## Próximos vídeos')).toBeGreaterThan(-1)
    expect(at('1. Primera de la cola')).toBeLessThan(at('2. Segunda de la cola'))
    expect(at('2. Segunda de la cola')).toBeLessThan(at('## En el banco'))
    expect(at('## En el banco')).toBeLessThan(at('## Hechas'))
    expect(text).toContain('Hay hueco (medida en YouTube el')
    expect(text).toContain('los límites del semáforo son un supuesto nuestro')
    expect(text).not.toContain('Archivada')
  })

  it('refuses another format', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    expect(await call(t, 'GET', `/api/channels/${channelId}/ideas/export?format=pdf`)).toMatchObject({
      status: 400,
      body: { error: { fields: { format: 'no_valido' } } },
    })
  })
})
