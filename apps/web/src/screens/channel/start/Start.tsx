import { type ChannelOrigin, initialStep, type JourneyStep } from '@ytcreator/core'
import { type ChannelCurrent } from '@ytcreator/core/api'
import { Button, ErrorMessage } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { Profile } from '../profile/Profile.tsx'

const text = channelEs.start

export interface StartViewProps {
  readonly current: ChannelCurrent
  readonly busy?: ChannelOrigin | null
  readonly onCreate: (origin: ChannelOrigin) => void
  readonly onResume: (kind: ChannelOrigin, step: JourneyStep) => void
  readonly onChooseName: () => void
}

// What the start says depends only on the channel: no channel, a journey half done, or the channel ready (FR-001).
export function StartView({ current, busy = null, onCreate, onResume, onChooseName }: StartViewProps) {
  if (!current.channel) {
    return (
      <>
        <p className={styles.why}>{text.why}</p>
        <div className={styles.options}>
          <div className={styles.option}>
            <p>{text.createWhy}</p>
            <Button
              variant="primary"
              loading={busy === 'nuevo'}
              disabled={busy !== null}
              onClick={() => onCreate('nuevo')}
            >
              {text.create}
            </Button>
          </div>
          <div className={styles.option}>
            <p>{text.existingWhy}</p>
            <Button loading={busy === 'existente'} disabled={busy !== null} onClick={() => onCreate('existente')}>
              {text.existing}
            </Button>
          </div>
        </div>
      </>
    )
  }

  const { channel, journey } = current
  if (journey?.status === 'activo') {
    return (
      <div className={styles.option}>
        <h2>{text.resumeTitle}</h2>
        <p>{text.resumeWhy}</p>
        <Button variant="primary" onClick={() => onResume(journey.kind, journey.step)}>
          {text.resume}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.options}>
      <div className={styles.option}>
        <h2>{channel.displayName ?? text.readyTitle}</h2>
        <p>{text.nextStep}</p>
      </div>
      {channel.nameStatus === 'provisional' && journey?.kind !== 'existente' && (
        <div className={styles.option}>
          <h2>{text.nameMissing}</h2>
          <p>{text.nameMissingWhy}</p>
          <Button variant="primary" onClick={onChooseName}>
            {text.chooseName}
          </Button>
        </div>
      )}
    </div>
  )
}

export function Start() {
  const [current, setCurrent] = useState<ChannelCurrent | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<ChannelOrigin | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setCurrent(await channelApi.current())
    } catch (caught) {
      setError(caught)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (origin: ChannelOrigin) => {
    setBusy(origin)
    setError(null)
    try {
      await channelApi.create(origin)
      navigate({ page: 'channelStep', kind: origin, step: initialStep(origin) })
    } catch (caught) {
      setError(caught)
      setBusy(null)
    }
  }

  // FR-018b: the journey left at the end with no name opens again at the names.
  const chooseName = async () => {
    const journey = current?.channel ? current.journey : null
    if (!journey) return
    setError(null)
    try {
      await channelApi.step(journey.id, { revision: journey.revision, step: 'nombres' })
      navigate({ page: 'channelStep', kind: 'nuevo', step: 'nombres' })
    } catch (caught) {
      setError(caught)
    }
  }

  return (
    <Screen title={text.title}>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      )}
      {current?.channel && current.profile && current.journey?.status !== 'activo' ? (
        // US5: with the journey done, the channel's own page.
        <Profile
          channel={current.channel}
          journeyId={current.journey?.id ?? null}
          onChooseName={() => void chooseName()}
        />
      ) : current ? (
        <StartView
          current={current}
          busy={busy}
          onCreate={(origin) => void create(origin)}
          onResume={(kind, step) => navigate({ page: 'channelStep', kind, step })}
          onChooseName={() => void chooseName()}
        />
      ) : (
        error === null && <p className={styles.why}>{es.app.loading}</p>
      )}
    </Screen>
  )
}
