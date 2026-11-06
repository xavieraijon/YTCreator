import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, TextArea } from '@ytcreator/ui'
import { useState } from 'react'
import { channelEs } from '../../../strings/channel.es.ts'
import styles from '../channel.module.css'

const text = channelEs.interests
const MIN = 10
const MAX = 1000

export function interestsError(value: string): string | undefined {
  const length = value.trim().length
  if (length < MIN) return text.tooShort
  return length > MAX ? text.tooLong : undefined
}

export interface InterestsProps {
  readonly initial?: string
  readonly busy?: boolean
  readonly onNext: (interests: string) => void
}

export function InterestsView({ initial = '', busy = false, onNext }: InterestsProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | undefined>()
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const problem = interestsError(value)
        setError(problem)
        if (!problem) onNext(value.trim())
      }}
    >
      <p className={styles.why}>{text.why}</p>
      <TextArea
        label={text.label}
        description={text.help}
        rows={5}
        value={value}
        {...(error ? { error } : {})}
        onChange={(event) => {
          setValue(event.target.value)
          // Novice audit 003, minor 8: the error goes as soon as what is written is enough.
          if (error && !interestsError(event.target.value)) setError(undefined)
        }}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {text.next}
        </Button>
      </div>
    </form>
  )
}

export function Interests({
  view,
  busy,
  onStep,
}: {
  view: JourneyFullView
  busy: boolean
  onStep: (data: object) => void
}) {
  return (
    <InterestsView
      {...(view.state.interests ? { initial: view.state.interests } : {})}
      busy={busy}
      onNext={(interests) => onStep({ interests })}
    />
  )
}
