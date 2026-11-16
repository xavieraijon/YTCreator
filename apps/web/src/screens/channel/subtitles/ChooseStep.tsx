import type { SpeechEngineView, SubtitlesAudioResult, SubtitlesView } from '@ytcreator/core/api'
import { Button, DataSource, ErrorMessage, format, ProgressBar } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { speechEngineApi, subtitlesApi } from '../../../api/client.ts'
import { extractAudio, type ExtractFailure } from '../../../audio/extract.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { durationText } from '../existing/format.ts'
import { EngineStep } from './EngineStep.tsx'
import { estimateText } from './format.ts'

const text = subtitlesEs.choose

type Stage =
  | { kind: 'idle' }
  | { kind: 'preparing'; name: string; fraction: number }
  | { kind: 'uploading'; name: string }
  | {
      kind: 'ready'
      name: string
      seconds: number
      estimateSeconds: number
      overShort: SubtitlesAudioResult['overShort']
    }
  | { kind: 'failed'; failure: ExtractFailure }

// 1. Choosing the video or the audio (contracts/ui-screens.md): the program that listens first, then the file, taken
// out in the browser and saved; then its length, how long it will take, and «Empezar».
export function ChooseStep({
  view,
  engine,
  onEngineChanged,
  onStarted,
}: {
  readonly view: SubtitlesView
  readonly engine: SpeechEngineView
  readonly onEngineChanged: () => Promise<void>
  readonly onStarted: () => Promise<void>
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  // What failed and what fixes it: choosing the file again, or pressing «Empezar» again.
  const [error, setError] = useState<{ cause: unknown; fix: 'pick' | 'start' | 'download' } | null>(null)
  const [starting, setStarting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const working = useRef<AbortController | null>(null)
  const failedJob = view.job && view.job.op === 'reconocer' && view.job.status !== 'hecho' ? view.job : null
  // A job the server did not finish has no failure of its own: it was stopped before the end (R5).
  const failure = failedJob
    ? (failedJob.failure ?? (failedJob.status === 'interrumpido' ? 'interrumpido' : 'interno'))
    : null
  // The last recognition heard nothing: the creator chooses another file here (spec, «casi sin voz»).
  const heardNothing = view.latest !== null && view.latest.content.cues.length === 0

  useEffect(() => () => working.current?.abort(), [])

  const choose = async (file: File) => {
    working.current?.abort()
    const controller = new AbortController()
    working.current = controller
    setError(null)
    setStage({ kind: 'preparing', name: file.name, fraction: 0 })
    const extracted = await extractAudio(file, {
      signal: controller.signal,
      onProgress: (fraction) => setStage({ kind: 'preparing', name: file.name, fraction }),
    })
    if (controller.signal.aborted) return
    if (!extracted.ok) {
      setStage({ kind: 'failed', failure: extracted.failure })
      return
    }
    setStage({ kind: 'uploading', name: file.name })
    try {
      const saved = await subtitlesApi.uploadAudio(view.scriptId, extracted.wav, file.name, {
        signal: controller.signal,
      })
      setStage({
        kind: 'ready',
        name: file.name,
        seconds: saved.audioSeconds,
        estimateSeconds: saved.estimateSeconds,
        overShort: saved.overShort,
      })
    } catch (cause) {
      if (controller.signal.aborted) return
      setStage({ kind: 'idle' })
      setError({ cause, fix: 'pick' })
    }
  }

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      await subtitlesApi.recognize(view.scriptId)
      await onStarted()
    } catch (cause) {
      setError({ cause, fix: 'start' })
      setStarting(false)
    }
  }

  const download = async () => {
    setError(null)
    try {
      await speechEngineApi.start()
      await onEngineChanged()
    } catch (cause) {
      setError({ cause, fix: 'download' })
    }
  }

  const pick = () => input.current?.click()

  // The button that fixes each failure (contracts/speech-recognizer.md): the program, another file, or again.
  const fixOf = (code: string) =>
    (code === 'sin_motor' || code === 'sin_modelo') && !engine.installed
      ? { label: subtitlesEs.engine.download, onClick: () => void download() }
      : code === 'audio_no_valido'
        ? { label: subtitlesEs.failed.other, onClick: pick }
        : { label: subtitlesEs.failed.again, onClick: () => void start() }
  const pickInError = failure === 'audio_no_valido' && stage.kind === 'idle'

  return (
    <>
      {/* What it needs and that nothing leaves the machine, also before the program is there (AS1, AS2). */}
      <p className={styles.why}>{text.need}</p>
      <p className={styles.why}>{text.local}</p>
      <EngineStep engine={engine} onChanged={onEngineChanged} />
      {heardNothing && !failedJob && stage.kind === 'idle' && <p className={styles.notice}>{text.empty}</p>}
      {failure && stage.kind === 'idle' && (
        <ErrorMessage
          live
          title={subtitlesEs.failed.title}
          description={subtitlesEs.failed.failures[failure] ?? subtitlesEs.failed.failures['interno']}
          action={fixOf(failure)}
        />
      )}
      {engine.installed && (
        <section aria-label={text.pick}>
          <input
            ref={input}
            type="file"
            accept="video/*,audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void choose(file)
            }}
          />
          {stage.kind === 'idle' && !pickInError && (
            <div className={styles.actions}>
              <Button variant="primary" onClick={pick}>
                {text.pick}
              </Button>
            </div>
          )}
          {stage.kind === 'preparing' && <ProgressBar label={text.preparing} value={stage.fraction * 100} />}
          {stage.kind === 'uploading' && <ProgressBar label={text.uploading} />}
          {(stage.kind === 'preparing' || stage.kind === 'uploading') && (
            <p>{format(text.file, { nombre: stage.name })}</p>
          )}
          {stage.kind === 'failed' && (
            <ErrorMessage
              live
              title={text.failureTitle}
              description={text.failures[stage.failure] ?? text.failures['interno']}
              action={{ label: text.other, onClick: pick }}
            />
          )}
          {stage.kind === 'ready' && (
            <>
              <p>{format(text.file, { nombre: stage.name })}</p>
              <p>{format(text.duration, { duracion: durationText(Math.round(stage.seconds)) })}</p>
              <p role="status">{estimateText(stage.estimateSeconds)}</p>
              {/* A Short longer than YouTube takes for one (US4): said before «Empezar», which still works. */}
              {stage.overShort && (
                <>
                  <p role="status" className={styles.notice}>
                    {format(text.shortTooLong, {
                      duracion: durationText(Math.round(stage.seconds)),
                      maximo: durationText(stage.overShort.limitSeconds),
                    })}
                  </p>
                  <DataSource
                    kind="conocimiento"
                    label={scriptEs.review.shortsBasis}
                    date={stage.overShort.reviewedAt}
                  />
                </>
              )}
              <div className={styles.actions}>
                <Button variant="primary" loading={starting} onClick={() => void start()}>
                  {text.start}
                </Button>
                <Button variant="ghost" disabled={starting} onClick={pick}>
                  {text.other}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error.cause)}
          action={
            error.fix === 'pick'
              ? { label: text.other, onClick: pick }
              : { label: es.app.retry, onClick: () => void (error.fix === 'start' ? start() : download()) }
          }
        />
      )}
    </>
  )
}
