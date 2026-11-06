import type { AiRunFailure, EstimateView } from '@ytcreator/core/api'
import { Button, ErrorMessage, format, TextArea } from '@ytcreator/ui'
import { useState, type ReactNode } from 'react'
import { navigate } from '../../router.ts'
import { channelEs } from '../../strings/channel.es.ts'
import { formatEuros } from '../settings/euros.ts'
import styles from './channel.module.css'

const text = channelEs.proposal

// The action says what it will cost, and pressing it is the confirmation (contracts/cost.md, FR-029).
export function costLabel(action: string, estimate: EstimateView | null): string {
  if (!estimate) return action
  const importe = estimate.included
    ? text.included
    : format(text.estimateCost, { importe: formatEuros(estimate.cents) })
  return format(text.actionWithCost, { accion: action, importe })
}

export interface ProposalProps {
  /** The proposal itself: each step draws its own. */
  readonly children: ReactNode
  /** What «Proponer otra» would cost; asked for before it is shown. */
  readonly estimate: EstimateView | null
  readonly failure?: AiRunFailure | null
  readonly claimsTrimmed?: boolean
  readonly busy?: boolean
  /** The step's own name for approving («Elegir este nicho»). */
  readonly approveLabel?: string
  /** A list where each item is chosen on its own has no general approval or editing. */
  readonly onApprove?: () => void
  readonly onEdit?: () => void
  readonly onRegenerate: (instructions: string) => void
}

// Every proposal of the AI can be approved, edited or asked for again (principle II, FR-023).
export function Proposal({
  children,
  estimate,
  failure = null,
  claimsTrimmed = false,
  busy = false,
  approveLabel = text.approve,
  onApprove,
  onEdit,
  onRegenerate,
}: ProposalProps) {
  const [instructions, setInstructions] = useState('')
  const blockedBy = estimate?.blockedBy ?? null
  const toLimits = () => navigate({ page: 'aiSettings' })

  return (
    <div className={styles.proposal}>
      {children}
      {claimsTrimmed && <p className={styles.notice}>{text.claimsTrimmed}</p>}
      {failure === 'limite_de_gasto' ? (
        <ErrorMessage live title={channelEs.aiFailure[failure]} action={{ label: text.goLimits, onClick: toLimits }} />
      ) : (
        failure && (
          <ErrorMessage
            live
            title={channelEs.aiFailure[failure]}
            action={{ label: costLabel(text.retry, estimate), onClick: () => onRegenerate(instructions) }}
          />
        )
      )}
      <TextArea
        label={text.whatToChange}
        description={text.whatToChangeHelp}
        optional
        maxLength={500}
        rows={2}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      {blockedBy && (
        <ErrorMessage title={text.blocked[blockedBy]} action={{ label: text.goLimits, onClick: toLimits }} />
      )}
      <div className={styles.actions}>
        {onApprove && (
          <Button variant="primary" disabled={busy} onClick={onApprove}>
            {approveLabel}
          </Button>
        )}
        {onEdit && (
          <Button disabled={busy} onClick={onEdit}>
            {text.edit}
          </Button>
        )}
        <Button
          disabled={busy || blockedBy !== null || !estimate}
          loading={busy}
          onClick={() => onRegenerate(instructions)}
        >
          {costLabel(text.regenerate, estimate)}
        </Button>
      </div>
    </div>
  )
}

export interface AiActionProps {
  readonly label: string
  readonly estimate: EstimateView | null
  readonly failure?: AiRunFailure | null
  readonly busy?: boolean
  readonly primary?: boolean
  /** Not to be pressed now, for a reason the screen says (as while a measure is being saved). */
  readonly disabled?: boolean
  readonly onRun: () => void
}

// An AI action on its own: the amount on the button, and pressing it is the confirmation (FR-029).
export function AiAction({
  label,
  estimate,
  failure = null,
  busy = false,
  primary = true,
  disabled = false,
  onRun,
}: AiActionProps) {
  const blockedBy = estimate?.blockedBy ?? null
  const toLimits = () => navigate({ page: 'aiSettings' })
  return (
    <div className={styles.proposal}>
      {failure === 'limite_de_gasto' ? (
        <ErrorMessage live title={channelEs.aiFailure[failure]} action={{ label: text.goLimits, onClick: toLimits }} />
      ) : (
        failure && (
          <ErrorMessage
            live
            title={channelEs.aiFailure[failure]}
            action={{ label: costLabel(text.retry, estimate), onClick: onRun }}
          />
        )
      )}
      {blockedBy && (
        <ErrorMessage title={text.blocked[blockedBy]} action={{ label: text.goLimits, onClick: toLimits }} />
      )}
      <div className={styles.actions}>
        <Button
          variant={primary ? 'primary' : 'secondary'}
          loading={busy}
          disabled={busy || disabled || blockedBy !== null || !estimate}
          onClick={onRun}
        >
          {costLabel(label, estimate)}
        </Button>
      </div>
    </div>
  )
}
