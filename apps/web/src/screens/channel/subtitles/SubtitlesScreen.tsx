import type { SpeechEngineView, SubtitlesView } from '@ytcreator/core/api'
import { Button, ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { speechEngineApi, subtitlesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { ChooseStep } from './ChooseStep.tsx'
import { ReviewStep } from './ReviewStep.tsx'
import { RunningStep } from './RunningStep.tsx'

const text = subtitlesEs.screen

// The subtitles of one video (contracts/ui-screens.md): choosing the file, listening, and reviewing what came out.
export function SubtitlesScreen({ scriptId }: { readonly scriptId: string }) {
  const [view, setView] = useState<SubtitlesView | null>(null)
  const [engine, setEngine] = useState<SpeechEngineView | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      try {
        const [subtitles, program] = await Promise.all([
          subtitlesApi.get(scriptId, { signal }),
          speechEngineApi.get({ signal }),
        ])
        setView(subtitles)
        setEngine(program)
      } catch (cause) {
        if (signal?.aborted) return
        setError(cause)
      }
    },
    [scriptId],
  )
  const reload = useCallback(() => load(), [load])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (!view || !engine) {
    return (
      <Screen title={text.title}>
        {error !== null ? (
          <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
        ) : (
          <p role="status">{text.loading}</p>
        )}
      </Screen>
    )
  }

  const job = view.job
  const listening = job && job.op === 'reconocer' && (job.status === 'en_curso' || job.status === 'en_cola')

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      <p>{format(text.of, { titulo: view.idea.title })}</p>
      {listening ? (
        <RunningStep view={{ ...view, job }} onChanged={reload} />
      ) : view.latest && view.latest.content.cues.length > 0 ? (
        <ReviewStep view={{ ...view, latest: view.latest }} onView={setView} onReload={reload} />
      ) : (
        <ChooseStep view={view} engine={engine} onEngineChanged={reload} onStarted={reload} />
      )}
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'script', id: view.scriptId })}>
          {text.toScript}
        </Button>
      </div>
    </Screen>
  )
}
