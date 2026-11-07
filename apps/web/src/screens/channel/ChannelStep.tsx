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
import { ChannelUrl } from './existing/ChannelUrl.tsx'
import { Confirm } from './existing/Confirm.tsx'
import { Positioning } from './existing/Positioning.tsx'
import { Reading } from './existing/Reading.tsx'
import { Concepts } from './new/Concepts.tsx'
import { Interests } from './new/Interests.tsx'
import { Names } from './new/Names.tsx'
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
  conceptos: channelEs.concepts.title,
  nombres: channelEs.names.title,
  enlace: channelEs.existing.url.title,
  confirmar: channelEs.existing.confirm.title,
  lectura: channelEs.existing.reading.title,
  posicionamiento: channelEs.existing.positioning.title,
}

// The step comes from the server, so the address and a reload can never skip one (FR-002).
export function ChannelStep({ kind, step }: { kind: ChannelOrigin; step: JourneyStep }) {
  const { view, noChannel, error, reload } = useJourneyView()
  const [busy, setBusy] = useState(false)
  const [stepError, setStepError] = useState<unknown>(null)

  useEffect(() => {
    // The end of the journey is the channel's own screen, with the next step.
    if (noChannel || view?.step === 'hecho') navigate({ page: 'channelStart' })
    else if (view && (view.kind !== kind || view.step !== step)) {
      navigate({ page: 'channelStep', kind: view.kind, step: view.step })
    }
  }, [noChannel, view, kind, step])

  const moveTo = async (target: JourneyStep, { data, nameLater }: { data?: object; nameLater?: boolean } = {}) => {
    if (!view) return
    setBusy(true)
    setStepError(null)
    try {
      await channelApi.step(view.id, {
        revision: view.revision,
        step: target,
        ...(data ? { data } : {}),
        ...(nameLater ? { nameLater } : {}),
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
  const onStep = (data: object) => void moveTo(next(), { data })
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
      {ready && step === 'conceptos' && <Concepts view={ready} busy={busy} reload={reload} onStep={onStep} />}
      {ready && step === 'nombres' && (
        <Names view={ready} busy={busy} reload={reload} onFinish={(nameLater) => void moveTo('hecho', { nameLater })} />
      )}
      {ready && step === 'enlace' && <ChannelUrl view={ready} busy={busy} onStep={onStep} />}
      {ready && step === 'confirmar' && (
        <Confirm view={ready} busy={busy} reload={reload} onReject={() => void moveTo('enlace')} />
      )}
      {ready && step === 'lectura' && <Reading view={ready} busy={busy} reload={reload} onStep={onStep} />}
      {ready && step === 'posicionamiento' && <Positioning view={ready} busy={busy} reload={reload} onStep={onStep} />}
      {ready && !TITLES[step] && <p className={styles.why}>{channelEs.stepSoon}</p>}
    </Screen>
  )
}
