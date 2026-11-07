import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, Dialog } from '@ytcreator/ui'
import { channelEs } from '../../../strings/channel.es.ts'
import { latestOf, payloadOf } from '../useJourney.ts'

const text = channelEs.nicheChange

// The niche chosen in the batch in use, if one is.
function chosenNiche(view: JourneyFullView): string | null {
  const niches = latestOf(view, 'nichos')
  if (niches?.status !== 'aprobada' || niches.selectedIndex === null) return null
  return payloadOf<{ niches: { label: string }[] }>(niches).niches[niches.selectedIndex]?.label ?? null
}

// FR-025 and P4: looking at the niches again asks nothing; choosing another one than the concept's does.
export function needsNicheConfirm(view: JourneyFullView, label: string): boolean {
  if (latestOf(view, 'conceptos')?.status !== 'aprobada' || view.state.conceptNeedsReview) return false
  const base = view.state.conceptNiche ?? chosenNiche(view)
  return base !== null && base !== label
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
