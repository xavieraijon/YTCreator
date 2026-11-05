import { verdictOf } from '@ytcreator/core'
import type { ChannelWarningView, MeasureView } from '@ytcreator/core/api'
import { Button, Card, DataSource, ErrorMessage, format, Semaphore, type SemaphoreState } from '@ytcreator/ui'
import { navigate } from '../../../router.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../../../strings/youtube-failures.es.ts'
import styles from '../channel.module.css'

const text = channelEs.niches
const figures = text.indicators
const DAY_MS = 86_400_000

const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)
const percent = (share: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(share * 100)

const SEMAPHORE: Record<'conviene' | 'con_reservas' | 'no_conviene', SemaphoreState> = {
  conviene: 'verde',
  con_reservas: 'ambar',
  no_conviene: 'rojo',
}

export const isStale = (measure: MeasureView, days: number, now: Date) =>
  measure.measuredAt !== null && now.getTime() - Date.parse(measure.measuredAt) > days * DAY_MS

const countText = (count: number, one: string, many: string) =>
  count === 1 ? one : format(many, { canales: number(count) })

export interface Niche {
  readonly label: string
  readonly summary: string
  readonly queries: readonly string[]
  readonly whyItFits: string
}

export interface NicheCardProps {
  readonly niche: Niche
  readonly measure: MeasureView | null
  readonly warnings?: readonly ChannelWarningView[]
  readonly chosen?: boolean
  readonly stale?: boolean
  readonly staleDays?: number
  readonly busy?: boolean
  readonly onChoose: () => void
  readonly onRetry: () => void
}

function Row({ title, level, body, date }: { title: string; level?: string; body: string; date: string }) {
  return (
    <li className={styles['indicator-row']}>
      <strong>
        {title}
        {level ? ` · ${level}` : ''}
      </strong>
      <span>{body}</span>
      <DataSource kind="youtube" date={date} />
    </li>
  )
}

export function Measured({ measure, date }: { measure: MeasureView; date: string }) {
  const shorts = measure.shortsInSample ?? 0
  return (
    <ul className={styles.figures}>
      <Row
        title={figures.demand}
        level={figures.demandLevel[measure.demandLevel!]}
        body={format(figures.demandText, { visitas: number(measure.demandMedianViews!) })}
        date={date}
      />
      <Row
        title={figures.entry}
        level={figures.entryLevel[measure.entryLevel!]}
        body={[
          countText(measure.entryChannels!, figures.entryTextOne, figures.entryText),
          ...(measure.hiddenSubscribers
            ? [countText(measure.hiddenSubscribers, figures.hiddenOne, figures.hidden)]
            : []),
          ...(measure.unreadChannels ? [countText(measure.unreadChannels, figures.unreadOne, figures.unread)] : []),
        ].join(' ')}
        date={date}
      />
      <Row
        title={figures.concentration}
        level={figures.concentrationLevel[measure.concentrationLevel!]}
        body={format(figures.concentrationText, { porcentaje: percent(measure.concentration!) })}
        date={date}
      />
      <Row
        title={figures.saturation}
        body={
          measure.recentVideos === null || measure.recentShare === null
            ? figures.saturationUnknown
            : measure.source === 'ytdlp'
              ? format(figures.saturationPartial, { videos: number(measure.recentVideos) })
              : format(figures.saturationText, {
                  videos: number(measure.recentVideos),
                  porcentaje: percent(measure.recentShare),
                })
        }
        date={date}
      />
      {shorts > 0 && (
        <Row
          title={figures.shorts}
          body={
            measure.shortsMedianViews === null
              ? format(figures.shortsText, { shorts: number(shorts) })
              : format(figures.shortsMedian, { shorts: number(shorts), visitas: number(measure.shortsMedianViews) })
          }
          date={date}
        />
      )}
    </ul>
  )
}

export function NicheCard({
  niche,
  measure,
  warnings = [],
  chosen = false,
  stale = false,
  staleDays = 90,
  busy = false,
  onChoose,
  onRetry,
}: NicheCardProps) {
  const failure = measure?.status === 'fallida' ? measure.failure : null
  const measured = measure?.status === 'medida' && measure.measuredAt ? measure : null
  const failureText = failure ? youtubeFailuresEs[failure] : null
  const verdict =
    measured?.verdict && measured.demandLevel && measured.entryLevel && measured.concentrationLevel
      ? {
          state: SEMAPHORE[measured.verdict],
          label: text.verdict[measured.verdict],
          ...verdictOf({
            demandLevel: measured.demandLevel,
            entryLevel: measured.entryLevel,
            concentrationLevel: measured.concentrationLevel,
          }),
        }
      : null

  return (
    <Card as="article" className={styles.niche} aria-label={niche.label}>
      <h2>{niche.label}</h2>
      <p>{niche.summary}</p>
      <p className={styles.why}>{niche.whyItFits}</p>
      <DataSource kind="ia" />

      {!measure || measure.status === 'en_curso' ? <p className={styles.why}>{text.pending}</p> : null}

      {failureText && (
        <ErrorMessage
          title={failureText.what}
          action={
            failureText.action === 'ir_a_ajustes'
              ? { label: youtubeFailureActionsEs.ir_a_ajustes, onClick: () => navigate({ page: 'youtubeSettings' }) }
              : { label: youtubeFailureActionsEs.volver_a_intentar, onClick: onRetry }
          }
        />
      )}

      {verdict && (
        <p>
          <Semaphore state={verdict.state}>{verdict.label}</Semaphore> {text.reason[verdict.reason]}
        </p>
      )}
      {measured && <Measured measure={measured} date={measured.measuredAt!} />}
      {measured && (
        <p className={styles.notice}>{format(figures.sample, { videos: number(measured.sampleSize ?? 0) })}</p>
      )}

      {stale && (
        <div className={styles.option}>
          <p>{format(text.stale, { dias: staleDays })}</p>
          <Button onClick={onRetry}>{text.measureAgain}</Button>
        </div>
      )}

      {warnings.map((warning) => (
        <div key={warning.code} className={styles['indicator-row']}>
          <span>{text.warnings[warning.code]}</span>
          {warning.sourceLabel && warning.reviewedAt && (
            <DataSource kind="conocimiento" label={warning.sourceLabel} date={warning.reviewedAt} />
          )}
        </div>
      ))}

      {chosen ? (
        <p>
          <Semaphore state="verde">{text.chosen}</Semaphore>
        </p>
      ) : (
        <div className={styles.actions}>
          <Button disabled={busy || !measure || measure.status === 'en_curso'} onClick={onChoose}>
            {text.choose}
          </Button>
        </div>
      )}
    </Card>
  )
}
