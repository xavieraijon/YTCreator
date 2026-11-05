import { CHANNEL_HANDLE_PATTERN, type FormatSummary, type YouTubeFailureCode } from '@ytcreator/core'
import type { ChannelReadingView, JourneyFullView } from '@ytcreator/core/api'
import { Button, DataSource, ErrorMessage, format, ProgressBar } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { useJob } from '../../../shell/useJob.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../../../strings/youtube-failures.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { latestOf, useEstimate, useGenerate } from '../useJourney.ts'
import { durationText, paceText, videoLine } from './format.ts'
import { CurrentSection } from './Positioning.tsx'

const text = channelEs.existing.reading
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)

export function ReadingProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className={styles.option}>
      <ProgressBar value={total > 0 ? Math.round((done / total) * 100) : 0} label={text.progress} />
      <p className={styles.why}>{text.progressHelp}</p>
    </div>
  )
}

function Videos({ title, why, list }: { title: string; why?: string; list: FormatSummary['best'] }) {
  if (list.length === 0) return null
  return (
    <div className={styles['indicator-row']}>
      <h3>{title}</h3>
      {why && <p className={styles.why}>{why}</p>}
      <ul>
        {list.map((video) => (
          <li key={video.videoId}>{videoLine(video.title, video.ratio)}</li>
        ))}
      </ul>
    </div>
  )
}

function Format({
  title,
  summary,
  empty,
  fetchedAt,
}: {
  title: string
  summary: FormatSummary
  empty: string
  fetchedAt: string
}) {
  const nothingBad = summary.worst.length === 0
  return (
    <section className={styles.niche} aria-label={title}>
      <h2>{title}</h2>
      {summary.count === 0 ? (
        <p>{empty}</p>
      ) : (
        <>
          <p>{format(text.count, { videos: number(summary.count) })}</p>
          <p>
            {summary.medianViews === null
              ? text.noViews
              : format(text.typical, { visitas: number(summary.medianViews) })}
          </p>
          <p>
            {summary.averageDurationSeconds === null
              ? text.noDuration
              : format(text.duration, { duracion: durationText(summary.averageDurationSeconds) })}
          </p>
          <p>{summary.videosPerWeek === null ? text.noPace : paceText(summary.videosPerWeek)}</p>
          {summary.datedVideos < summary.count && <p className={styles.why}>{text.partialDates}</p>}
          <Videos title={text.best} list={summary.best} />
          <Videos title={text.worst} why={text.worstWhy} list={summary.worst} />
          {summary.best.length === 0 && nothingBad && <p className={styles.why}>{text.noneToCompare}</p>}
          {summary.best.length > 0 && nothingBad && summary.datedVideos < summary.count && (
            <p className={styles.why}>{text.noWorst}</p>
          )}
          <DataSource kind="youtube" date={fetchedAt} />
        </>
      )}
    </section>
  )
}

const howManyRead = ({ summary, videoCount }: ChannelReadingView): string => {
  const { videosRead } = summary
  if (videosRead === 0) return text.readNone
  if (videoCount !== null && videoCount > videosRead) {
    return format(text.readPart, { videos: number(videosRead), total: number(videoCount) })
  }
  return videosRead === 1 ? text.readOne : format(text.read, { videos: number(videosRead) })
}

// Every figure comes from what was read, marked as data and dated (FR-020); what is not known is said so.
export function ReadingSummaryView({ reading }: { reading: ChannelReadingView }) {
  const { summary, fetchedAt } = reading
  return (
    <div className={styles.options}>
      <div className={styles['indicator-row']}>
        <p>
          <strong>{howManyRead(reading)}</strong>
        </p>
        <DataSource kind="youtube" date={fetchedAt} />
      </div>
      {summary.partial && <p role="status">{text.partial}</p>}
      {summary.unknownFormat > 0 && (
        <p className={styles.why}>
          {summary.unknownFormat === 1
            ? text.unknownFormatOne
            : format(text.unknownFormat, { videos: number(summary.unknownFormat) })}
        </p>
      )}
      <Format
        title={text.long}
        summary={summary.long}
        empty={summary.partial ? text.emptyPartial : text.noLong}
        fetchedAt={fetchedAt}
      />
      <Format
        title={text.short}
        summary={summary.short}
        empty={summary.partial ? text.emptyPartial : text.noShorts}
        fetchedAt={fetchedAt}
      />
    </div>
  )
}

export interface LowInfoProps {
  readonly title: string
  readonly handle: string | null
  readonly busy: boolean
  readonly partial?: boolean
  readonly onNew: () => void
  readonly onReadAgain?: () => void
}

