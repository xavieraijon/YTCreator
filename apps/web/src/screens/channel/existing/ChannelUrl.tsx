import type { JourneyFullView } from '@ytcreator/core/api'
import { Button, ErrorMessage, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import { ApiClientError, channelApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText, needsSettings } from '../../../shell/errorText.ts'
import { youtubeFailureActionsEs } from '../../../strings/youtube-failures.es.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'

const text = channelEs.existing.url

export const notFoundText = text.notFound

export interface ChannelUrlViewProps {
  readonly value: string
  readonly fieldError?: string
  readonly failure?: string
  /** The failure may be settled in the settings: it takes there, besides asking again. */
  readonly onSettings?: () => void
  readonly busy?: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
}

export function ChannelUrlView({
  value,
  fieldError,
  failure,
  onSettings,
  busy = false,
  onChange,
  onSubmit,
}: ChannelUrlViewProps) {
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <p className={styles.why}>{text.why}</p>
      {failure && <ErrorMessage live title={failure} action={{ label: es.app.retry, onClick: onSubmit }} />}
      {failure && onSettings && (
        <div className={styles.actions}>
          <Button type="button" onClick={onSettings}>
            {youtubeFailureActionsEs.ir_a_ajustes}
          </Button>
        </div>
      )}
      <TextField
        label={text.label}
        description={text.help}
        maxLength={500}
        value={value}
        {...(fieldError ? { error: fieldError } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {text.search}
        </Button>
      </div>
    </form>
  )
}

export interface ChannelUrlProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly onStep: (data: object) => void
}

// The link of the channel, its @ or the link of a video: the server tells which channel it is (FR-019).
export function ChannelUrl({ view, busy, onStep }: ChannelUrlProps) {
  const [value, setValue] = useState(view.state.channelInput ?? '')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [failure, setFailure] = useState<string | undefined>()
  const [toSettings, setToSettings] = useState(false)
  const [searching, setSearching] = useState(false)

  const search = async () => {
    const input = value.trim()
    setFailure(undefined)
    if (!input) {
      setFieldError(text.empty)
      return
    }
    setFieldError(undefined)
    setSearching(true)
    try {
      await channelApi.resolve(view.id, input)
      onStep({ channelInput: input })
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.body?.code === 'no_encontrado') setFieldError(notFoundText)
      else {
        setFailure(errorText(caught))
        setToSettings(needsSettings(caught))
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <ChannelUrlView
      value={value}
      busy={searching || busy}
      {...(fieldError ? { fieldError } : {})}
      {...(failure ? { failure } : {})}
      {...(toSettings ? { onSettings: () => navigate({ page: 'settings' }) } : {})}
      onChange={setValue}
      onSubmit={() => void search()}
    />
  )
}
