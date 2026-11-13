import { describe, expect, it } from 'vitest'
import {
  briefFileName,
  packageFileName,
  packageJson,
  packageMarkdown,
  packagesFileName,
  thumbnailBrief,
  type PackageExportInput,
  type PackageExportItem,
} from '../../src/publish/export.ts'
import type { StudioItem } from '../../src/publish/studio.ts'

const STUDIO: StudioItem[] = [
  {
    key: 'publico_infantil',
    answer: false,
    why: 'Depende del público.',
    implications: ['Sin comentarios'],
  },
  {
    key: 'contenido_sintetico',
    answer: null,
    question: '¿Has usado voz realista hecha con IA?',
    why: 'Hay que avisar del contenido realista.',
    mustDisclose: ['Una persona real que dice algo que no dijo'],
    noNeed: ['Usar IA para el guion'],
  },
  { key: 'idioma', answer: 'Español (España)', why: 'Ayuda a YouTube.', assumption: true },
  { key: 'categoria', answer: 'Educación', why: 'Ayuda a YouTube.', assumption: true },
]

const longItem = (extra: Partial<PackageExportItem> = {}): PackageExportItem => ({
  title: 'Cómo ahorrar luz en casa',
  format: 'largo',
  status: 'aprobado',
  approvedAt: '2026-11-13T10:00:00.000Z',
  approvedWarnings: 2,
  mainTitle: 'Cómo ahorrar luz en casa',
  alternatives: ['La factura de la luz, a la mitad'],
  description: 'Lo que cuenta el vídeo.\n\n0:00 Empezamos\n1:05 El truco\n\n#ahorro',
  thumbnails: [
    {
      scene: 'Una persona mira la factura',
      bigText: 'A la mitad',
      emotion: 'Sorpresa',
      composition: 'Cara a la izquierda',
      colors: 'Amarillo y negro',
      title: 'Cómo ahorrar luz en casa',
    },
  ],
  cover: null,
  tags: ['ahorro', 'luz', 'factura'],
  comment: '¿Cuánto pagas tú de luz?',
  studio: STUDIO,
  studioDone: ['idioma'],
  parentTitle: null,
  ...extra,
})

const input = (packages: PackageExportItem[]): PackageExportInput => ({
  exportedAt: '2026-11-13T12:00:00.000Z',
  channel: { id: 'ch-1', displayName: 'Ahorro en casa' },
  packages,
})

