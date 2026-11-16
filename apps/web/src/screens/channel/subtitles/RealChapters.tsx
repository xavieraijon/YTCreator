import { formatChapterTime, parseChapterTime } from '@ytcreator/core'
import type { PackageView, SubtitleChapter } from '@ytcreator/core/api'
import { Button, Checkbox, Dialog, format, TextField } from '@ytcreator/ui'
import { useEffect, useId, useState } from 'react'
import { ApiClientError, packagesApi, subtitlesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { type Accepted, markedAtFirst, outOfOrder, unplaceable } from './chapterOrder.ts'

const text = subtitlesEs.review.chapters

const plural = (forms: { one: string; other: string }, n: number) => format(n === 1 ? forms.one : forms.other, { n })

/** Saving takes an approval back to draft (FR-015 of 006): the texts or the whole package, even one kept from before. */
const approvedPackage = (pkg: PackageView) =>
  pkg.status === 'textos_aprobados' ||
  pkg.status === 'aprobado' ||
  pkg.approvals.texts !== null ||
  pkg.approvals.package !== null

const differenceText = (chapter: SubtitleChapter) => {
  if (chapter.real === null) return ''
  const delta = chapter.real - chapter.estimated
  if (delta === 0) return text.difference.same
  return format(delta > 0 ? text.difference.later : text.difference.earlier, { n: Math.abs(delta) })
}

const codeOf = (cause: unknown) => (cause instanceof ApiClientError ? cause.body?.code : undefined)

const isOrder = (cause: unknown) =>
  cause instanceof ApiClientError && cause.body?.code === 'validacion' && cause.body.fields?.['chapters'] !== undefined

// «Minutos reales de los capítulos» (US3, contracts/ui-screens.md): each chapter with its minute now, where it is heard
// in the audio and the difference; the creator marks the ones to change, and for one not in the audio writes its minute
// or removes it.
export function RealChapters({
  scriptId,
  packageId,
  heard,
  audioSeconds,
  onError,
}: {
  readonly scriptId: string
  readonly packageId: string
  /** What was heard, as a key: only another recognition changes the real minutes, not editing a subtitle. */
  readonly heard: string
  readonly audioSeconds: number
  readonly onError: (cause: unknown) => void
}) {
  const [chapters, setChapters] = useState<SubtitleChapter[] | null>(null)
  const [pkg, setPkg] = useState<PackageView | null>(null)
  // YouTube's shortest chapter (006): between two minutes that are not real ones (decision 46).
  const [minSeconds, setMinSeconds] = useState(1)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [written, setWritten] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [order, setOrder] = useState(false)
  const [stale, setStale] = useState(false)
  const [gone, setGone] = useState(false)
  const [loads, setLoads] = useState(0)
  const titleId = useId()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      subtitlesApi.chapters(scriptId, { signal }),
      packagesApi.get(packageId, { signal }),
      packagesApi.review(packageId, { signal }),
    ])
      .then(([proposal, view, review]) => {
        setChapters(proposal)
        setPkg(view)
        setMinSeconds(review.rules.chapterMinSeconds)
        setMarked(markedAtFirst(proposal, review.rules.chapterMinSeconds))
        setRemoved(new Set())
        setWritten({})
      })
      .catch((cause: unknown) => {
        if (signal.aborted) return
        // Without chapters to place (no package, or not a long video), the section is not shown.
        if (codeOf(cause) === 'no_encontrado') setGone(true)
        else onError(cause)
      })
    return () => controller.abort()
  }, [scriptId, packageId, heard, loads, onError])

  if (gone) return null

  const writtenSeconds = (chapterId: string): number | null | undefined => {
    const value = (written[chapterId] ?? '').trim()
    return value === '' ? undefined : parseChapterTime(value)
  }
  const writtenError = (chapterId: string) => {
    const seconds = writtenSeconds(chapterId)
    if (seconds === null) return text.writeInvalid
    if (seconds !== undefined && seconds > audioSeconds)
      return format(text.tooLate, { tiempo: formatChapterTime(audioSeconds) })
    return undefined
  }

  const disordered = outOfOrder(chapters ?? [])
  const accept = (chapters ?? []).flatMap((one): Accepted[] => {
    if (one.real !== null && marked.has(one.chapterId)) return [{ chapterId: one.chapterId, seconds: one.real }]
    // A minute is written for one not in the audio, or for one heard before an earlier chapter.
    if (removed.has(one.chapterId) || (one.real !== null && !disordered.has(one.chapterId))) return []
    const seconds = writtenSeconds(one.chapterId)
    return seconds === undefined || seconds === null ? [] : [{ chapterId: one.chapterId, seconds }]
  })
  const remove = [...removed]
  const changes = accept.length + remove.length
  const capitulos = pkg?.pieces.capitulos ?? null
  // Only the fields on screen count: one hidden by marking its real minute (or removing it) is not sent.
  const badWritten = (chapters ?? []).some(
    (one) =>
      !removed.has(one.chapterId) &&
      !marked.has(one.chapterId) &&
      (one.real === null || disordered.has(one.chapterId)) &&
      writtenError(one.chapterId) !== undefined,
  )
  // Said before asking, never after the confirmation: these minutes would be refused (novice audit, round 1).
  const notInOrder = unplaceable(chapters ?? [], accept, removed, minSeconds)

  const reloadStale = () => {
    setStale(true)
    setLoads((n) => n + 1)
  }

  const put = async (baseVersion: number) => {
    setAsking(false)
    setBusy(true)
    try {
      await subtitlesApi.chaptersFromAudio(packageId, { baseVersion, accept, remove })
      setDone(changes)
      setLoads((n) => n + 1)
    } catch (cause) {
      if (isOrder(cause)) setOrder(true)
      // The chapters changed in another tab: they are read again, and nothing was put.
      else if (codeOf(cause) === 'version_cambiada') reloadStale()
      else onError(cause)
    } finally {
      setBusy(false)
    }
  }

  // The package is read again first: another tab may have changed its chapters or approved it (AS4).
  const ask = async () => {
    if (!capitulos) return
    setOrder(false)
    setStale(false)
    setDone(null)
    setBusy(true)
    let fresh: PackageView
    try {
      fresh = await packagesApi.get(packageId)
    } catch (cause) {
      setBusy(false)
      onError(cause)
      return
    }
    setBusy(false)
    setPkg(fresh)
    if (fresh.pieces.capitulos?.version !== capitulos.version) reloadStale()
    else if (approvedPackage(fresh)) setAsking(true)
    else await put(capitulos.version)
  }

  const toggle = (set: (update: (before: Set<string>) => Set<string>) => void, chapterId: string, on: boolean) =>
    set((before) => {
      const next = new Set(before)
      if (on) next.add(chapterId)
      else next.delete(chapterId)
      return next
    })

  const nowText = (one: SubtitleChapter) =>
    format(text.now, {
      tiempo: formatChapterTime(one.estimated),
      como: one.fromAudio ? text.how.real : one.manual ? text.how.manual : text.how.estimado,
    })

  const body = () => {
    if (chapters === null || pkg === null) return <p role="status">{text.loading}</p>
    if (chapters.length === 0) return <p className={styles.why}>{text.none}</p>
    return (
      <>
        <ol className={styles.cueList}>
          {chapters.map((one, index) => (
            <li key={one.chapterId} className={styles.cue}>
              <p>
                <strong>{one.title}</strong>
              </p>
              <p>{nowText(one)}</p>
              {index === 0 ? (
                <p className={styles.why}>{text.first}</p>
              ) : one.real === null ? (
                <>
                  <p className={styles.notice}>{text.notFound}</p>
                  <Checkbox
                    label={format(text.remove, { titulo: one.title })}
                    description={text.removeHelp}
                    checked={removed.has(one.chapterId)}
                    disabled={busy}
                    onCheckedChange={(on) => toggle(setRemoved, one.chapterId, on)}
                  />
                  {!removed.has(one.chapterId) && (
                    <TextField
                      label={format(text.write, { titulo: one.title })}
                      description={text.writeHelp}
                      value={written[one.chapterId] ?? ''}
                      disabled={busy}
                      error={writtenError(one.chapterId)}
                      onChange={(event) => setWritten((before) => ({ ...before, [one.chapterId]: event.target.value }))}
                    />
                  )}
                </>
              ) : (
                <>
                  <p>{format(text.real, { tiempo: formatChapterTime(one.real), diferencia: differenceText(one) })}</p>
                  {disordered.has(one.chapterId) && <p className={styles.notice}>{text.outOfOrder}</p>}
                  {one.real !== one.estimated && (
                    <>
                      {one.manual && <p className={styles.why}>{text.handWritten}</p>}
                      <Checkbox
                        label={format(text.put, { titulo: one.title })}
                        checked={marked.has(one.chapterId)}
                        disabled={busy}
                        onCheckedChange={(on) => toggle(setMarked, one.chapterId, on)}
                      />
                    </>
                  )}
                  {disordered.has(one.chapterId) && !marked.has(one.chapterId) && (
                    <TextField
                      label={format(text.writeInstead, { titulo: one.title })}
                      description={text.writeHelp}
                      value={written[one.chapterId] ?? ''}
                      disabled={busy}
                      error={writtenError(one.chapterId)}
                      onChange={(event) => setWritten((before) => ({ ...before, [one.chapterId]: event.target.value }))}
                    />
                  )}
                  {notInOrder.has(one.chapterId) && (
                    <p className={styles.notice}>{format(text.breaksOrder, { n: minSeconds })}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        {chapters.every((one, index) => index === 0 || one.real === one.estimated) && (
          <p className={styles.why}>{text.nothing}</p>
        )}
        {notInOrder.size > 0 ? (
          <p role="status" className={styles.notice}>
            {text.notInOrder}
          </p>
        ) : (
          order && (
            <p role="alert" className={styles.alert}>
              {text.order}
            </p>
          )
        )}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            loading={busy}
            disabled={busy || changes === 0 || badWritten || notInOrder.size > 0 || capitulos === null}
            onClick={() => void ask()}
          >
            {text.apply}
          </Button>
          <Button variant="ghost" onClick={() => navigate({ page: 'package', id: packageId })}>
            {text.toPackage}
          </Button>
        </div>
        {done !== null && <p role="status">{plural(text.done, done)}</p>}
        {stale && <p role="status">{text.stale}</p>}
        <Dialog
          open={asking}
          onOpenChange={setAsking}
          title={text.confirmTitle}
          description={text.confirmBody}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                {text.keep}
              </Button>
              <Button variant="primary" onClick={() => capitulos && void put(capitulos.version)}>
                {text.confirm}
              </Button>
            </>
          }
        />
      </>
    )
  }

  return (
    <section aria-labelledby={titleId} className={styles.form}>
      <h3 id={titleId}>{text.title}</h3>
      <p className={styles.why}>{text.why}</p>
      {body()}
    </section>
  )
}
