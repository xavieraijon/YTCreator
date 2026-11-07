import type { IdeaVerdict, VideoHit, YouTubeFailureCode } from '@ytcreator/core'
import type { AiRunFailure, EstimateView, IdeaMeasureView, IdeaView } from '@ytcreator/core/api'
import { IDEA_LIMITS } from '@ytcreator/core'
import { Button, DataSource, Disclosure, format, Semaphore, type SemaphoreState, TextArea } from '@ytcreator/ui'
import { useState } from 'react'
import { navigate } from '../../../router.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../../../strings/youtube-failures.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'

const text = ideasEs.measure
const DAY_MS = 86_400_000

// «Frío» is grey, as the spec says: the design system has no fourth color, and its grey state has its own shape.
export const VERDICT_STATE: Record<IdeaVerdict, SemaphoreState> = {
  hueco: 'verde',
  competido: 'ambar',
  quemado: 'rojo',
  frio: 'sin_comprobar',
}

// Every card has the same buttons: their accessible name says which idea, and starts with what is seen.
const named = (accion: string, titulo: string) => format(text.named, { accion, titulo })

export const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)
const day = (date: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(date))

// The sentence of the semaphore, with the figures in it (contracts/idea-measure.md, «Textos del semáforo»).
export function reasonText(measure: IdeaMeasureView, recentDays: number): string {
  const figures = measure.figures!
  return format(text.reason[measure.reason!], {
    n: number(figures.similar),
    r: number(figures.recent),
    d: number(recentDays),
    v: number(figures.medianViews ?? 0),
  })
}

export const videoLine = (video: VideoHit) =>
  format(text.video, {
    titulo: video.title,
    canal: video.channelTitle,
    visitas: video.views === null ? text.viewsUnknown : format(text.views, { n: number(video.views) }),
    fecha: video.publishedAt ? day(video.publishedAt) : text.dateUnknown,
  })

export interface MeasureBasis {
  readonly label: string
  readonly date: string
  readonly recentDays: number
  readonly audienceViews: number
}

export interface MeasureUnits {
  readonly withoutEnglish: number
  readonly withEnglish: number
}

// An idea is measured with the search of its concrete topic and of its general one (entry 37).
export const isMeasurable = (idea: Pick<IdeaView, 'query' | 'broadQuery'>) =>
  (idea.query ?? '').trim() !== '' && (idea.broadQuery ?? '').trim() !== ''

export const unitsOf = (idea: Pick<IdeaView, 'queryEn'>, units: MeasureUnits) =>
  idea.queryEn ? units.withEnglish : units.withoutEnglish

// What a failure says on an idea: the texts of 003 that speak of a channel or a link are said for a search here.
export const failureText = (failure: YouTubeFailureCode) => text.failure[failure] ?? youtubeFailuresEs[failure].what

/** «Preparar la medida» on the card: the AI writes the three searches (R6). */
export interface CardPrepare {
  /** This card is the one being prepared: the button with its cost shows. */
  readonly open: boolean
  readonly estimate: EstimateView | null
  readonly failure: AiRunFailure | null
  readonly busy: boolean
  readonly onOpen: () => void
  readonly onRun: (instructions?: string) => void
}

// Only a burnt or competed idea is offered another angle (FR-011, US3 AS3).
export const offersAngles = (measure: IdeaMeasureView | null) =>
  measure?.status === 'medida' && (measure.verdict === 'quemado' || measure.verdict === 'competido')

export interface IdeaMeasureProps {
  readonly idea: IdeaView
  readonly basis: MeasureBasis
  /** Units of the Data API for one idea; null with yt-dlp. */
  readonly units?: MeasureUnits | null
  readonly now: Date
  /** A measure of this idea is running (or another «Medir todas» is). */
  readonly busy: boolean
  readonly prepare?: CardPrepare | undefined
  /** «Buscar otro enfoque»: the same two steps, first the button, then its cost (US3 AS1). */
  readonly angles?: CardPrepare | undefined
  /** The title is a search: «Medir con el título» is offered only then. */
  readonly canUseTitle?: boolean
  readonly onMeasure: (fresh: boolean) => void
  readonly onMeasureWithTitle: () => void
}

function Videos({ videos }: { videos: readonly VideoHit[] }) {
  return (
    <ul className={styles.figures}>
      {videos.map((video) => (
        <li key={video.videoId}>{videoLine(video)}</li>
      ))}
    </ul>
  )
}

const daysText = (days: number) => (days === 1 ? text.staleOne : format(text.stale, { n: number(days) }))

