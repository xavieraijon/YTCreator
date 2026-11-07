import type { JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NicheChange, needsNicheConfirm } from '../../src/screens/channel/new/NicheChange.tsx'

const niches = {
  kind: 'nichos',
  status: 'aprobada',
  selectedIndex: 0,
  payload: { niches: [{ label: 'Cocina' }, { label: 'Viajes' }] },
  editedPayload: null,
}
const view = (status: ProposalView['status'] | null, state: object = {}, chosen = true) =>
  ({
    state,
    proposals: [
      chosen ? niches : { ...niches, status: 'propuesta', selectedIndex: null },
      ...(status ? [{ kind: 'conceptos', status }] : []),
    ],
  }) as unknown as JourneyFullView

describe('changing the niche with a concept approved (FR-025, US2 AS5, P4)', () => {
  it("asks only when another niche than the concept's is chosen", () => {
    expect(needsNicheConfirm(view('aprobada'), 'Viajes')).toBe(true)
    expect(needsNicheConfirm(view('aprobada'), 'Cocina')).toBe(false)
    expect(needsNicheConfirm(view('propuesta'), 'Viajes')).toBe(false)
    expect(needsNicheConfirm(view(null), 'Viajes')).toBe(false)
  })

  it('compares with the niche the concept was chosen on, also from another batch', () => {
    expect(needsNicheConfirm(view('aprobada', { conceptNiche: 'Cocina' }, false), 'Cocina')).toBe(false)
    expect(needsNicheConfirm(view('aprobada', { conceptNiche: 'Cocina' }, false), 'Viajes')).toBe(true)
  })

  it('does not ask twice', () => {
    expect(needsNicheConfirm(view('aprobada', { conceptNeedsReview: true }), 'Viajes')).toBe(false)
  })

  it('says it and lets the creator cancel', () => {
    const html = renderToStaticMarkup(<NicheChange open onCancel={() => {}} onConfirm={() => {}} />)
    expect(html).toContain('Tu idea se basaba en el nicho anterior. ¿Cambiar igualmente?')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Cambiar igualmente')
  })
})