// FR-022: too little to conclude anything, so the journey of a new channel, keeping what the channel has. If YouTube
// left part of it unread, that is not the only way out: it may just be the moment.
export function LowInfo({ title, handle, busy, partial = false, onNew, onReadAgain }: LowInfoProps) {
  // What is not an @ of YouTube is not kept: it does not promise it.
  const kept = handle !== null && CHANNEL_HANDLE_PATTERN.test(handle) ? handle : null
  // With no title its name is its @, as the server keeps it. With neither, a name will be chosen.
  const name = title.trim() || kept
  return (
    <div className={styles.option}>
      <p role="status">
        <strong>{text.lowInfo}</strong>
      </p>
      <p>{!name ? text.asNewWhyNoName : kept ? text.asNewWhy : text.asNewWhyNoHandle}</p>
      {name && (
        <p>{kept ? format(text.keepsHandle, { nombre: name, arroba: kept }) : format(text.keeps, { nombre: name })}</p>
      )}
      {partial && <p>{text.readAgainWhy}</p>}
      <div className={styles.actions}>
        <Button variant="primary" loading={busy} onClick={onNew}>
          {text.asNew}
        </Button>
        {partial && onReadAgain && (
          <Button disabled={busy} onClick={onReadAgain}>
            {text.readAgain}
          </Button>
        )}
      </div>
    </div>
  )
}

export interface ReadingProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onStep: (data: object) => void
}

const isFailureCode = (code: string | null): code is YouTubeFailureCode => code !== null && code in youtubeFailuresEs

function ReadFailure({ code, onRetry }: { code: string | null; onRetry: () => void }) {
  if (!isFailureCode(code))
    return <ErrorMessage live title={es.clientError.respuesta} action={{ label: es.app.retry, onClick: onRetry }} />
  const { what, action } = youtubeFailuresEs[code]
  return (
    <>
      <ErrorMessage live title={what} action={{ label: youtubeFailureActionsEs.volver_a_intentar, onClick: onRetry }} />
      {action === 'ir_a_ajustes' && (
        <div className={styles.actions}>
          <Button onClick={() => navigate({ page: 'settings' })}>{youtubeFailureActionsEs.ir_a_ajustes}</Button>
        </div>
      )}
    </>
  )
}

// The current profile is proposed here and approved here, as any proposal, before going on (contracts/ui-screens.md).
function NextStep({ view, busy, reload, onStep }: ReadingProps) {
  const current = latestOf(view, 'perfil_actual')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'lectura_canal', !current)
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  if (current) return <CurrentSection view={view} reload={reload} proposal={current} onApproved={() => onStep({})} />
  const failed = estimateError ?? generate.error
  return (
    <div className={styles.proposal}>
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void refresh() }} />
      )}
      <AiAction
        label={text.see}
        estimate={estimate}
        failure={generate.failure}
        busy={generate.busy || busy}
        onRun={() => void generate.run('perfil_actual')}
      />
    </div>
  )
}

export function Reading({ view, busy, reload, onStep }: ReadingProps) {
  const jobs = view.jobs.filter((job) => job.kind === 'leer_canal')
  const last = jobs.at(-1) ?? null
  const [jobId, setJobId] = useState<string | null>(null)
  const watching = jobId ?? (last?.status === 'en_curso' ? last.id : null)
  const watch = useJob(watching)
  const [error, setError] = useState<unknown>(null)
  const [moving, setMoving] = useState(false)
  const reading = view.reading

  const ended = watch && watch.status !== 'en_curso' ? watch.status : null
  useEffect(() => {
    if (ended) void reload()
  }, [ended, reload])

  const start = async () => {
    setError(null)
    try {
      const { jobId: started } = await channelApi.read(view.id, {
        revision: view.revision,
        input: view.state.channelInput ?? '',
      })
      setJobId(started)
      await reload()
    } catch (caught) {
      setError(caught)
    }
  }

  const asNew = async () => {
    setMoving(true)
    setError(null)
    try {
      await channelApi.asNew(view.id, view.revision)
      // The address follows the view, which is now the new journey.
      await reload()
    } catch (caught) {
      setError(caught)
      setMoving(false)
    }
  }

  const isRunning = watch?.status === 'en_curso'
  const failure = watch?.status === 'fallido' ? watch.failure : last?.status === 'fallido' ? last.failure : null
  const interrupted = !isRunning && last?.status === 'interrumpido'

  return (
    <div className={styles.options}>
      <p className={styles.why}>{text.why}</p>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          action={{
            label: es.app.retry,
            onClick: () => {
              setError(null)
              void reload()
            },
          }}
        />
      )}
      {isRunning && <ReadingProgress done={watch.done} total={watch.total} />}
      {!isRunning && failure !== null && <ReadFailure code={failure} onRetry={() => void start()} />}
      {interrupted && !reading && (
        <div className={styles.option}>
          <p>{text.interrupted}</p>
          <Button variant="primary" onClick={() => void start()}>
            {text.resume}
          </Button>
        </div>
      )}
      {!isRunning && reading && (
        <>
          <ReadingSummaryView reading={reading} />
          {reading.summary.lowInfo ? (
            <LowInfo
              title={reading.title}
              handle={reading.handle}
              busy={moving}
              partial={reading.summary.partial}
              onNew={() => void asNew()}
              onReadAgain={() => void start()}
            />
          ) : (
            <NextStep view={view} busy={busy} reload={reload} onStep={onStep} />
          )}
        </>
      )}
    </div>
  )
}
