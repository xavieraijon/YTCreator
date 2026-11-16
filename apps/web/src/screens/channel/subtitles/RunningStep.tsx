import type { SubtitlesView } from '@ytcreator/core/api'
import { Button, Dialog, ErrorMessage, format, ProgressBar } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { subtitlesApi, watchJob } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.running

// 2. Listening (contracts/ui-screens.md): the progress, that the creator may leave, and «Parar» with a confirmation.
// The job lives in the server: on coming back the view brings where it is.
export function RunningStep({
  view,
  onChanged,
}: {
  readonly view: SubtitlesView & { job: NonNullable<SubtitlesView['job']> }
  readonly onChanged: () => Promise<void>
}) {
  const { job } = view
  const [progress, setProgress] = useState(job.progress)
  const [queued, setQueued] = useState(job.status === 'en_cola')
  const [asking, setAsking] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    return watchJob(job.id, (event) => {
      if (event.type === 'progress') {
        setQueued(false)
        setProgress({ done: event.done, total: event.total })
      }
      if (event.type === 'done' || event.type === 'failed') void onChanged()
    })
  }, [job.id, onChanged])

  const stop = async () => {
    setStopping(true)
    setError(null)
    try {
      await subtitlesApi.cancel(view.scriptId)
      setAsking(false)
      await onChanged()
    } catch (cause) {
      setError(cause)
    } finally {
      setStopping(false)
    }
  }

  const percent = progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : 0
  const label = queued ? text.queued : percent === 0 ? text.preparing : format(text.listening, { porcentaje: percent })

  return (
    <section aria-label={text.label}>
      {/* The bar says each step; the status line only says what changes in kind, so it is not read out every time. */}
      <p role="status">{queued ? text.queued : text.label}</p>
      {!queued && <ProgressBar label={label} value={percent} />}
      <p className={styles.why}>{text.leave}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setAsking(true)}>
          {text.stop}
        </Button>
      </div>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void stop() }} />
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={text.stopTitle}
        description={text.stopBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {text.stopKeep}
            </Button>
            <Button variant="danger" loading={stopping} onClick={() => void stop()}>
              {text.stopConfirm}
            </Button>
          </>
        }
      />
    </section>
  )
}
