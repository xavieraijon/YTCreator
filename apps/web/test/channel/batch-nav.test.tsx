import type { ProposalView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BatchNav } from '../../src/screens/channel/BatchNav.tsx'

const proposal: ProposalView = {
  id: 'p2',
  journeyId: 'j1',
  kind: 'conceptos',
  payload: {},
  editedPayload: null,
  selectedIndex: null,
  status: 'propuesta',
  parentId: null,
  newerId: null,
  instructions: null,
  promptId: 'conceptos',
  promptVersion: 1,
  claimsTrimmed: false,
  usageId: null,
  createdAt: '2026-11-06T10:00:00Z',
  decidedAt: null,
}
const render = (extra: Partial<ProposalView>, single = false) =>
  renderToStaticMarkup(<BatchNav proposal={{ ...proposal, ...extra }} reload={async () => {}} single={single} />)

describe('BatchNav (P3)', () => {
  it('shows nothing with only one batch', () => {
    expect(render({})).toBe('')
  })
  it('goes back to the previous batch', () => {
    const html = render({ parentId: 'p1' })
    expect(html).toContain('Volver a la tanda anterior')
    expect(html).not.toContain('más nueva')
  })
  it('brings back the newer batch that going back left', () => {
    const html = render({ newerId: 'p3' })
    expect(html).toContain('Volver a la tanda más nueva')
    expect(html).not.toContain('tanda anterior')
  })
  it('one proposal at a time says «la anterior» and «la más nueva»', () => {
    const html = render({ parentId: 'p1', newerId: 'p3' }, true)
    expect(html).toContain('Volver a la anterior')
    expect(html).toContain('Volver a la más nueva')
  })
})