// What YouTube says about one idea, and how to ask it (contracts/ui-screens.md, «Lista de ideas»).
export function IdeaMeasure({
  idea,
  basis,
  units = null,
  now,
  busy,
  prepare,
  angles,
  canUseTitle = true,
  onMeasure,
  onMeasureWithTitle,
}: IdeaMeasureProps) {
  const [instructions, setInstructions] = useState('')
  const { measure } = idea
  const measured = measure?.status === 'medida' ? measure : null
  const failure = measure?.status === 'fallida' ? measure.failure : null
  const opportunity = measured?.opportunity ?? null
  const days = measure ? Math.floor((now.getTime() - Date.parse(measure.measuredAt)) / DAY_MS) : 0
  const measurable = isMeasurable(idea)
  // A failed measure leaves the idea unmeasured, with the failure said (US2 AS3): it can always be measured again.
  const again = measured !== null

  return (
    <div className={styles.option}>
      {measured ? (
        <>
          <p>
            <Semaphore state={VERDICT_STATE[measured.verdict!]}>{text.verdict[measured.verdict!]}</Semaphore>{' '}
            {reasonText(measured, basis.recentDays)}
          </p>
          <p className={styles.notice}>{text.assumption}</p>
          <p>
            <DataSource kind="youtube" date={measured.measuredAt} />{' '}
            <DataSource kind="conocimiento" label={text.basisLabel} date={basis.date} />
          </p>
          {measured.partial && <p className={styles.notice}>{text.partial}</p>}
          {opportunity && 'english' in opportunity && opportunity.english && (
            <p className={styles.notice}>{format(text.opportunity, { v: number(basis.audienceViews) })}</p>
          )}
          {!opportunity && <p className={styles.why}>{text.englishMissing}</p>}
          {opportunity && 'failure' in opportunity && <p className={styles.why}>{text.englishFailed}</p>}
          <Disclosure summary={text.similar}>
            {measured.similarVideos.length > 0 ? <Videos videos={measured.similarVideos} /> : <p>{text.noSimilar}</p>}
            {opportunity && 'english' in opportunity && opportunity.topVideos.length > 0 && (
              <>
                <h4>{text.english}</h4>
                <Videos videos={opportunity.topVideos} />
              </>
            )}
          </Disclosure>
          {angles &&
            offersAngles(measured) &&
            !idea.measuredOlderRevision &&
            idea.status !== 'archivada' &&
            (angles.open ? (
              <>
                <p className={styles.why}>{text.anglesWhy}</p>
                <TextArea
                  label={text.anglesInstructions}
                  description={text.anglesInstructionsHelp}
                  optional
                  rows={2}
                  maxLength={IDEA_LIMITS.instructions}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                />
                <AiAction
                  label={text.angles}
                  estimate={angles.estimate}
                  failure={angles.failure}
                  busy={angles.busy}
                  primary={false}
                  disabled={busy}
                  onRun={() => angles.onRun(instructions.trim() || undefined)}
                />
              </>
            ) : (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  aria-label={named(text.angles, idea.title)}
                  disabled={busy}
                  onClick={angles.onOpen}
                >
                  {text.angles}
                </Button>
              </div>
            ))}
        </>
      ) : (
        <p>
          <Semaphore state="sin_comprobar">{text.unmeasured}</Semaphore>
        </p>
      )}

      {failure && <p className={styles.notice}>{failureText(failure)}</p>}
      {idea.stale && <p className={styles.notice}>{daysText(days)}</p>}
      {idea.measuredOlderRevision && <p className={styles.notice}>{text.olderRevision}</p>}

      {measurable ? (
        <>
          {units && <p className={styles.why}>{format(text.unitsOne, { unidades: number(unitsOf(idea, units)) })}</p>}
          <div className={styles.actions}>
            <Button
              loading={busy}
              disabled={busy}
              aria-label={named(again ? text.again : text.check, idea.title)}
              onClick={() => onMeasure(measure !== null)}
            >
              {again ? text.again : text.check}
            </Button>
            {failure && youtubeFailuresEs[failure].action === 'ir_a_ajustes' && (
              <Button
                variant="ghost"
                aria-label={named(youtubeFailureActionsEs.ir_a_ajustes, idea.title)}
                onClick={() => navigate({ page: 'youtubeSettings' })}
              >
                {youtubeFailureActionsEs.ir_a_ajustes}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={styles.why}>{text.noQuery}</p>
          {prepare?.open ? (
            <>
              <p className={styles.why}>{text.prepareWhy}</p>
              <AiAction
                label={text.prepare}
                estimate={prepare.estimate}
                failure={prepare.failure}
                busy={prepare.busy}
                primary={false}
                disabled={busy}
                onRun={prepare.onRun}
              />
            </>
          ) : (
            prepare && (
              <div className={styles.actions}>
                <Button aria-label={named(text.check, idea.title)} disabled={busy} onClick={prepare.onOpen}>
                  {text.check}
                </Button>
              </div>
            )
          )}
          {canUseTitle && (
            <>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  loading={busy}
                  disabled={busy}
                  aria-label={named(text.useTitle, idea.title)}
                  onClick={onMeasureWithTitle}
                >
                  {text.useTitle}
                </Button>
              </div>
              <p className={styles.why}>{text.useTitleWhy}</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
