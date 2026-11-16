import type { Cue, SubtitleLimits } from '@ytcreator/core'
import type { SubtitleExportFormat, SubtitlesView } from '@ytcreator/core/api'
import { SUBTITLE_EXPORT_FORMATS } from '@ytcreator/core/api'
import { Button, Dialog, Disclosure, ErrorMessage, format, RadioGroup } from '@ytcreator/ui'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, subtitlesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { formatDate } from '../../../shell/statusText.ts'
import { es } from '../../../strings/es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { durationText } from '../existing/format.ts'
import { saveFile } from '../scripts/saveFile.ts'
import { AiReview } from './AiReview.tsx'
import { AnotherEdit } from './AnotherEdit.tsx'
import { CueEditor } from './CueEditor.tsx'
import { clockText } from './format.ts'
import { History } from './History.tsx'
import { ReapplyOffer } from './ReapplyOffer.tsx'
import { RealChapters } from './RealChapters.tsx'
import { ReplaceAll } from './ReplaceAll.tsx'

const text = subtitlesEs.review

const failedText = (code: string) => subtitlesEs.failed.failures[code] ?? subtitlesEs.failed.failures['interno'] ?? ''

type Latest = NonNullable<SubtitlesView['latest']>

/** The marks of a subtitle in words: those kept with it and those worked out now (R10). */
function marksOf(cue: Cue, computed: readonly string[]): string[] {
  const words: string[] = []
  for (const flag of cue.flags) {
    // With both, what was heard is the recognition's, not the text the AI changed: the AI's mark does not quote it.
    if (flag === 'cambio_ia' && cue.flags.includes('del_guion')) words.push(text.marks.cambio_ia_oido)
    else if (flag === 'del_guion' || flag === 'cambio_ia')
      words.push(format(text.marks[flag], { oido: cue.heard ?? '' }))
    else words.push(text.marks[flag])
  }
  for (const mark of computed)
    if (mark === 'lectura_rapida' || mark === 'fuera_de_limites' || mark === 'solapado') words.push(text.marks[mark])
  return words
}

const limitValues = (limits: SubtitlesView['limits']): SubtitleLimits => ({
  maxLines: limits.maxLines.value,
  maxCharsPerLine: limits.maxCharsPerLine.value,
  maxCharsPerSecond: limits.maxCharsPerSecond.value,
  minSeconds: limits.minSeconds.value,
  maxSeconds: limits.maxSeconds.value,
  minGapSeconds: limits.minGapSeconds.value,
})

/** What was heard, said short: another recognition changes it, editing a subtitle does not. */
const heardKey = (words: Latest['content']['words']) =>
  `${words.length}:${words[0]?.start ?? 0}:${words.at(-1)?.end ?? 0}`

const isStale = (cause: unknown) => cause instanceof ApiClientError && cause.body?.code === 'version_cambiada'

