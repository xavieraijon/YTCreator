import type { AiRunFailure, EstimateView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { costLabel, Proposal } from '../../src/screens/channel/Proposal.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const text = channelEs.proposal
const estimate: EstimateView = {
  estimateId: 'e1',
  use: 'nichos',
  cents: 4,
  included: false,
  blockedBy: null,
  pricingVersion: 1,
}

const render = (props: { estimate?: EstimateView | null; failure?: AiRunFailure; claimsTrimmed?: boolean } = {}) =>
  renderToStaticMarkup(
    <Proposal estimate={estimate} onApprove={() => {}} onEdit={() => {}} onRegenerate={() => {}} {...props}>
      <p>Contenido</p>
    </Proposal>,
  )
const buttonWith = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map(([b]) => b).find((b) => b.includes(label))

describe('costLabel (FR-029)', () => {
  it('puts the amount on the action', () => {
    expect(costLabel('Proponer otra', estimate)).toMatch(/^Proponer otra · unos 0,04 €$/)
  })
  it('says the subscription includes it', () => {
    expect(costLabel('Proponer otra', { ...estimate, cents: 0, included: true })).toBe(
      'Proponer otra · Incluido en tu suscripción',
    )
  })
  it('without an estimate, only the action', () => {
    expect(costLabel('Proponer otra', null)).toBe('Proponer otra')
  })
})

describe('Proposal', () => {
  it('offers to approve, edit and propose another, asking what to change', () => {
    const html = render()
    expect(html).toContain('Contenido')
    expect(buttonWith(html, text.approve)).toContain('data-variant="primary"')
    expect(buttonWith(html, text.edit)).toBeTruthy()
    expect(buttonWith(html, text.regenerate)).toContain('0,04')
    expect(html).toContain(text.whatToChange)
  })

  it('the step can name its approval', () => {
    const html = renderToStaticMarkup(
      <Proposal
        estimate={estimate}
        approveLabel="Elegir este nicho"
        onApprove={() => {}}
        onEdit={() => {}}
        onRegenerate={() => {}}
      >
        <p />
      </Proposal>,
    )
    expect(html).toContain('Elegir este nicho')
    expect(html).not.toContain(`>${text.approve}<`)
  })

  it('without an estimate yet, proposing another waits', () => {
    expect(buttonWith(render({ estimate: null }), text.regenerate)).toContain('disabled')
  })

  it('over a limit: says which one and links to the limits, and the button is off', () => {
    const html = render({ estimate: { ...estimate, blockedBy: 'diario' } })
    expect(html).toContain(text.blocked.diario)
    expect(html).toContain(text.goLimits)
    expect(buttonWith(html, text.regenerate)).toContain('disabled')
  })

  it('limite_de_gasto goes to the limits; another failure offers to try again', () => {
    const limit = render({ failure: 'limite_de_gasto' })
    expect(limit).toContain(channelEs.aiFailure.limite_de_gasto)
    expect(limit).toContain(text.goLimits)
    const timeout = render({ failure: 'tiempo_agotado' })
    expect(timeout).toContain(channelEs.aiFailure.tiempo_agotado)
    expect(timeout).toContain(text.retry)
    expect(timeout).not.toContain(text.goLimits)
  })

  it('explains when sentences with figures were taken out', () => {
    expect(render({ claimsTrimmed: true })).toContain(text.claimsTrimmed)
    // A whole option may have gone, not only a sentence.
    expect(text.claimsTrimmed).toContain('opciones')
    expect(render()).not.toContain(text.claimsTrimmed)
  })
})
