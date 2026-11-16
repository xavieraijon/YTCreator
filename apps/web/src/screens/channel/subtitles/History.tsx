import type { SubtitlesView, SubtitleVersionSummary } from '@ytcreator/core/api'
import { Button, Disclosure, format } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { formatDate } from '../../../shell/statusText.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.review.history

const plural = (forms: { one: string; other: string }, n: number) => format(n === 1 ? forms.one : forms.other, { n })

// The history (FR-012): every version with where it came from, said for people, and «Volver a esta», which makes a
// copy as a new version, so none is ever lost.
export function History({
  view,
  version,
  onView,
  onError,
  disabled,
}: {
  readonly view: SubtitlesView
  readonly version: number
  /** While a subtitle is open or the AI is reviewing: going back would lose it or be refused. */
  readonly disabled: boolean
  readonly onView: (view: SubtitlesView) => void
  readonly onError: (cause: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<SubtitleVersionSummary[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    subtitlesApi
      .versions(view.scriptId, { signal: controller.signal })
      .then(setVersions)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) onError(cause)
      })
    return () => controller.abort()
  }, [open, view.scriptId, version, onError])

  const restore = async (n: number) => {
    setBusy(true)
    try {
      onView(await subtitlesApi.restore(view.scriptId, { baseVersion: version, version: n }))
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Disclosure summary={text.title} open={open} onOpenChange={setOpen}>
      {/* Said before going back (AS5, FR-013). */}
      {view.status === 'aprobados' && <p className={styles.notice}>{text.backToDraft}</p>}
      {versions === null ? (
        <p role="status">{text.loading}</p>
      ) : (
        <ol className={styles.cueList}>
          {versions.map((one) => (
            <li key={one.version} className={styles.cue}>
              <p>
                <strong>{format(text.version, { n: one.version, fecha: formatDate(one.createdAt) })}</strong>
              </p>
              <p>
                {format(text.line, {
                  origen: format(text.origins[one.origin], { n: one.restoredFrom ?? '' }),
                  subtitulos: plural(text.cues, one.cueCount),
                })}
              </p>
              {one.version === version ? (
                <p className={styles.why}>{text.current}</p>
              ) : (
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    disabled={busy || disabled}
                    aria-label={format(text.restoreLabel, { n: one.version })}
                    onClick={() => void restore(one.version)}
                  >
                    {text.restore}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Disclosure>
  )
}