// 3. Reviewing (contracts/ui-screens.md): every subtitle with its time and its marks in words, to listen to it, edit
// it, split it or join it; «Cambiar en todos», the AI's review, the history, approving and downloading.
export function ReviewStep({
  view,
  onView,
  onReload,
  onAgain,
}: {
  readonly view: SubtitlesView & { latest: Latest }
  readonly onView: (view: SubtitlesView) => void
  readonly onReload: () => Promise<void> | void
  /** «Elegir otro fichero»: back to choosing, for a new version from another edit (US5). */
  readonly onAgain: () => void
}) {
  const cues = view.latest.content.cues
  const version = view.latest.version
  const limits = limitValues(view.limits)
  const isPending = (cue: Cue) => !cue.reviewed && (cue.flags.length > 0 || (view.marks[cue.id]?.length ?? 0) > 0)
  const pending = cues.filter(isPending)
  const [filter, setFilter] = useState<'revisar' | 'todos'>(pending.length > 0 ? 'revisar' : 'todos')
  // What «Para revisar» shows stays while the creator works on it: a subtitle marked as reviewed does not vanish
  // under the focus; it goes when the filter is chosen again.
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set(pending.map((cue) => cue.id)))
  const [kind, setKind] = useState<SubtitleExportFormat>('srt')
  const [error, setError] = useState<unknown>(null)
  const [downloadError, setDownloadError] = useState<unknown>(null)
  const [stale, setStale] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [focusOn, setFocusOn] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const items = useRef(new Map<string, HTMLButtonElement>())
  // Made here, not drawn: it has no controls of its own (each subtitle has «Oír») and its words are on screen.
  const audio = useRef<HTMLAudioElement | null>(null)
  const stopAt = useRef<number | null>(null)
  const shown = filter === 'revisar' ? cues.filter((cue) => kept.has(cue.id) || isPending(cue)) : cues
  const canListen = view.audio?.available === true
  const approved = view.status === 'aprobados'

  const fail = useCallback(
    (cause: unknown) => {
      if (isStale(cause)) {
        setStale(true)
        setEditing(null)
        onReload()
      } else setError(cause)
    },
    [onReload],
  )

  useEffect(() => () => audio.current?.pause(), [])

  // The focus goes back to the subtitle once the list shows the change (contracts/ui-screens.md, «Teclado»).
  useEffect(() => {
    if (!focusOn) return
    const item = items.current.get(focusOn)
    if (item) {
      item.focus()
      setFocusOn(null)
    }
  }, [focusOn, cues])

  const save = async (next: Cue[], focus: string) => {
    setError(null)
    setStale(false)
    setSaving(true)
    try {
      const saved = await subtitlesApi.save(view.scriptId, version, next)
      setKept(
        (current) =>
          new Set([...current, ...next.filter((cue) => !cues.some((one) => one.id === cue.id)).map((cue) => cue.id)]),
      )
      setEditing(null)
      onView(saved)
      setFocusOn(focus)
    } catch (cause) {
      fail(cause)
    } finally {
      setSaving(false)
    }
  }

  // Only that piece of the audio: from its start, stopped at its end (R15).
  const listen = (cue: Cue) => {
    if (!canListen) return
    if (!audio.current) {
      const made = new Audio(subtitlesApi.audioUrl(view.scriptId))
      made.preload = 'none'
      made.addEventListener('timeupdate', onTime)
      audio.current = made
    }
    const player = audio.current
    stopAt.current = cue.end
    player.currentTime = cue.start
    void player.play().catch(() => undefined)
  }
  const onTime = () => {
    const player = audio.current
    if (player && stopAt.current !== null && player.currentTime >= stopAt.current) {
      player.pause()
      stopAt.current = null
    }
  }

  // Enter edits, Space listens and the arrows go to the next or the one before, on the subtitle itself.
  const onCueKey = (event: KeyboardEvent<HTMLButtonElement>, cue: Cue, i: number) => {
    if (event.key === ' ') {
      event.preventDefault()
      listen(cue)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const other = shown[event.key === 'ArrowDown' ? i + 1 : i - 1]
      if (other) {
        event.preventDefault()
        items.current.get(other.id)?.focus()
      }
    }
  }

  const download = async () => {
    setDownloadError(null)
    try {
      const { blob, name } = await subtitlesApi.download(view.scriptId, kind)
      saveFile(blob, name)
    } catch (cause) {
      setDownloadError(cause)
    }
  }

  const approve = async () => {
    setAsking(false)
    setError(null)
    try {
      onView(await subtitlesApi.approve(view.scriptId, version))
    } catch (cause) {
      fail(cause)
    }
  }

  const aiBusy = view.job?.op === 'revision_ia' && (view.job.status === 'en_curso' || view.job.status === 'en_cola')
  // Another file that could not be heard after these subtitles were made (US5): they stay, and it says why.
  const failedAgain =
    view.job?.op === 'reconocer' &&
    (view.job.status === 'fallido' || view.job.status === 'interrumpido') &&
    view.job.finishedAt !== null &&
    view.job.finishedAt > view.latest.createdAt
      ? (view.job.failure ?? (view.job.status === 'interrumpido' ? 'interrumpido' : 'interno'))
      : null
  // Choosing another file leaves the screen: not with a subtitle open, while the AI works or with its proposal waiting.
  const againBlocked = editing !== null || aiBusy || view.aiProposal !== null
  // The same file again for what may go well a second time; another file (or the program) for the rest.
  const retry = async () => {
    setError(null)
    try {
      await subtitlesApi.recognize(view.scriptId)
      await onReload()
    } catch (cause) {
      fail(cause)
    }
  }
  const againFix =
    failedAgain === 'interrumpido' || failedAgain === 'interno' || failedAgain === 'sin_memoria'
      ? { label: subtitlesEs.failed.again, onClick: () => void retry() }
      : { label: text.again.choose, onClick: onAgain }

  return (
    <section aria-labelledby="review-title">
      <h2 id="review-title">{text.title}</h2>
      {view.audio && (
        <p>
          {format(text.from, {
            nombre: view.audio.sourceName ?? '',
            duracion: durationText(Math.round(view.audio.seconds)),
          })}
        </p>
      )}
      {/* Stopped by the creator: said, not as a failure. */}
      {failedAgain === 'cancelado' && <p className={styles.notice}>{text.again.stopped}</p>}
      {failedAgain &&
        failedAgain !== 'cancelado' &&
        (againBlocked ? (
          // While a subtitle is open or the AI's proposal waits, it is said without its button.
          <p className={styles.notice}>
            {text.again.failedTitle}. {format(text.again.failedKept, { motivo: failedText(failedAgain) })}
          </p>
        ) : (
          <ErrorMessage
            live
            title={text.again.failedTitle}
            description={format(text.again.failedKept, { motivo: failedText(failedAgain) })}
            action={againFix}
          />
        ))}
      {view.scriptChanged && (
        <>
          <p className={styles.notice}>{text.scriptChanged}</p>
          <div className={styles.actions}>
            <Button variant="secondary" disabled={againBlocked} onClick={onAgain}>
              {text.again.scriptChanged}
            </Button>
          </div>
        </>
      )}
      <ReapplyOffer
        view={view}
        version={version}
        disabled={editing !== null || aiBusy}
        onView={onView}
        onError={fail}
      />
      {approved && view.approvedAt && <p>{format(text.approved, { fecha: formatDate(view.approvedAt) })}</p>}
      <div className={styles.actions}>
        {!approved && (
          <Button
            // One main action: while a subtitle is open or a proposal waits, theirs is (principle I).
            variant={editing === null && view.aiProposal === null ? 'primary' : 'secondary'}
            disabled={cues.length === 0 || aiBusy}
            onClick={() => (view.toReview > 0 ? setAsking(true) : void approve())}
          >
            {text.approve}
          </Button>
        )}
        <Button
          variant={approved ? 'primary' : 'secondary'}
          onClick={() => void download()}
          disabled={cues.length === 0}
        >
          {text.download}
        </Button>
      </div>
      <p className={styles.why}>{text.downloadWhy}</p>
      <Disclosure summary={subtitlesEs.engine.expert}>
        <RadioGroup
          label={text.formatLegend}
          value={kind}
          onValueChange={(value) => setKind(value as SubtitleExportFormat)}
          options={SUBTITLE_EXPORT_FORMATS.map((one) => ({ value: one, label: text.formats[one] }))}
        />
      </Disclosure>
      {downloadError !== null && (
        <ErrorMessage
          live
          title={errorText(downloadError)}
          action={{ label: text.download, onClick: () => void download() }}
        />
      )}
      {stale && <p role="status">{text.stale}</p>}
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          action={{
            label: es.app.retry,
            onClick: () => {
              setError(null)
              onReload()
            },
          }}
        />
      )}

      {cues.length > 0 && (
        <>
          <AiReview view={view} version={version} onView={onView} onReload={onReload} onError={fail} />
          <ReplaceAll
            view={view}
            version={version}
            onView={onView}
            onError={fail}
            disabled={editing !== null || aiBusy}
          />
          <History view={view} version={version} onView={onView} onError={fail} disabled={editing !== null || aiBusy} />
          <AnotherEdit
            view={view}
            disabled={editing !== null || aiBusy}
            blockedByAi={view.aiProposal !== null}
            onAgain={onAgain}
            onReload={onReload}
            onError={fail}
          />
          {/* Only a long video with a package has chapters to place (US3). */}
          {view.format === 'largo' && view.packageId !== null && (
            <RealChapters
              scriptId={view.scriptId}
              packageId={view.packageId}
              heard={heardKey(view.latest.content.words)}
              audioSeconds={view.latest.content.audioSeconds}
              onError={fail}
            />
          )}
        </>
      )}

      {cues.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <>
          <RadioGroup
            label={text.filterLegend}
            value={filter}
            onValueChange={(value) => {
              setFilter(value as 'revisar' | 'todos')
              setKept(new Set(pending.map((cue) => cue.id)))
            }}
            options={[
              { value: 'revisar', label: format(text.toReview, { n: pending.length }) },
              { value: 'todos', label: format(text.all, { n: cues.length }) },
            ]}
          />
          <p className={styles.why}>{canListen ? text.keysHelp : text.keysHelpNoAudio}</p>
          {shown.length === 0 ? (
            <p>{text.noneToReview}</p>
          ) : (
            <ol aria-label={text.listLabel} className={styles.cueList}>
              {shown.map((cue, i) => {
                const marks = marksOf(cue, view.marks[cue.id] ?? [])
                const inicio = clockText(cue.start)
                if (editing === cue.id) {
                  return (
                    <li key={cue.id} className={styles.cue}>
                      <CueEditor
                        cue={cue}
                        cues={cues}
                        limits={limits}
                        audioSeconds={view.latest.content.audioSeconds}
                        busy={saving}
                        approved={approved}
                        onSave={(next, focus) => void save(next, focus)}
                        onCancel={() => {
                          setEditing(null)
                          setFocusOn(cue.id)
                        }}
                      />
                    </li>
                  )
                }
                return (
                  <li key={cue.id} className={styles.cue}>
                    {/* The subtitle itself is the button: Enter edits it, Space listens to it (ui-screens, «Teclado»). */}
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) items.current.set(cue.id, node)
                        else items.current.delete(cue.id)
                      }}
                      className={styles.cueButton}
                      disabled={editing !== null || aiBusy}
                      onClick={() => setEditing(cue.id)}
                      onKeyDown={(event) => onCueKey(event, cue, i)}
                      onKeyUp={(event) => {
                        // Space listens; it must not also open the editor when the key comes up.
                        if (event.key === ' ') event.preventDefault()
                      }}
                    >
                      <span className={styles.cueTime}>{format(text.at, { inicio, fin: clockText(cue.end) })}</span>
                      <span className={styles.cueText}>
                        {cue.text.split('\n').map((line, n) => (
                          <span key={n} className={styles.cueLine}>
                            {line}
                          </span>
                        ))}
                      </span>
                      <span className={styles.cueEdit}>{text.edit}</span>
                    </button>
                    {marks.length > 0 && (
                      <ul className={styles.cueMarks}>
                        {marks.map((mark) => (
                          <li key={mark}>{mark}</li>
                        ))}
                      </ul>
                    )}
                    {cue.reviewed && marks.length > 0 && <p className={styles.why}>{text.reviewed}</p>}
                    <div className={styles.actions}>
                      {canListen && (
                        <Button
                          variant="ghost"
                          aria-label={format(text.listenLabel, { inicio })}
                          onClick={() => listen(cue)}
                        >
                          {text.listen}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={text.approveTitle}
        description={format(view.toReview === 1 ? text.approvePending.one : text.approvePending.other, {
          n: view.toReview,
        })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {text.approveKeep}
            </Button>
            <Button variant="primary" onClick={() => void approve()}>
              {text.approveConfirm}
            </Button>
          </>
        }
      />
    </section>
  )
}
