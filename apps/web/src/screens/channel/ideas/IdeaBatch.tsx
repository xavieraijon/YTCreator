import { IDEA_LIMITS } from '@ytcreator/core'
import type { AiRunFailure, EstimateView, IdeaBatchView } from '@ytcreator/core/api'
import { Button, Card, DataSource, format, TextArea } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { channelEs } from '../../../strings/channel.es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'

const text = ideasEs.batch

export interface IdeaBatchProps {
  readonly batch: IdeaBatchView
  /** With `otro_enfoque`: the title of the idea the angles came from, if it is still in the bank. */
  readonly sourceTitle?: string | null
  /** Inside the card of its idea (headings one level down), or on its own under the list. */
  readonly nested?: boolean
  readonly estimate: EstimateView | null
  readonly failure: AiRunFailure | null
  readonly busy: boolean
  readonly deciding: boolean
  readonly onDecide: (keep: number[], discard: number[]) => void
  /** «Proponer otras»; the angles are asked for again from their idea, so they have none. */
  readonly onAgain?: (instructions: string) => void
}

export const repeatsText = (removed: number) =>
  removed === 1 ? text.repeatsOne : format(text.repeats, { n: String(removed) })

// The batch the AI proposed: each candidate is kept or left on its own (contracts/ui-screens.md, «Tanda propuesta»).
export function IdeaBatch({
  batch,
  sourceTitle = null,
  nested = false,
  estimate,
  failure,
  busy,
  deciding,
  onDecide,
  onAgain,
}: IdeaBatchProps) {
  const isAngles = batch.kind === 'otro_enfoque'
  const region = isAngles
    ? sourceTitle
      ? format(text.anglesRegion, { titulo: sourceTitle })
      : text.anglesRegionUnknown
    : text.region
  const [instructions, setInstructions] = useState('')
  const pending = batch.candidates.filter((candidate) => candidate.decision === null).map((c) => c.index)
  // The button pressed goes away with the decision: the focus moves to what replaced it, so it is not lost.
  const decidedRef = useRef<number | null>(null)
  const statusRefs = useRef(new Map<number, HTMLParagraphElement>())
  useEffect(() => {
    const index = decidedRef.current
    if (index === null || batch.candidates[index]?.decision == null) return
    statusRefs.current.get(index)?.focus()
    decidedRef.current = null
  }, [batch])
  const decideOne = (index: number, keep: boolean) => {
    decidedRef.current = index
    onDecide(keep ? [index] : [], keep ? [] : [index])
  }

  return (
    <section className={styles.option} aria-label={region}>
      {!isAngles ? <h2>{region}</h2> : nested ? <h4>{region}</h4> : <h3>{region}</h3>}
      <p className={styles.why}>{isAngles ? text.anglesWhy : text.why}</p>
      {batch.removedRepeats > 0 && (
        <p className={styles.notice} role="status">
          {repeatsText(batch.removedRepeats)}
        </p>
      )}
      {batch.claimsTrimmed && <p className={styles.notice}>{channelEs.proposal.claimsTrimmed}</p>}
      <ul className={styles.options}>
        {batch.candidates.map((candidate) => (
          <Card as="li" key={candidate.index} className={styles.option}>
            {!isAngles ? <h3>{candidate.title}</h3> : nested ? <h5>{candidate.title}</h5> : <h4>{candidate.title}</h4>}
            <p>{candidate.hook}</p>
            <p>{format(text.details, { pilar: candidate.pillar, formato: ideasEs.format[candidate.format] })}</p>
            {candidate.why && <p>{format(isAngles ? text.opinion : text.whyText, { texto: candidate.why })}</p>}
            {candidate.decision === null ? (
              <div className={styles.actions}>
                <Button
                  disabled={deciding}
                  aria-label={format(text.keepNamed, { titulo: candidate.title })}
                  onClick={() => decideOne(candidate.index, true)}
                >
                  {text.keep}
                </Button>
                <Button
                  variant="ghost"
                  disabled={deciding}
                  aria-label={format(text.discardNamed, { titulo: candidate.title })}
                  onClick={() => decideOne(candidate.index, false)}
                >
                  {text.discard}
                </Button>
              </div>
            ) : (
              <p
                tabIndex={-1}
                ref={(element) => {
                  if (element) statusRefs.current.set(candidate.index, element)
                  else statusRefs.current.delete(candidate.index)
                }}
              >
                {candidate.decision === 'quedada' ? text.kept : text.discarded}
              </p>
            )}
          </Card>
        ))}
      </ul>
      <DataSource kind="ia" />
      {pending.length > 0 && (
        <div className={styles.actions}>
          <Button
            variant={isAngles ? 'secondary' : 'primary'}
            disabled={deciding}
            {...(isAngles ? { 'aria-label': `${text.keepAll}: ${region}` } : {})}
            onClick={() => onDecide(pending, [])}
          >
            {text.keepAll}
          </Button>
        </div>
      )}
      {onAgain &&
        (isAngles ? (
          // The angles are asked for again from their idea, with their instructions and their cost there.
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={deciding || busy}
              aria-label={format(text.anglesAgainNamed, { titulo: sourceTitle ?? '' })}
              onClick={() => onAgain('')}
            >
              {text.anglesAgain}
            </Button>
          </div>
        ) : (
          <>
            <TextArea
              label={text.instructions}
              description={text.instructionsHelp}
              optional
              maxLength={IDEA_LIMITS.instructions}
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
            <AiAction
              label={text.again}
              estimate={estimate}
              failure={failure}
              busy={busy}
              primary={false}
              disabled={deciding}
              onRun={() => onAgain(instructions)}
            />
          </>
        ))}
    </section>
  )
}
