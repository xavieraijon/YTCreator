import { type ChannelOrigin, type JourneyStep, stepsOf } from '@ytcreator/core'
import { ErrorMessage } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { channelApi } from '../../api/client.ts'
import { navigate } from '../../router.ts'
import { errorText } from '../../shell/errorText.ts'
import { Screen } from '../../shell/Screen.tsx'
import { channelEs } from '../../strings/channel.es.ts'
import { es } from '../../strings/es.ts'
import styles from './channel.module.css'
import { Interests } from './new/Interests.tsx'
import { Niches } from './new/Niches.tsx'
import { Questions } from './new/Questions.tsx'
import { Rhythm } from './new/Rhythm.tsx'
import { StepIndicator } from './StepIndicator.tsx'
import { useJourneyView } from './useJourney.ts'

const TITLES: Partial<Record<JourneyStep, string>> = {
  intereses: channelEs.interests.title,
  preguntas: channelEs.questions.title,
  nichos: channelEs.niches.title,
  ritmo: channelEs.rhythm.title,
}

// The step comes from the server, so the address and a reload can never skip one (FR-002).
export function ChannelStep({ kind, step }: { kind: ChannelOrigin; step: JourneyStep }) {
  const { view, noChannel, error, reload } = useJourneyView()
  const [busy, setBusy] = useState(false)
  const [stepError, setStepError] = useState<unknown>(null)

  useEffect(() => {
    if (noChannel) navigate({ page: 'channelStart' })
    else if (view && (view.kind !== kind || view.step !== step)) {
      navigate({ page: 'channelStep', kind: view.kind, step: view.step })
    }
  }, [noChannel, view, kind, step])

  const moveTo = async (target: JourneyStep, data?: object) => {
    if (!view) return
    setBusy(true)
    setStepError(null)
    try {
      await channelApi.step(view.id, {
        revision: view.revision,
        step: target,
        ...(data ? { data } : {}),
      })
      // The address follows the view: moving it first would send the creator back to the old step.
      await reload()
    } catch (caught) {
      setStepError(caught)
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    const steps = stepsOf(kind)
    return steps[steps.indexOf(step) + 1] ?? step
  }
  const onStep = (data: object) => void moveTo(next(), data)
  const failed = error ?? stepError
  const ready = view?.step === step && view.kind === kind ? view : null

  return (
    <Screen
      title={TITLES[step] ?? channelEs.steps[step]}
      before={<StepIndicator kind={kind} step={step} onBack={(back) => void moveTo(back)} />}
    >
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void reload() }} />
      )}
      {!ready && failed === null && <p className={styles.why}>{es.app.loading}</p>}
      {ready && step === 'intereses' && <Interests view={ready} busy={busy} onStep={onStep} />}
      {ready && step === 'preguntas' && <Questions view={ready} busy={busy} reload={reload} onStep={onStep} />}
      {ready && step === 'nichos' && <Niches view={ready} busy={busy} reload={reload} onStep={onStep} />}
      {ready && step === 'ritmo' && <Rhythm view={ready} busy={busy} onStep={onStep} />}
      {ready && !TITLES[step] && <p className={styles.why}>{channelEs.stepSoon}</p>}
    </Screen>
  )
}
