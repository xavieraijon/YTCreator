import type { ChannelOrigin, JourneyStep } from '@ytcreator/core'
import { navigate } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { channelEs } from '../../strings/channel.es.ts'
import styles from './channel.module.css'
import { StepIndicator } from './StepIndicator.tsx'

// The step screens arrive with each story; until then, every route of a journey says where it is and goes back.
export function ChannelStep({ kind, step }: { kind: ChannelOrigin; step: JourneyStep }) {
  return (
    <Screen
      title={channelEs.steps[step]}
      before={
        <StepIndicator kind={kind} step={step} onBack={(back) => navigate({ page: 'channelStep', kind, step: back })} />
      }
    >
      <p className={styles.why}>{channelEs.stepSoon}</p>
    </Screen>
  )
}
