import { describe, expect, it } from 'vitest'
import { packageStatus, packageWarnings, type PackageWarningInput } from '../../src/publish/status.ts'

const long = { format: 'largo' as const }
const short = { format: 'short' as const }
const cover = { titulos: 1, miniaturas: 1 }
const texts = { descripcion: 1, capitulos: 1, etiquetas: 1, comentario: 1 }

describe('packageStatus (data-model.md, research.md R2)', () => {
  it('without titles it has not started', () =>
    expect(packageStatus({ ...long, latest: {}, cover: null, texts: null, approved: null })).toBe('sin_empezar'))

  it('the cover in draft until both of its pieces are approved in their last versions', () => {
    expect(packageStatus({ ...long, latest: { titulos: 1 }, cover: null, texts: null, approved: null })).toBe(
      'portada_borrador',
    )
    expect(packageStatus({ ...long, latest: cover, cover: { titulos: 1 }, texts: null, approved: null })).toBe(
      'portada_borrador',
    )
    expect(packageStatus({ ...long, latest: cover, cover, texts: null, approved: null })).toBe('portada_aprobada')
  })

  it('an edition after approving goes back to draft', () => {
    expect(packageStatus({ ...long, latest: { titulos: 2, miniaturas: 1 }, cover, texts: null, approved: null })).toBe(
      'portada_borrador',
    )
    const latest = { ...cover, ...texts, etiquetas: 2 }
    expect(packageStatus({ ...long, latest, cover, texts, approved: { ...cover, ...texts } })).toBe('textos_borrador')
  })

  it('the texts, then the whole package', () => {
    const latest = { ...cover, ...texts }
    expect(packageStatus({ ...long, latest, cover, texts: null, approved: null })).toBe('textos_borrador')
    expect(packageStatus({ ...long, latest, cover, texts, approved: null })).toBe('textos_aprobados')
    expect(packageStatus({ ...long, latest, cover, texts, approved: latest })).toBe('aprobado')
  })

  it('the cover back in draft with the texts written gives portada_borrador', () => {
    const latest = { ...cover, ...texts, titulos: 3 }
    expect(packageStatus({ ...long, latest, cover, texts, approved: { ...cover, ...texts } })).toBe('portada_borrador')
  })

  it('a Short: cover with portada_short and texts without chapters', () => {
    const shortCover = { titulos: 1, portada_short: 1 }
    const shortTexts = { descripcion: 1, etiquetas: 1, comentario: 1 }
    const latest = { ...shortCover, ...shortTexts }
    expect(packageStatus({ ...short, latest: shortCover, cover: shortCover, texts: null, approved: null })).toBe(
      'portada_aprobada',
    )
    expect(packageStatus({ ...short, latest, cover: shortCover, texts: shortTexts, approved: latest })).toBe('aprobado')
  })
})

describe('packageWarnings (data-model.md, «Avisos calculados»)', () => {
  const base: PackageWarningInput = {
    scriptApproved: true,
    scriptApprovedDraft: 3,
    pendingInScript: 0,
    pieces: [
      { kind: 'titulos', draftVersion: 3, mainTitle: null },
      { kind: 'miniaturas', draftVersion: 3, mainTitle: 'El pan' },
      { kind: 'descripcion', draftVersion: 3, mainTitle: 'El pan' },
    ],
    currentMainTitle: 'El pan',
    descriptionFixedText: 'Suscríbete',
    currentFixedText: 'Suscríbete',
    sourcesCount: 2,
  }

  it('nothing when all agrees', () => expect(packageWarnings(base)).toEqual([]))

  it('guion_cambiado when a piece was made with another approved draft', () =>
    expect(packageWarnings({ ...base, scriptApprovedDraft: 4 })).toEqual(['guion_cambiado']))

  it('guion_sin_aprobar when the script went back to draft', () =>
    expect(packageWarnings({ ...base, scriptApproved: false, scriptApprovedDraft: null })).toEqual([
      'guion_sin_aprobar',
    ]))

  it('titulo_cambiado when thumbnails, description or cover were made for another main title', () => {
    expect(packageWarnings({ ...base, currentMainTitle: 'Otro' })).toEqual(['titulo_cambiado'])
    const cover = { kind: 'portada_short' as const, draftVersion: 3, mainTitle: 'Antes' }
    expect(packageWarnings({ ...base, pieces: [...base.pieces, cover] })).toEqual(['titulo_cambiado'])
  })

  it('parte_fija_cambiada when the settings changed after the description', () =>
    expect(packageWarnings({ ...base, currentFixedText: 'Nueva' })).toEqual(['parte_fija_cambiada']))

  it('sin_fuentes only once there is a description', () => {
    expect(packageWarnings({ ...base, sourcesCount: 0 })).toEqual(['sin_fuentes'])
    expect(
      packageWarnings({ ...base, sourcesCount: 0, descriptionFixedText: null, pieces: base.pieces.slice(0, 2) }),
    ).toEqual([])
  })

  it('pendientes_en_guion when the script was approved with claims to check', () =>
    expect(packageWarnings({ ...base, pendingInScript: 2 })).toEqual(['pendientes_en_guion']))
})
