import { PROFILE_PARTS, type ProfilePart } from '@ytcreator/core'
import type { AiRunFailure, EstimateView, ProfileRegeneration } from '@ytcreator/core/api'
import { Button, DataSource, RadioGroup, TextArea } from '@ytcreator/ui'
import { useState } from 'react'
import { channelEs } from '../../../strings/channel.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'

const text = channelEs.profile.rewrite

export interface RewritePartProps {
  readonly part: ProfilePart
  readonly estimate: EstimateView | null
  readonly failure: AiRunFailure | null
  readonly busy: boolean
  readonly proposal: ProfileRegeneration | null
  readonly saving: boolean
  /** A new measure is being saved: nothing is saved over it, nor asked for on what it replaces. */
  readonly locked?: boolean
  /** The last proposal could not be saved any more: it has to be asked for again. */
  readonly expired?: boolean
  /** The profile changed after the proposal was made: it can be edited or left, not saved as it is. */
  readonly outdated?: boolean
  readonly onPart: (part: ProfilePart) => void
  readonly onAsk: (instructions: string) => void
  readonly onApprove: () => void
  readonly onEdit: () => void
  readonly onDiscard: () => void
  readonly onClose: () => void
}

// Entry 115: the AI proposes one part again; the creator sees it and saves it as a new version, or leaves it (principle II).
export function RewritePart({
  part,
  estimate,
  failure,
  busy,
  proposal,
  saving,
  locked = false,
  expired = false,
  outdated = false,
  onPart,
  onAsk,
  onApprove,
  onEdit,
  onDiscard,
  onClose,
}: RewritePartProps) {
  const [instructions, setInstructions] = useState('')

  return (
    <section className={styles.option}>
      <h2>{text.title}</h2>
      <p className={styles.why}>{text.why}</p>
      {proposal ? (
        <div className={styles.proposal}>
          <h3>{text.proposed[proposal.part]}</h3>
          {proposal.proposed.promise !== undefined && <p>{proposal.proposed.promise}</p>}
          {proposal.proposed.pillars && (
            <ul>
              {proposal.proposed.pillars.map((pillar, index) => (
                <li key={index}>
                  <strong>{pillar.title}</strong>: {pillar.description}
                </li>
              ))}
            </ul>
          )}
          {proposal.proposed.audienceDescription !== undefined && <p>{proposal.proposed.audienceDescription}</p>}
          <DataSource kind="ia" />
          {proposal.claimsTrimmed && <p className={styles.notice}>{channelEs.proposal.claimsTrimmed}</p>}
          {outdated && (
            <p className={styles.notice} role="status">
              {text.outdated}
            </p>
          )}
          <div className={styles.actions}>
            {/* The page keeps one main action, the download (contracts/ui-screens.md). */}
            <Button loading={saving} disabled={locked || outdated} onClick={onApprove}>
              {text.approve}
            </Button>
            <Button disabled={saving || locked} onClick={onEdit}>
              {text.edit}
            </Button>
            <Button disabled={saving} onClick={onDiscard}>
              {text.discard}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {expired && (
            <p className={styles.notice} role="status">
              {text.expired}
            </p>
          )}
          <RadioGroup
            label={text.part}
            value={part}
            options={PROFILE_PARTS.map((value) => ({ value, label: text.parts[value] }))}
            onValueChange={(value) => onPart(value as ProfilePart)}
          />
          <TextArea
            label={channelEs.proposal.whatToChange}
            description={channelEs.proposal.whatToChangeHelp}
            optional
            maxLength={500}
            rows={2}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <AiAction
            label={text.ask}
            estimate={estimate}
            failure={failure}
            busy={busy}
            primary={false}
            disabled={locked}
            onRun={() => onAsk(instructions)}
          />
          <div className={styles.actions}>
            <Button disabled={busy} onClick={onClose}>
              {text.close}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
