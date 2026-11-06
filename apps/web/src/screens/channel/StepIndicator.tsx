import { type ChannelOrigin, type JourneyStep, stepsOf } from '@ytcreator/core'
import { Button, Stepper } from '@ytcreator/ui'
import { channelEs } from '../../strings/channel.es.ts'
import styles from './channel.module.css'

export interface StepIndicatorProps {
  readonly kind: ChannelOrigin
  readonly step: JourneyStep
  /** Goes to the step before; a step later approved is kept (FR-002). */
  readonly onBack: (step: JourneyStep) => void
}

// Where the creator is in either journey, and the way back.
export function StepIndicator({ kind, step, onBack }: StepIndicatorProps) {
  const all = stepsOf(kind)
  const steps = all.filter((id) => id !== 'hecho').map((id) => ({ id, label: channelEs.steps[id] }))
  const index = all.indexOf(step)
  const previous = index > 0 ? all[index - 1] : undefined
  return (
    <div className={styles.indicator}>
      <Stepper steps={steps} current={Math.min(index + 1, steps.length)} />
      {previous && step !== 'hecho' && <Button onClick={() => onBack(previous)}>{channelEs.back}</Button>}
    </div>
  )
}
