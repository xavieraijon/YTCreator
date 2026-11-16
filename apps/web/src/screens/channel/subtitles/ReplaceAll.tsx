import { SUBTITLE_LIMITS } from '@ytcreator/core'
import type { SubtitlesView } from '@ytcreator/core/api'
import { Button, Dialog, Disclosure, format, TextField } from '@ytcreator/ui'
import { useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.review.replace

const plural = (forms: { one: string; other: string }, n: number) => format(n === 1 ? forms.one : forms.other, { n })

// «Cambiar en todos» (FR-009): how many first, then the change, which is kept to apply it again later.
export function ReplaceAll({
  view,
  version,
  onView,
  onError,
  disabled,
}: {
  readonly view: SubtitlesView
  readonly version: number
  /** While a subtitle is open or the AI is reviewing. */
  readonly disabled: boolean
  readonly onView: (view: SubtitlesView) => void
  readonly onError: (cause: unknown) => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const de = from.trim()
  const por = to.trim()
  const same = de !== '' && de === por

  const ask = async () => {
    setDone(null)
    setBusy(true)
    try {
      const { count: found } = await subtitlesApi.replaceCount(view.scriptId, {
        baseVersion: version,
        from: de,
        to: por,
      })
      setCount(found)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    const changed = count ?? 0
    setBusy(true)
    try {
      onView(await subtitlesApi.replace(view.scriptId, { baseVersion: version, from: de, to: por }))
      setCount(null)
      setFrom('')
      setTo('')
      setDone(changed)
    } catch (cause) {
      setCount(null)
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Disclosure summary={text.title}>
      <p className={styles.why}>{text.why}</p>
      <div className={styles.cueTimes}>
        <TextField
          label={text.from}
          value={from}
          maxLength={SUBTITLE_LIMITS.replacementText}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label={text.to}
          value={to}
          maxLength={SUBTITLE_LIMITS.replacementText}
          error={same ? text.same : undefined}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          loading={busy}
          disabled={busy || disabled || de === '' || por === '' || same}
          onClick={() => void ask()}
        >
          {text.title}
        </Button>
      </div>
      {count === 0 && <p role="status">{format(text.none, { de })}</p>}
      {done !== null && <p role="status">{plural(text.done, done)}</p>}
      <Dialog
        open={count !== null && count > 0}
        onOpenChange={(open) => {
          if (!open) setCount(null)
        }}
        title={format(text.confirmTitle, { de, por })}
        description={plural(text.confirmBody, count ?? 0)}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setCount(null)}>
              {text.keep}
            </Button>
            <Button variant="primary" loading={busy} disabled={busy} onClick={() => void confirm()}>
              {text.confirm}
            </Button>
          </>
        }
      />
    </Disclosure>
  )
}
