import type { ScriptSummary } from '@ytcreator/core/api'
import { Badge, Button, Card, EmptyState, ErrorMessage, format } from '@ytcreator/ui'
import { FileText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { channelApi, scriptsApi, subtitlesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { saveFile } from './saveFile.ts'

const text = scriptEs.list
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

// «Mis guiones»: each one in the point where it was left (contracts/ui-screens.md).
export function ScriptList() {
  const [scripts, setScripts] = useState<readonly ScriptSummary[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setDownloadFailed(null)
    try {
      const current = await channelApi.current({ signal })
      if (!current.channel || !current.profile) {
        navigate({ page: 'channelStart' })
        return
      }
      setScripts(await scriptsApi.list(current.channel.id, { signal }))
    } catch (cause) {
      if (!signal?.aborted) setError(cause)
    }
  }, [])

  const [downloadFailed, setDownloadFailed] = useState<{
    cause: unknown
    kind: 'md' | 'json' | 'subtitles'
  } | null>(null)

  const downloadAll = async (kind: 'md' | 'json' | 'subtitles') => {
    setError(null)
    setDownloadFailed(null)
    try {
      const current = await channelApi.current()
      if (!current.channel) return
      const { blob, name } =
        kind === 'subtitles'
          ? await subtitlesApi.downloadAll(current.channel.id)
          : await scriptsApi.downloadAll(current.channel.id, kind)
      saveFile(blob, name)
    } catch (cause) {
      setDownloadFailed({ cause, kind })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      {error !== null ? (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      ) : scripts === null ? (
        <p role="status">{es.app.loading}</p>
      ) : scripts.length === 0 ? (
        <EmptyState
          icon={FileText}
          titleAs="h2"
          title={text.emptyTitle}
          description={text.emptyBody}
          action={{ label: text.toBank, onClick: () => navigate({ page: 'ideaBank' }) }}
        />
      ) : (
        <>
          {/* With scripts already there, starting another one is still in reach (novice audit, decision 50). */}
          <p className={styles.notice}>
            {text.another}{' '}
            <Button variant="secondary" size="sm" onClick={() => navigate({ page: 'ideaBank' })}>
              {text.toBank}
            </Button>
          </p>
          <ul className={styles.options}>
            {scripts.map((script, index) => (
              <Card as="li" key={script.id} className={styles.option}>
                <h2>{script.title}</h2>
                <p>
                  <Badge>{scriptEs.format[script.format]}</Badge> <Badge>{scriptEs.status[script.status]}</Badge>
                </p>
                <p>{format(text.updated, { date: dateOf(script.updatedAt) })}</p>
                <div className={styles.actions}>
                  <Button
                    variant={index === 0 ? 'primary' : 'secondary'}
                    aria-label={format(text.openNamed, { titulo: script.title })}
                    onClick={() => navigate({ page: 'script', id: script.id })}
                  >
                    {text.open}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </>
      )}
      {downloadFailed !== null && (
        <ErrorMessage
          live
          title={errorText(downloadFailed.cause)}
          action={{ label: es.app.retry, onClick: () => void downloadAll(downloadFailed.kind) }}
        />
      )}
      <div className={styles.actions}>
        {scripts !== null && scripts.length > 0 && (
          <>
            <Button variant="secondary" onClick={() => void downloadAll('md')}>
              {text.downloadAll}
            </Button>
            <Button variant="secondary" onClick={() => void downloadAll('json')}>
              {text.downloadAllData}
            </Button>
            <Button variant="secondary" onClick={() => void downloadAll('subtitles')}>
              {text.downloadAllSubtitles}
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={() => navigate({ page: 'scriptVoice' })}>
          {scriptEs.voice.link}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ page: 'channelStart' })}>
          {text.backToChannel}
        </Button>
      </div>
    </Screen>
  )
}
