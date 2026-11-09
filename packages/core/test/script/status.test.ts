import { describe, expect, it } from 'vitest'
import { scriptStatus, scriptWarnings } from '../../src/script/status.ts'

const nothing = { format: 'largo', latestOutline: null, approvedOutline: null, latestDraft: null, approvedDraft: null } as const

describe('scriptStatus', () => {
  it('without outline nor draft: sin_empezar', () => {
    expect(scriptStatus(nothing)).toBe('sin_empezar')
    expect(scriptStatus({ ...nothing, format: 'short' })).toBe('sin_empezar')
  })

  it('an outline without approving: escaleta_borrador', () => {
    expect(scriptStatus({ ...nothing, latestOutline: 2, approvedOutline: 1 })).toBe('escaleta_borrador')
    expect(scriptStatus({ ...nothing, latestOutline: 1 })).toBe('escaleta_borrador')
  })

  it('the last outline approved: escaleta_aprobada', () => {
    expect(scriptStatus({ ...nothing, latestOutline: 3, approvedOutline: 3 })).toBe('escaleta_aprobada')
  })

  it('a draft whose last version is not the approved one: guion_borrador', () => {
    expect(scriptStatus({ ...nothing, latestOutline: 1, approvedOutline: 1, latestDraft: 1 })).toBe('guion_borrador')
    expect(
      scriptStatus({ ...nothing, latestOutline: 1, approvedOutline: 1, latestDraft: 3, approvedDraft: 2 }),
    ).toBe('guion_borrador')
  })

  it('the last draft approved: guion_aprobado', () => {
    expect(
      scriptStatus({ ...nothing, latestOutline: 1, approvedOutline: 1, latestDraft: 2, approvedDraft: 2 }),
    ).toBe('guion_aprobado')
  })

  it('a new outline with a written draft does not change the status', () => {
    expect(
      scriptStatus({ ...nothing, latestOutline: 2, approvedOutline: 1, latestDraft: 2, approvedDraft: 2 }),
    ).toBe('guion_aprobado')
    expect(scriptStatus({ ...nothing, latestOutline: 2, approvedOutline: 1, latestDraft: 1 })).toBe('guion_borrador')
  })

  it('a Short goes to the draft with no outline', () => {
    const short = { ...nothing, format: 'short' } as const
    expect(scriptStatus({ ...short, latestDraft: 1 })).toBe('guion_borrador')
    expect(scriptStatus({ ...short, latestDraft: 1, approvedDraft: 1 })).toBe('guion_aprobado')
  })
})

describe('scriptWarnings', () => {
  const base = {
    ideaRevision: 2,
    profileVersion: 3,
    current: { ideaRevision: 2, profileVersion: 3, factsVersion: 1 },
    latestFacts: 1,
    latestOutline: 1,
    draftOutline: 1,
    source: null,
  }

  it('nothing to say when everything matches', () => expect(scriptWarnings(base)).toEqual([]))

  it('nothing written yet: no warnings', () =>
    expect(scriptWarnings({ ...base, current: null, draftOutline: null, ideaRevision: 9 })).toEqual([]))

  it('warns when the idea changed', () =>
    expect(scriptWarnings({ ...base, ideaRevision: 3 })).toEqual(['idea_cambiada']))

  it('warns when the profile changed', () =>
    expect(scriptWarnings({ ...base, profileVersion: 4 })).toEqual(['perfil_cambiado']))

  it('warns when the facts changed, also when there were none', () => {
    expect(scriptWarnings({ ...base, latestFacts: 2 })).toEqual(['hechos_cambiados'])
    expect(
      scriptWarnings({ ...base, latestFacts: 1, current: { ...base.current, factsVersion: null } }),
    ).toEqual(['hechos_cambiados'])
  })

  it('warns when the outline changed under a written draft', () => {
    expect(scriptWarnings({ ...base, latestOutline: 2 })).toEqual(['escaleta_cambiada'])
    // With no draft written, a new outline says nothing.
    expect(scriptWarnings({ ...base, latestOutline: 2, draftOutline: null })).toEqual([])
  })

  it('warns when the long script of origin moved on', () => {
    expect(scriptWarnings({ ...base, source: { latestDraft: 4, usedDraft: 4 } })).toEqual([])
    expect(scriptWarnings({ ...base, source: { latestDraft: 5, usedDraft: 4 } })).toEqual(['origen_cambiado'])
  })

  it('a Short drawn from a long video warns even before it is written', () => {
    expect(
      scriptWarnings({ ...base, current: null, draftOutline: null, source: { latestDraft: 5, usedDraft: 4 } }),
    ).toEqual(['origen_cambiado'])
  })
})
