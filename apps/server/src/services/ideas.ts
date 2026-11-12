import type { ChannelProfile, Idea, IdeaDraft } from '@ytcreator/core'
import type { IdeaBatchView, IdeaMeasureView, IdeaView } from '@ytcreator/core/api'
import { type IdeaBatch, candidatesOf } from '../db/repos/idea-batches.ts'
import type { IdeaMeasure } from '../db/repos/idea-measures.ts'

const DAY_MS = 86_400_000

export const measureView = (measure: IdeaMeasure): IdeaMeasureView => ({
  id: measure.id,
  ideaRevision: measure.ideaRevision,
  status: measure.status,
  verdict: measure.verdict,
  reason: measure.reason as IdeaMeasureView['reason'],
  figures: measure.figures as IdeaMeasureView['figures'],
  similarVideos: measure.similarVideos,
  opportunity: measure.opportunity as IdeaMeasureView['opportunity'],
  queries: measure.queries,
  failure: measure.failure as IdeaMeasureView['failure'],
  source: measure.source,
  partial: measure.partial,
  thresholdsVersion: measure.thresholdsVersion,
  measuredAt: measure.measuredAt,
})

// What the bank shows of an idea: its last measure and the warnings of FR-010, R11 and R15.
export function ideaView(
  idea: Idea,
  measure: IdeaMeasure | null,
  {
    profileVersion,
    staleDays,
    now,
    scriptOf,
  }: {
    profileVersion: number
    staleDays: number
    now: Date
    scriptOf?: (ideaId: string) => IdeaView['script']
  },
): IdeaView {
  return {
    id: idea.id,
    script: scriptOf?.(idea.id) ?? null,
    origin: idea.origin,
    batchId: idea.batchId,
    sourceIdeaId: idea.sourceIdeaId,
    title: idea.title,
    hook: idea.hook,
    pillar: idea.pillar,
    format: idea.format,
    notes: idea.notes,
    query: idea.query,
    broadQuery: idea.broadQuery,
    queryEn: idea.queryEn,
    status: idea.status,
    position: idea.position,
    queuePosition: idea.queuePosition,
    revision: idea.revision,
    profileVersion: idea.profileVersion,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
    measure: measure ? measureView(measure) : null,
    // A failed measure says nothing about the idea: it is not old, nor of an older version.
    stale: measure?.status === 'medida' && now.getTime() - Date.parse(measure.measuredAt) > staleDays * DAY_MS,
    // Only what the AI proposed is written for a profile; the creator's own ideas are theirs whatever it says.
    fromOlderProfile: idea.origin !== 'creador' && idea.profileVersion < profileVersion,
    measuredOlderRevision: measure?.status === 'medida' && measure.ideaRevision < idea.revision,
  }
}

// Each candidate with its index and what the creator decided (null while pending).
export function batchView(batch: IdeaBatch): IdeaBatchView {
  return {
    id: batch.id,
    kind: batch.kind,
    sourceIdeaId: batch.sourceIdeaId,
    candidates: candidatesOf(batch).map((candidate, index) => ({
      ...(candidate as IdeaBatchView['candidates'][number]),
      index,
      decision: batch.decisions[index] ?? null,
    })),
    removedRepeats: batch.removedRepeats,
    claimsTrimmed: batch.claimsTrimmed,
    createdAt: batch.createdAt,
  }
}

// What the idea uses get of the profile (contracts/ai-uses.md): the words, never the money or the figures.
export function profileInput(profile: ChannelProfile) {
  const { concept } = profile
  return {
    niche: { label: profile.niche.label, summary: profile.niche.summary },
    promise: concept.promise,
    pillars: concept.pillars.map((pillar) => pillar.title),
    audience: concept.audience.description,
    format: concept.format,
    rhythm: { longPerWeek: concept.cadence.longPerWeek, shortsPerWeek: concept.cadence.shortsPerWeek },
  }
}

export const AVOID_LIMIT = 200

// What the AI must not repeat (R9): the ideas of the bank and the archive, the discarded candidates and those still
// waiting (asking for another batch discards them), newest first. `all` is for the server's own filter, with no cap;
// `forAi` is the newest 200, which is what goes in the prompt.
export function avoidList(ideas: readonly Idea[], batches: readonly IdeaBatch[]) {
  const fromBatches = batches.flatMap((batch) =>
    (candidatesOf(batch) as IdeaDraft[])
      .filter((_, index) => batch.decisions[index] !== 'quedada')
      .map((draft) => ({ title: draft.title, query: draft.query ?? null, at: batch.createdAt })),
  )
  const fromIdeas = ideas.map((idea) => ({ title: idea.title, query: idea.query ?? null, at: idea.createdAt }))
  const all = [...fromIdeas, ...fromBatches]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map(({ title, query }) => ({ title, query }))
  return { all, forAi: all.slice(0, AVOID_LIMIT) }
}
