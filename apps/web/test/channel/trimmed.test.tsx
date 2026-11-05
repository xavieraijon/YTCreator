import type { JourneyFullView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Opinion, OpinionCard } from '../../src/screens/channel/new/Niches.tsx'
import { Questions, QuestionsView } from '../../src/screens/channel/new/Questions.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const { questions: questionsText, niches, proposal } = channelEs
const noop = () => undefined

const questions = (list: { id: string; question: string; why: string }[], trimmed?: boolean) =>
  renderToStaticMarkup(<QuestionsView questions={list} onNext={noop} onSkip={noop} {...(trimmed ? { trimmed } : {})} />)
const one = [{ id: 'q1', question: '¿Qué te gusta?', why: 'Para afinar.' }]

const withProposal = (kind: string, payload: object) =>
  ({
    id: 'j1',
    state: {},
    proposals: [{ id: 'p1', kind, payload, editedPayload: null, claimsTrimmed: true }],
  }) as unknown as JourneyFullView
const reload = async () => undefined

describe('what the check of figures took away is told on screen (P18)', () => {
  it('the screens pass on what the proposal says', () => {
    const asked = withProposal('preguntas', { questions: [] })
    expect(renderToStaticMarkup(<Questions view={asked} busy={false} reload={reload} onStep={noop} />)).toContain(
      questionsText.noneTrimmed,
    )
    const opinion = withProposal('recomendacion', { recommendedLabel: 'Cocina', why: 'Equilibrado.', cautions: [] })
    expect(renderToStaticMarkup(<Opinion view={opinion} reload={reload} />)).toContain(niches.opinion.trimmed)
  })

  it('questions all gone do not read as if none were needed', () => {
    const html = questions([], true)
    expect(html).toContain(questionsText.noneTrimmed)
    expect(html).not.toContain(questionsText.none)
  })

  it('with no questions and nothing taken away, none were needed', () => {
    const html = questions([])
    expect(html).toContain(questionsText.none)
    expect(html).not.toContain(questionsText.noneTrimmed)
  })

  it('some questions left say so too', () => {
    expect(questions(one, true)).toContain(proposal.claimsTrimmed)
    expect(questions(one)).not.toContain(proposal.claimsTrimmed)
  })

  it('an opinion that lost a part says so, even with no caution left', () => {
    const opinion = { recommendedLabel: 'Cocina', why: 'Es el más equilibrado.', cautions: [] }
    expect(renderToStaticMarkup(<OpinionCard opinion={opinion} trimmed />)).toContain(niches.opinion.trimmed)
    expect(renderToStaticMarkup(<OpinionCard opinion={opinion} />)).not.toContain(niches.opinion.trimmed)
  })
})
