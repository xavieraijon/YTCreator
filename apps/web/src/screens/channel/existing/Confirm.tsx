import type { JourneyFullView, ResolvedChannel } from '@ytcreator/core/api'
import { Button, Card, DataSource, ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText, needsSettings } from '../../../shell/errorText.ts'
import { youtubeFailureActionsEs } from '../../../strings/youtube-failures.es.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'

const text = channelEs.existing.confirm
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)

export interface ConfirmViewProps {
  readonly channel: ResolvedChannel
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onReject: () => void
}

// The image, the name, the @ and the subscribers, to be sure before reading anything (US4 AS1).
export function ConfirmView({ channel, busy = false, onConfirm, onReject }: ConfirmViewProps) {
  return (
    <div className={styles.options}>
      <p className={styles.why}>{text.why}</p>
      <Card as="article" className={styles.found} aria-label={channel.title}>
        {channel.thumbnailUrl && (
          <img
            className={styles.avatar}
            src={channel.thumbnailUrl}
            alt={format(text.image, { canal: channel.title })}
            referrerPolicy="no-referrer"
          />
        )}
        <div className={styles['indicator-row']}>
          <h2>{channel.title}</h2>
          <p>{channel.handle ? format(channelEs.names.handle, { arroba: channel.handle }) : text.noHandle}</p>
          <p>
            {channel.subscribers === null
              ? channelEs.references.hiddenSubscribers
              : format(channelEs.references.subscribers, { cifra: number(channel.subscribers) })}
          </p>
          <DataSource kind="youtube" date={channel.fetchedAt} />
        </div>
      </Card>
      <div className={styles.actions}>
        <Button variant="primary" loading={busy} onClick={onConfirm}>
          {text.yes}
        </Button>
        <Button disabled={busy} onClick={onReject}>
          {text.no}
        </Button>
      </div>
    </div>
  )
}

export interface ConfirmProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onReject: () => void
}

export function Confirm({ view, busy, reload, onReject }: ConfirmProps) {
  const input = view.state.channelInput ?? ''
  const [channel, setChannel] = useState<ResolvedChannel | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reading, setReading] = useState(false)

  const look = useCallback(async () => {
    setError(null)
    try {
      setChannel(await channelApi.resolve(view.id, input))
    } catch (caught) {
      setError(caught)
    }
  }, [view.id, input])

  useEffect(() => {
    void look()
  }, [look])

  const confirm = async () => {
    setReading(true)
    setError(null)
    try {
      await channelApi.read(view.id, { revision: view.revision, input })
      await reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setReading(false)
    }
  }

  return (
    <div className={styles.options}>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          action={{ label: es.app.retry, onClick: () => void reload().then(look) }}
        />
      )}
      {needsSettings(error) && (
        <div className={styles.actions}>
          <Button onClick={() => navigate({ page: 'youtubeSettings' })}>{youtubeFailureActionsEs.ir_a_ajustes}</Button>
        </div>
      )}
      {channel ? (
        <ConfirmView channel={channel} busy={reading || busy} onConfirm={() => void confirm()} onReject={onReject} />
      ) : (
        error === null && <p className={styles.why}>{es.app.loading}</p>
      )}
      {!channel && error !== null && <Button onClick={onReject}>{text.no}</Button>}
    </div>
  )
}
