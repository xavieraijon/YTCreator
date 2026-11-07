import { describe, expect, it } from 'vitest'
import {
  type BankExportInput,
  bankFileName,
  bankJson,
  bankMarkdown,
  type ExportMeasure,
} from '../../src/ideas/export.ts'
import type { Idea } from '../../src/ideas/model.ts'

// The export of the bank (specs/004-idea-bank/data-model.md, «Exportación del banco»).
const at = '2026-11-07T10:00:00.000Z'
const idea = (id: string, title: string, fields: Partial<Idea> = {}): Idea => ({
  id,
  channelId: 'c1',
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title,
  hook: '',
  pillar: null,
  format: 'largo',
  notes: '',
  status: 'banco',
  position: 1,
  queuePosition: null,
  original: {},
  revision: 1,
  profileVersion: 1,
  createdAt: at,
  updatedAt: at,
  query: null,
  broadQuery: null,
  queryEn: null,
  ...fields,
})
const measure = (fields: Partial<ExportMeasure> = {}): ExportMeasure => ({
  status: 'medida',
  verdict: 'hueco',
  reason: 'pocos_con_publico',
  figures: { similar: 3 },
  source: 'ytdlp',
  measuredAt: at,
  thresholdsVersion: 5,
  olderRevision: false,
  stale: false,
  ...fields,
})
const input = (ideas: BankExportInput['ideas']): BankExportInput => ({
  exportedAt: at,
  channel: { id: 'c1', displayName: 'Pan en casa' },
  ideas,
})

describe('the export of the bank', () => {
  it('as data: version 1, the measure marked as an assumption, a failed one as none', () => {
    const data = bankJson(
      input([
        { idea: idea('a', 'Medida'), measure: measure({ olderRevision: true, stale: true }) },
        { idea: idea('b', 'Fallida'), measure: measure({ status: 'fallida', verdict: null }) },
      ]),
    )
    expect(data).toMatchObject({ version: 1, channel: { id: 'c1', displayName: 'Pan en casa' } })
    // The format of data-model.md, field by field: what only the document says does not go in the data.
    expect(data.ideas[0]!.measure).toEqual({
      verdict: 'hueco',
      reason: 'pocos_con_publico',
      figures: { similar: 3 },
      source: 'ytdlp',
      measuredAt: at,
      assumption: true,
      thresholdsVersion: 5,
    })
    expect(data.ideas[1]!.measure).toBeNull()
  })

  it('as a document: the queue in order, then the bank and the done ones, each with who wrote it', () => {
    const text = bankMarkdown(
      input([
        { idea: idea('b', 'Bizcocho', { origin: 'ia' }), measure: null },
        { idea: idea('q2', 'Segunda', { status: 'elegida', queuePosition: 2 }), measure: null },
        { idea: idea('q1', 'Primera', { status: 'elegida', queuePosition: 1 }), measure: null },
        { idea: idea('d', 'Hecha', { status: 'hecha', origin: 'otro_enfoque', sourceIdeaId: 'b' }), measure: null },
      ]),
    )
    expect(text.startsWith('# Banco de ideas de Pan en casa\n')).toBe(true)
    const order = [
      '## Próximos vídeos',
      '### 1. Primera',
      '### 2. Segunda',
      '## En el banco',
      '### Bizcocho',
      '## Hechas',
    ]
    const places = order.map((part) => text.indexOf(part))
    expect(places.every((place) => place >= 0)).toBe(true)
    expect([...places].sort((a, b) => a - b)).toEqual(places)
    expect(text).toContain('- Origen: Propuesta por la IA')
    expect(text).toContain('- Origen: Otro enfoque de «Bizcocho»')
    expect(text).toContain('- Semáforo: Sin medir')
  })

  it('the semaphore with its date and the assumption, and what makes it worth less now', () => {
    const line = (fields: Partial<ExportMeasure>) =>
      bankMarkdown(input([{ idea: idea('a', 'Pan'), measure: measure(fields) }]))
        .split('\n')
        .find((one) => one.startsWith('- Semáforo:'))
    expect(line({})).toMatch(
      /^- Semáforo: Hay hueco \(medida en YouTube el .+; los límites del semáforo son un supuesto nuestro\)$/,
    )
    expect(line({ stale: true })).toContain('es una medida antigua')
    expect(line({ olderRevision: true })).toContain('la idea cambió después de medirla')
    expect(line({ status: 'fallida', verdict: null })).toBe('- Semáforo: Sin medir')
  })

  it('notes of several lines stay in their item', () => {
    const text = bankMarkdown(input([{ idea: idea('a', 'Pan', { notes: 'uno\n## Hechas\n' }), measure: null }]))
    expect(text).toContain('- Notas: uno ## Hechas')
    expect(text).not.toContain('\n## Hechas')
  })

  it('an empty bank says so', () => {
    expect(bankMarkdown(input([]))).toContain('Todavía no hay ideas en el banco.')
  })

  it('the file name, without accents or signs', () => {
    expect(bankFileName('Cocina fácil: ¡ya!', 'md')).toBe('banco-de-ideas-cocina-facil-ya.md')
    expect(bankFileName(null, 'json')).toBe('banco-de-ideas-de-mi-canal.json')
  })
})
