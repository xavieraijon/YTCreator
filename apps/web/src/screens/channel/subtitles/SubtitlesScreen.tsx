import type { SubtitlesView } from '@ytcreator/core/api'
import { Button, ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.screen

// The subtitles of one video (contracts/ui-screens.md). The skeleton: each story fills in its part.
export function SubtitlesScreen({ scriptId }: { readonly scriptId: string }) {
  const [view, setView] = useState<SubtitlesView | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      try {
        setView(await subtitlesApi.get(scriptId, { signal }))
      } catch (cause) {
        if (signal?.aborted) return
        setError(cause)
      }
    },
    [scriptId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (!view) {
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

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      <p>{format(text.of, { titulo: view.idea.title })}</p>
      <p>{subtitlesEs.status[view.status]}</p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'script', id: view.scriptId })}>
          {text.toScript}
        </Button>
      </div>
    </Screen>
  )
}
