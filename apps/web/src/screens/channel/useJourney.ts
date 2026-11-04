import type { ChannelUse } from '@ytcreator/core'
import type { AiRunFailure, EstimateView, JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { useCallback, useEffect, useState } from 'react'
import { channelApi } from '../../api/client.ts'

export function useJourneyView() {
  const [view, setView] = useState<JourneyFullView | null>(null)
  const [noChannel, setNoChannel] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const current = await channelApi.current()
      if (!current.channel || !current.journey) {
        setNoChannel(true)
        return null
      }
      const next = await channelApi.journey(current.journey.id)
      setView(next)
      return next
    } catch (caught) {
      setError(caught)
      return null
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { view, noChannel, error, reload }
}

export const latestOf = (view: JourneyFullView, kind: ProposalView['kind']): ProposalView | null =>
  view.proposals.filter((proposal) => proposal.kind === kind).at(-1) ?? null

export const payloadOf = <T>(proposal: ProposalView): T => (proposal.editedPayload ?? proposal.payload) as T

// What an AI action will cost, asked for before it is shown (FR-029).
export function useEstimate(journeyId: string, use: ChannelUse, enabled = true) {
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  const [error, setError] = useState<unknown>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setEstimate(null)
    try {
      setEstimate(await channelApi.estimate(journeyId, use))
    } catch (caught) {
      setError(caught)
    }
  }, [journeyId, use])

  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  return { estimate, error, refresh }
}

// Runs a use of the AI: it answers with the proposal, or with the code of what failed.
export function useGenerate(view: JourneyFullView, estimate: EstimateView | null, onDone: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<AiRunFailure | null>(null)
  const [error, setError] = useState<unknown>(null)

  const run = async (kind: ProposalView['kind'], extra: { instructions?: string; parentId?: string } = {}) => {
    if (!estimate) return
    setBusy(true)
    setFailure(null)
    setError(null)
    try {
      const outcome = await channelApi.propose(view.id, {
        revision: view.revision,
        kind,
        estimateId: estimate.estimateId,
        ...(extra.instructions ? { instructions: extra.instructions } : {}),
        ...(extra.parentId ? { parentId: extra.parentId } : {}),
      })
      if ('failure' in outcome) setFailure(outcome.failure)
      await onDone()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return { busy, failure, error, run }
}
