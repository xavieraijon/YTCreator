import type { JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NicheChange, needsNicheConfirm } from '../../src/screens/channel/new/NicheChange.tsx'

const view = (status: ProposalView['status'] | null, conceptNeedsReview?: boolean) =>
  ({
    state: conceptNeedsReview ? { conceptNeedsReview } : {},
    proposals: status ? [{ kind: 'conceptos', status }] : [],
  }) as unknown as JourneyFullView

describe('changing the niche with a concept approved (FR-025, US2 AS5)', () => {
  it('asks only when going back to the niches with a concept approved', () => {
    expect(needsNicheConfirm(view('aprobada'), 'nichos')).toBe(true)
    expect(needsNicheConfirm(view('aprobada'), 'ritmo')).toBe(false)
    expect(needsNicheConfirm(view('propuesta'), 'nichos')).toBe(false)
    expect(needsNicheConfirm(view(null), 'nichos')).toBe(false)
  })

  it('does not ask twice', () => {
    expect(needsNicheConfirm(view('aprobada', true), 'nichos')).toBe(false)
  })

  it('says it and lets the creator cancel', () => {
    const html = renderToStaticMarkup(<NicheChange open onCancel={() => {}} onConfirm={() => {}} />)
    expect(html).toContain('Tu concepto se basaba en el nicho anterior. ¿Cambiar igualmente?')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Cambiar igualmente')
  })
})
