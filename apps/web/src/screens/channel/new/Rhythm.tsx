import { AUDIENCE_REGIONS, ON_CAMERA, type OnCamera } from '@ytcreator/core'
import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, RadioGroup, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import { channelEs } from '../../../strings/channel.es.ts'
import styles from '../channel.module.css'

const text = channelEs.rhythm
type Region = (typeof AUDIENCE_REGIONS)[number]

export interface RhythmAnswer {
  hoursPerWeek: number
  onCamera: OnCamera
  audienceRegion: Region
}

export function parseHours(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null
  const hours = Number(value)
  return hours >= 1 && hours <= 60 ? hours : null
}

export interface RhythmViewProps {
  readonly initial?: {
    hoursPerWeek?: number | undefined
    onCamera?: OnCamera | undefined
    audienceRegion?: Region | undefined
  }
  readonly busy?: boolean
  readonly onNext: (answer: RhythmAnswer) => void
}

export function RhythmView({ initial = {}, busy = false, onNext }: RhythmViewProps) {
  const [hours, setHours] = useState(initial.hoursPerWeek?.toString() ?? '')
  const [onCamera, setOnCamera] = useState<OnCamera | undefined>(initial.onCamera)
  const [region, setRegion] = useState<Region>(initial.audienceRegion ?? 'espana')
  const [checked, setChecked] = useState(false)
  const parsed = parseHours(hours)
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setChecked(true)
        if (parsed !== null && onCamera) onNext({ hoursPerWeek: parsed, onCamera, audienceRegion: region })
      }}
    >
      <p className={styles.why}>{text.why}</p>
      <TextField
        label={text.hours}
        description={text.hoursHelp}
        inputMode="numeric"
        value={hours}
        {...(checked && parsed === null ? { error: text.hoursInvalid } : {})}
        onChange={(event) => setHours(event.target.value)}
      />
      <RadioGroup
        label={text.onCamera}
        {...(onCamera ? { value: onCamera } : {})}
        {...(checked && !onCamera ? { error: text.choiceMissing } : {})}
        options={ON_CAMERA.map((value) => ({ value, label: text.onCameraOptions[value] }))}
        onValueChange={(value) => setOnCamera(value as OnCamera)}
      />
      <RadioGroup
        label={text.region}
        value={region}
        options={AUDIENCE_REGIONS.map((value) => ({ value, label: text.regionOptions[value] }))}
        onValueChange={(value) => setRegion(value as Region)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {text.next}
        </Button>
      </div>
    </form>
  )
}

export function Rhythm({
  view,
  busy,
  onStep,
}: {
  view: JourneyFullView
  busy: boolean
  onStep: (data: object) => void
}) {
  const { hoursPerWeek, onCamera, audienceRegion } = view.state
  return <RhythmView initial={{ hoursPerWeek, onCamera, audienceRegion }} busy={busy} onNext={onStep} />
}
