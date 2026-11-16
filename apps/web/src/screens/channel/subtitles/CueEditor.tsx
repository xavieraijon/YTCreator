import {
  type Cue,
  editCue,
  EditError,
  type EditErrorCode,
  joinCues,
  markReviewed,
  readingMarks,
  splitCue,
  type SubtitleLimits,
} from '@ytcreator/core'
import { Button, format, TextArea, TextField } from '@ytcreator/ui'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { clockText, parseClock } from './format.ts'

const text = subtitlesEs.review.editor

export interface CueEditorProps {
  readonly cue: Cue
  readonly cues: readonly Cue[]
  readonly limits: SubtitleLimits
  readonly audioSeconds: number
  readonly busy: boolean
  /** Saving makes approved subtitles a draft again: said before (FR-013). */
  readonly approved: boolean
  /** The whole list after the change, and the subtitle to put the focus on when it closes. */
  readonly onSave: (cues: Cue[], focus: string) => void
  readonly onCancel: () => void
}

// Editing one subtitle (FR-008, FR-010): its text and its times, split it, join it with the next one or mark it as
// reviewed. Going past the reading limits is said in words, never blocked.
export function CueEditor({ cue, cues, limits, audioSeconds, busy, approved, onSave, onCancel }: CueEditorProps) {
  const [draft, setDraft] = useState(cue.text)
  const [start, setStart] = useState(clockText(cue.start))
  const [end, setEnd] = useState(clockText(cue.end))
  const [error, setError] = useState<EditErrorCode | 'reloj' | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const isLast = cues[cues.length - 1]?.id === cue.id
  // Opening it puts the focus in the text (contracts/ui-screens.md, «Teclado»).
  useEffect(() => area.current?.focus(), [])

  // A time left as it was shown keeps all its decimals.
  const timeOf = (written: string, before: number): number | null | undefined =>
    written === clockText(before) ? undefined : parseClock(written)

  const attempt = (work: () => Cue[], focus = cue.id) => {
    setError(null)
    try {
      onSave(work(), focus)
    } catch (cause) {
      if (cause instanceof EditError) setError(cause.code)
      else throw cause
    }
  }

  // What is written in the editor, over the list: splitting, joining or marking it starts from it, never loses it.
  const written = (): Cue[] | null => {
    const newStart = timeOf(start, cue.start)
    const newEnd = timeOf(end, cue.end)
    if (newStart === null || newEnd === null) {
      setError('reloj')
      return null
    }
    if (draft === cue.text && newStart === undefined && newEnd === undefined) return [...cues]
    return editCue(
      cues,
      cue.id,
      {
        ...(draft !== cue.text ? { text: draft } : {}),
        ...(newStart !== undefined ? { start: newStart } : {}),
        ...(newEnd !== undefined ? { end: newEnd } : {}),
      },
      audioSeconds,
    )
  }

  const withWritten = (work: (list: Cue[]) => Cue[]) => () => {
    setError(null)
    let list: Cue[] | null
    try {
      list = written()
    } catch (cause) {
      if (cause instanceof EditError) return setError(cause.code)
      throw cause
    }
    if (list) attempt(() => work(list))
  }

  const save = () => {
    setError(null)
    const newStart = timeOf(start, cue.start)
    const newEnd = timeOf(end, cue.end)
    if (newStart === null || newEnd === null) return setError('reloj')
    // Nothing changed: it only closes.
    if (draft === cue.text && newStart === undefined && newEnd === undefined) return onCancel()
    withWritten((list) => list)()
  }

  // Where to cut: the cursor in the text being written, counted as it is once its lines are joined.
  const split = withWritten((list) => splitCue(list, cue.id, area.current?.selectionStart ?? 0, limits))

  const preview = (() => {
    const s = parseClock(start)
    const e = parseClock(end)
    return s !== null && e !== null && e > s ? readingMarks({ start: s, end: e, text: draft }, limits) : []
  })()

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <section aria-labelledby={titleId} className={styles.cueEditor}>
      <h3 id={titleId}>{format(text.title, { inicio: clockText(cue.start) })}</h3>
      <TextArea
        ref={area}
        label={text.text}
        description={format(text.textHelpWithSplit, {
          lineas: limits.maxLines > 1 ? format(text.textHelp, { n: limits.maxLines }) : text.textHelpOne,
        })}
        rows={limits.maxLines}
        value={draft}
        disabled={busy}
        onKeyDown={onKeyDown}
        error={error === 'vacio' ? text.errors.vacio : undefined}
        onChange={(event) => {
          const value = limits.maxLines > 1 ? event.target.value : event.target.value.replace(/\n/g, ' ')
          setDraft(value)
        }}
      />
      <div className={styles.cueTimes}>
        <TextField
          label={text.start}
          description={text.timeHelp}
          value={start}
          inputMode="decimal"
          disabled={busy}
          onKeyDown={onKeyDown}
          onChange={(event) => setStart(event.target.value)}
        />
        <TextField
          label={text.end}
          value={end}
          inputMode="decimal"
          disabled={busy}
          onKeyDown={onKeyDown}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      {preview.length > 0 && <p className={styles.notice}>{text.limits}</p>}
      {approved && <p className={styles.notice}>{text.backToDraft}</p>}
      {error !== null && error !== 'vacio' && (
        <p role="alert" className={styles.alert}>
          {text.errors[error]}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="primary" loading={busy} disabled={busy} onClick={save}>
          {text.save}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          {text.cancel}
        </Button>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={split}>
          {text.split}
        </Button>
        {!isLast && (
          <Button variant="secondary" disabled={busy} onClick={withWritten((list) => joinCues(list, cue.id, limits))}>
            {text.join}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={withWritten((list) => markReviewed(list, cue.id, !cue.reviewed))}
        >
          {cue.reviewed ? text.unmarkReviewed : text.markReviewed}
        </Button>
      </div>
    </section>
  )
}
