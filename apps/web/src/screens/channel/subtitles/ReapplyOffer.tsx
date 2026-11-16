import type { SubtitlesView } from '@ytcreator/core/api'
import { Button, format } from '@ytcreator/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'

const text = subtitlesEs.review.reapply

const plural = (forms: { one: string; other: string }, n: number) => format(n === 1 ? forms.one : forms.other, { n })

// After another file (US5, AS2): the changes made in all of the subtitles before, offered for these, saying how many
// subtitles change. Nothing changes until the creator says so.
export function ReapplyOffer({
  view,
  version,
  disabled,
  onView,
  onError,
}: {
  readonly view: SubtitlesView
  readonly version: number
  readonly disabled: boolean
  readonly onView: (view: SubtitlesView) => void
  readonly onError: (cause: unknown) => void
}) {
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const titleId = useId()
  const said = useRef<HTMLParagraphElement>(null)
  // The section that had the focus is gone: it goes to what happened.
  useEffect(() => {
    if (done !== null) said.current?.focus()
  }, [done])

  if (done !== null)
    return (
      <p ref={said} role="status" tabIndex={-1}>
        {plural(text.done, done)}
      </p>
    )
  if (!view.reapply || hidden) return null
  const offer = view.reapply

  const apply = async () => {
    setBusy(true)
    try {
      const { count, ...next } = await subtitlesApi.reapply(view.scriptId, version)
      setDone(count)
      onView(next)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={titleId} className={styles.form}>
      <h3 id={titleId}>{text.title}</h3>
      <p>{format(text.offer, { subtitulos: plural(text.cues, offer.count) })}</p>
      <ul>
        {view.replacements.map((one) => (
          <li key={one.from}>{format(text.change, { de: one.from, por: one.to })}</li>
        ))}
      </ul>
      {view.status === 'aprobados' && <p className={styles.notice}>{text.approved}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" loading={busy} disabled={busy || disabled} onClick={() => void apply()}>
          {text.apply}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setHidden(true)}>
          {text.later}
        </Button>
      </div>
    </section>
  )
}
