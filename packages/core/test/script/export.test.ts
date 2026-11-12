import { describe, expect, it } from 'vitest'
import {
  type ScriptExportItem,
  scriptFileName,
  scriptJson,
  scriptMarkdown,
  scriptsFileName,
} from '../../src/script/export.ts'

const item: ScriptExportItem = {
  title: 'Pan sin amasar',
  hook: 'Sin tocar la masa',
  format: 'largo',
  status: 'guion_aprobado',
  targetSeconds: 600,
  wordsPerMinute: 150,
  notes: 'Mis apuntes.',
  facts: {
    facts: [
      {
        id: 'f',
        text: 'La masa fermenta',
        label: 'una_fuente',
        origin: 'ia',
        alternatives: null,
        sources: [
          {
            id: 's',
            url: 'https://ejemplo.org/a',
            reference: null,
            title: 'Un artículo',
            accessedAt: '2026-11-01T10:00:00.000Z',
            link: 'no_abre',
          },
        ],
      },
    ],
  },
  outline: {
    blocks: [
      {
        id: 'b',
        type: 'gancho',
        title: 'El error',
        purpose: 'Enganchar',
        question: null,
        reward: null,
        bridge: 'Sigue',
        seconds: 90,
      },
    ],
  },
  draft: {
    blocks: [{ id: 'b', type: 'gancho', title: 'El error', text: 'Lo hace el 40 % de la gente.', visual: 'A cámara' }],
    claims: [
      { id: 'c', blockId: 'b', text: '40 %', status: 'pendiente', reason: 'sin_respaldo', factId: null, check: null },
    ],
  },
  approvedAt: '2026-11-09T10:00:00.000Z',
  approvedPending: 1,
}
const input = { exportedAt: '2026-11-09T11:00:00.000Z', channel: { id: 'c', displayName: 'Mi canal' }, scripts: [item] }

describe('the document of a script', () => {
  const md = scriptMarkdown(input)

  it('has the outline, the script, the notes, the marks and the sources', () => {
    expect(md).toContain('# Pan sin amasar')
    expect(md).toContain('Mis apuntes.')
    expect(md).toContain('## Escaleta')
    expect(md).toContain('**Gancho: El error** (unos 1 min 30 s)')
    expect(md).toContain('Lo hace el **40 %** *(por comprobar)* de la gente.')
    expect(md).toContain('*Qué se ve: A cámara*')
    expect(md).toContain(
      '[Un artículo](https://ejemplo.org/a) (consultada el 1 de noviembre de 2026, el enlace no abre)',
    )
    expect(md).toContain('La masa fermenta (una sola fuente)')
    expect(md).toContain('Aprobado el 9 de noviembre de 2026, con 1 por comprobar')
  })

  it('says what is in doubt about a fact, and how each mark was checked', () => {
    const fact = item.facts!.facts[0]!
    const source = { ...fact.sources[0]!, link: 'sin_comprobar' as const }
    const claim = item.draft!.claims[0]!
    const doubtful = scriptMarkdown({
      ...input,
      scripts: [
        {
          ...item,
          facts: { facts: [{ ...fact, alternatives: 'Otra fuente dice otra cosa', sources: [source] }] },
          draft: {
            ...item.draft!,
            claims: [
              {
                ...claim,
                check: {
                  verdict: 'matizar',
                  sources: [source],
                  proposal: 'Casi la mitad',
                  checkedAt: item.approvedAt!,
                },
              },
            ],
          },
        },
      ],
    })
    expect(doubtful).toContain('Otra versión: Otra fuente dice otra cosa')
    expect(doubtful).toContain('enlace sin comprobar')
    expect(doubtful).toContain('## Comprobaciones')
    expect(doubtful).toContain('«40 %»: hay que matizarlo')
    expect(doubtful).toContain('Propuesta: Casi la mitad')
  })

  it('does not let what the creator wrote open a heading or a rule', () => {
    const written = scriptMarkdown({ ...input, scripts: [{ ...item, notes: '# Otro\n---\nsigue', title: 'Uno\ndos' }] })
    expect(written).toContain('\\# Otro\n\\---\nsigue')
    expect(written).toContain('# Uno dos\n')
  })

  it('takes a Short, with no outline and its parts by name', () => {
    const blocks = [{ id: 'b', type: 'desarrollo' as const, title: '', text: 'Lo que se dice.', visual: '' }]
    const short = scriptMarkdown({
      ...input,
      scripts: [{ ...item, format: 'short', outline: null, draft: { blocks, claims: [] } }],
    })
    expect(short).toContain('Formato: Short')
    expect(short).not.toContain('## Escaleta')
    expect(short).toContain('### Desarrollo')
  })

  it('says so when no script has anything in it', () => {
    expect(scriptMarkdown({ ...input, scripts: [] })).toBe('Todavía no hay ningún guion con contenido.\n')
  })

  it('puts several in one file', () => {
    const two = scriptMarkdown({ ...input, scripts: [item, { ...item, title: 'Otro' }] })
    expect(two).toContain('# Pan sin amasar')
    expect(two).toContain('\n---\n')
    expect(two).toContain('# Otro')
  })

  it('leaves out what is not there', () => {
    const empty = scriptMarkdown({
      ...input,
      scripts: [{ ...item, notes: '', facts: null, outline: null, draft: null, approvedAt: null, hook: '' }],
    })
    expect(empty).not.toContain('## ')
  })
})

describe('the data of a script', () => {
  it('has the same, in the open', () => {
    const json = scriptJson(input)
    expect(JSON.parse(JSON.stringify(json))).toMatchObject({
      version: 1,
      channel: { displayName: 'Mi canal' },
      scripts: [
        { title: 'Pan sin amasar', approvedPending: 1, claims: [{ text: '40 %' }], facts: [{ label: 'una_fuente' }] },
      ],
    })
    expect(json.scripts[0]!.draft[0]!.visual).toBe('A cámara')
    expect(json.scripts[0]!.outline[0]!.purpose).toBe('Enganchar')
  })
})

describe('file names', () => {
  it('are safe to save', () => {
    expect(scriptFileName('¿Pan sin amasar?', 'md')).toBe('guion-pan-sin-amasar.md')
    expect(scriptsFileName('Mi Canal', 'json')).toBe('guiones-mi-canal.json')
    expect(scriptsFileName(null, 'md')).toBe('guiones-de-mi-canal.md')
  })
})