describe('packageMarkdown', () => {
  it('has every piece in the order of YouTube Studio', () => {
    const md = packageMarkdown(input([longItem()]))
    const order = ['## Título', '## Descripción', '## Miniatura', '## Etiquetas', '## Comentario fijado', '## Ajustes']
    const positions = order.map((heading) => md.indexOf(heading))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('keeps the description line by line, as it is copied into YouTube', () => {
    const md = packageMarkdown(input([longItem()]))
    expect(md).toContain('```text\nLo que cuenta el vídeo.\n\n0:00 Empezamos\n1:05 El truco\n\n#ahorro\n```')
    expect(md).toContain('```text\nahorro, luz, factura\n```')
  })

  it('reads without the app: status, approval, alternatives and the settings with their marks', () => {
    const md = packageMarkdown(input([longItem()]))
    expect(md).toContain('- Estado: publicación aprobada, lista para publicar')
    expect(md).toContain('- Aprobada el ')
    expect(md).toContain('con 2 avisos sin resolver')
    expect(md).toContain('- La factura de la luz, a la mitad')
    expect(md).toContain('- [x] Idioma: Español (España) (supuesto).')
    expect(md).toContain('- [ ] Categoría: Educación (sugerida, sin elegir).')
    expect(md).toContain('¿Has usado voz realista hecha con IA?')
  })

  it('says one notice in singular, and none when there were none', () => {
    expect(packageMarkdown(input([longItem({ approvedWarnings: 1 })]))).toContain(', con 1 aviso sin resolver')
    expect(packageMarkdown(input([longItem({ approvedWarnings: 0 })]))).toContain(', sin avisos')
  })

  it('uses a longer fence when a text has backticks', () => {
    const md = packageMarkdown(input([longItem({ comment: 'Usa ``` para el código' })]))
    expect(md).toContain('````text\nUsa ``` para el código\n````')
  })

  it('gives a Short its cover and no thumbnail, and names the long video it comes from', () => {
    const md = packageMarkdown(
      input([
        longItem({
          format: 'short',
          thumbnails: [],
          cover: { blockId: 'b1', moment: 'Cuando se apaga la luz', screenText: '¡Ahorra!' },
          parentTitle: 'Cómo ahorrar luz en casa',
        }),
      ]),
    )
    expect(md).toContain('## Portada del Short')
    expect(md).toContain('- Momento: Cuando se apaga la luz')
    expect(md).not.toContain('## Miniatura')
    expect(md).toContain('Sale del vídeo largo «Cómo ahorrar luz en casa»')
  })

  it('leaves out what is empty, and says so when there are no packages', () => {
    const md = packageMarkdown(input([longItem({ comment: '  ', tags: [], approvedAt: null })]))
    expect(md).not.toContain('## Comentario fijado')
    expect(md).not.toContain('## Etiquetas')
    expect(md).not.toContain('Aprobada el')
    expect(packageMarkdown(input([]))).toBe('Todavía no hay ninguna publicación.\n')
  })

  it('says how many packages could not be read', () => {
    const md = packageMarkdown({ ...input([longItem()]), skipped: 2 })
    expect(md).toContain('Faltan 2 publicaciones')
    expect(packageJson({ ...input([longItem()]), skipped: 2 }).skipped).toBe(2)
  })

  it('does not answer for the creator when the profile cannot be read', () => {
    const studio = STUDIO.map((item) => (item.key === 'publico_infantil' ? { ...item, answer: null } : item))
    const md = packageMarkdown(input([longItem({ studio })]))
    expect(md).toContain('Público: no se ha podido leer el perfil del canal')
    expect(md).not.toContain('no está hecho para niños')
  })

  it('treats a blank cover as no cover', () => {
    const blank = longItem({ format: 'short', thumbnails: [], cover: { blockId: 'b1', moment: '  ', screenText: '' } })
    expect(packageMarkdown(input([blank]))).not.toContain('- Momento:')
    expect(thumbnailBrief(blank)).toContain('Todavía no hay portada sugerida.')
  })

  it('puts every package of the channel in one document', () => {
    const md = packageMarkdown(input([longItem(), longItem({ title: 'Otro vídeo', mainTitle: 'Otro vídeo' })]))
    expect(md.split('\n---\n')).toHaveLength(2)
    expect(md).toContain('# Otro vídeo')
  })
})

describe('packageJson', () => {
  it('has the same as the document, with the marks of each setting', () => {
    const json = packageJson(input([longItem()]))
    expect(json.version).toBe(1)
    expect(json.channel).toEqual({ id: 'ch-1', displayName: 'Ahorro en casa' })
    const [item] = json.packages
    expect(item?.titles).toEqual({
      main: 'Cómo ahorrar luz en casa',
      alternatives: ['La factura de la luz, a la mitad'],
    })
    expect(item?.description).toContain('1:05 El truco')
    expect(item?.tags).toEqual(['ahorro', 'luz', 'factura'])
    expect(item?.comment).toBe('¿Cuánto pagas tú de luz?')
    expect(item?.thumbnails[0]?.bigText).toBe('A la mitad')
    expect(item?.studio.map((setting) => [setting.key, setting.done])).toEqual([
      ['publico_infantil', false],
      ['contenido_sintetico', false],
      ['idioma', true],
      ['categoria', false],
    ])
  })

  it('is a JSON a program can read back', () => {
    const json = packageJson(input([longItem()]))
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })
})

describe('thumbnailBrief', () => {
  it('has the title and the ideas chosen, and nothing of the channel', () => {
    const brief = thumbnailBrief(longItem())
    expect(brief).toContain('# Indicaciones para la miniatura: Cómo ahorrar luz en casa')
    expect(brief).toContain('Texto grande: «A la mitad»')
    expect(brief).toContain('Colores: Amarillo y negro')
    for (const other of ['Ahorro en casa', 'ahorro, luz', '¿Cuánto pagas', 'Educación', '0:00'])
      expect(brief).not.toContain(other)
  })

  it('gives a Short the moment for its cover', () => {
    const brief = thumbnailBrief(
      longItem({ format: 'short', thumbnails: [], cover: { blockId: 'b1', moment: 'El enchufe', screenText: '' } }),
    )
    expect(brief).toContain('- Momento: El enchufe')
    expect(brief).toMatch(/^# Indicaciones para la portada: /)
  })
})

describe('file names', () => {
  it('name the files without accents or spaces', () => {
    expect(packageFileName('Cómo ahorrar luz', 'md')).toBe('publicacion-como-ahorrar-luz.md')
    expect(packageFileName('Cómo ahorrar luz', 'json')).toBe('publicacion-como-ahorrar-luz.json')
    expect(packageFileName('Cómo ahorrar luz', 'brief')).toBe('miniatura-como-ahorrar-luz.md')
    expect(packageFileName('¡¡!!', 'md')).toBe('publicacion-sin-titulo.md')
    expect(packagesFileName(null, 'json')).toBe('publicaciones-de-mi-canal.json')
    expect(briefFileName('Un truco', 'short')).toBe('portada-un-truco.md')
    expect(briefFileName('Un truco', 'largo')).toBe('miniatura-un-truco.md')
  })
})
