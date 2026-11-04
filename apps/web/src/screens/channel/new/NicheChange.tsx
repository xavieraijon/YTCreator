import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, Dialog } from '@ytcreator/ui'
import { channelEs } from '../../../strings/channel.es.ts'
import { latestOf } from '../useJourney.ts'

const text = channelEs.nicheChange

// FR-025: the server asks for this confirmation when going back to the niches with a concept approved.
export function needsNicheConfirm(view: JourneyFullView, target: string): boolean {
  return target === 'nichos' && latestOf(view, 'conceptos')?.status === 'aprobada' && !view.state.conceptNeedsReview
}

export interface NicheChangeProps {
  readonly open: boolean
  readonly busy?: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function NicheChange({ open, busy = false, onCancel, onConfirm }: NicheChangeProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={text.title}
      description={text.body}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>{text.cancel}</Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            {text.confirm}
          </Button>
        </>
      }
    />
  )
}
