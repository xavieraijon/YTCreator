import { IDEA_LIMITS, type IdeaFormat, moveAmong } from '@ytcreator/core'
import type {
  AiRunFailure,
  EstimateView,
  IdeaBankView,
  IdeaMeasureView,
  IdeaView,
  MeasureEstimateView,
  NewIdeaBody,
} from '@ytcreator/core/api'
import { Button, Disclosure, ErrorMessage, format, ProgressBar, TextArea, useToast } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, channelApi, ideasApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { useJob } from '../../../shell/useJob.ts'
import { es } from '../../../strings/es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { IdeaBatch } from './IdeaBatch.tsx'
import { IdeaCard } from './IdeaCard.tsx'
import { IdeaEditor, type PrepareMeasure } from './IdeaEditor.tsx'
import { IdeaMeasure, isMeasurable, number, unitsOf } from './IdeaMeasure.tsx'
import {
  type Direction,
  type IdeaMove,
  IdeaMoves,
  IdeaQueue,
  OrderButtons,
  type OrderList,
  orderKey,
} from './IdeaQueue.tsx'
import { Archive, Downloads, Filters, filterIdeas, NO_FILTERS } from './IdeaShelf.tsx'

const text = ideasEs.bank
const measureText = ideasEs.measure

// A channel without its profile: the ideas are written for it (US1 AS5).
const isWithoutProfile = (error: unknown) =>
  error instanceof ApiClientError && error.body?.fields?.['profile'] === 'sin_perfil'

// «Medir con el título»: the title as a search, without what YouTube would read as quotes or operators.
export function asSearch(text: string): string {
  return text
    .replace(/["“”«»]/g, ' ')
    .replace(/(^|\s)[-+](?=\S)/g, '$1')
    .replace(/\||\bor\b/gi, ' ')
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, IDEA_LIMITS.query)
    .trim()
}

// The ideas «Medir todas» measures: those without a measure, a failed one included (it leaves the idea unmeasured,
// US2 AS3), that are not done yet (entry 39).
export const unmeasuredOf = (bank: IdeaBankView) =>
  bank.ideas
    .filter((idea) => (idea.measure === null || idea.measure.status === 'fallida') && idea.status !== 'hecha')
    .map((idea) => idea.id)

// What the units of a set of ideas add up to, with the Data API.
const unitsOfIdeas = (bank: IdeaBankView, ids: readonly string[]) =>
  bank.measureUnits
    ? bank.ideas
        .filter((idea) => ids.includes(idea.id) && isMeasurable(idea))
        .reduce((sum, idea) => sum + unitsOf(idea, bank.measureUnits!), 0)
    : null

const countText = (n: number) => (n === 1 ? measureText.countOne : format(measureText.count, { n: number(n) }))

export type IdeaBankState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'noProfile' }
  | {
      readonly kind: 'ready'
      readonly channelId: string
      readonly pillars: readonly string[]
      /** The niche of the profile: the general topic of «Medir con el título» for an idea without a pillar. */
      readonly niche: string
      readonly defaultFormat: IdeaFormat
      readonly bank: IdeaBankView
    }

export interface MeasureControls {
  /** The «Medir todas» or «¿Tiene hueco?» running now. */
  readonly job: { readonly done: number; readonly total: number } | null
  /** What «Medir todas» would do with the ideas not measured yet. */
  readonly estimate: MeasureEstimateView | null
  /** What the last measure said, for the polite live region. */
  readonly announcement: string
  readonly now: Date
  readonly onMeasure: (ideaIds: string[], fresh: boolean) => void
  readonly onMeasureWithTitle: (idea: IdeaView) => void
  /** «Preparar la medida» from the card of an idea without its searches (R6). */
  readonly prepare?: CardAi
  /** «Buscar otro enfoque» from the card of a burnt or competed idea (US3). */
  readonly angles?: CardAi
}

/** An AI action of one card: first its button, then the same button with its cost. */
export interface CardAi {
  readonly ideaId: string | null
  readonly estimate: EstimateView | null
  readonly failure: AiRunFailure | null
  readonly busy: boolean
  readonly onOpen: (ideaId: string) => void
  readonly onRun: (instructions?: string) => void
}

const cardAiOf = (action: CardAi | undefined, ideaId: string) =>
  action
    ? {
        open: action.ideaId === ideaId,
        estimate: action.estimate,
        failure: action.failure,
        busy: action.busy,
        onOpen: () => action.onOpen(ideaId),
        onRun: action.onRun,
      }
    : undefined

/** US4: the queue, the order, the moves, the archive and the downloads. */
export interface OrderControls {
  readonly archived: readonly IdeaView[]
  readonly busy: boolean
  /** «Movida a la posición {n}», for the live region. */
  readonly announcement: string
  /** `visible` are the ideas of that list on screen, the filters applied: the move passes the one seen next to it. */
  readonly onMove: (list: OrderList, ideaId: string, direction: Direction, visible: readonly string[]) => void
  readonly onStatus: (idea: IdeaView, status: IdeaMove) => void
  readonly onDownload: (format: 'md' | 'json') => void
}

export interface IdeaBankContentProps {
  readonly state: IdeaBankState
  readonly estimate?: EstimateView | null
  readonly failure?: AiRunFailure | null
  readonly proposing?: boolean
  readonly deciding?: boolean
  readonly saving?: boolean
  readonly editing?: string | null
  /** Changes only when an idea of the creator is saved: the empty form comes back then, and only then. */
  readonly formKey?: number
  readonly measure?: MeasureControls
  readonly order?: OrderControls
  /** «Preparar la medida» of the idea being changed. */
  readonly prepare?: PrepareMeasure | undefined
  readonly onPropose?: (instructions?: string) => void
  readonly onDecide?: (keep: number[], discard: number[]) => void
  /** «Me la quedo» of the angles of «Buscar otro enfoque». */
  readonly onDecideAngles?: (batchId: string, keep: number[], discard: number[]) => void
  readonly onCreate?: (body: NewIdeaBody) => void
  readonly onEdit?: (ideaId: string | null) => void
  readonly onChange?: (idea: IdeaView, body: NewIdeaBody & { notes?: string }) => void
}

const noop = () => {}
const NO_MEASURE: MeasureControls = {
  job: null,
  estimate: null,
  announcement: '',
  now: new Date(0),
  onMeasure: noop,
  onMeasureWithTitle: noop,
}
const NO_ORDER: OrderControls = {
  archived: [],
  busy: false,
  announcement: '',
  onMove: noop,
  onStatus: noop,
  onDownload: noop,
}

// What the bank shows for each state, without the requests (tested on its own).
export function IdeaBankContent(props: IdeaBankContentProps) {
  const { state } = props
  if (state.kind === 'noProfile') {
    return (
      <div className={styles.option}>
        <p>{text.noProfile}</p>
        <Button variant="primary" onClick={() => navigate({ page: 'channelStart' })}>
          {text.goToProfile}
        </Button>
      </div>
    )
  }
  if (state.kind === 'loading') return <p className={styles.why}>{es.app.loading}</p>
  return <ReadyBank {...props} state={state} />
}

function MeasureAll({ bank, measure, primary }: { bank: IdeaBankView; measure: MeasureControls; primary: boolean }) {
  const { job, estimate } = measure
  if (job) {
    return (
      <div className={styles.option}>
        <ProgressBar
          label={
            job.total === 1
              ? measureText.progressOne
              : format(measureText.progress, { hecho: number(job.done), total: number(job.total) })
          }
          value={job.total > 0 ? (job.done / job.total) * 100 : 0}
        />
        <p className={styles.why}>{measureText.progressNote}</p>
      </div>
    )
  }
  if (bank.interrupted) {
    const left = bank.interrupted.ideaIds
    const units = unitsOfIdeas(bank, left)
    return (
      <div className={styles.option}>
        <p className={styles.notice}>{measureText.interrupted}</p>
        <p className={styles.why}>{countText(left.length)}</p>
        {units !== null && (
          <p className={styles.notice}>
            {format(left.length === 1 ? measureText.unitsOne : measureText.units, { unidades: number(units) })}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant={primary ? 'primary' : 'secondary'} onClick={() => measure.onMeasure(left, false)}>
            {measureText.resume}
          </Button>
        </div>
      </div>
    )
  }
  const unmeasured = unmeasuredOf(bank)
  if (unmeasured.length === 0 || !estimate || estimate.measurable === 0) return null
  const skipped = estimate.ideas - estimate.measurable
  return (
    <div className={styles.option}>
      <p className={styles.why}>{countText(estimate.measurable)}</p>
      {estimate.units !== null && (
        <p className={styles.notice}>
          {format(estimate.measurable === 1 ? measureText.unitsOne : measureText.units, {
            unidades: number(estimate.units),
          })}
        </p>
      )}
      {skipped > 0 && <p className={styles.why}>{skipped === 1 ? measureText.skippedOne : measureText.skipped}</p>}
      <div className={styles.actions}>
        <Button variant={primary ? 'primary' : 'secondary'} onClick={() => measure.onMeasure(unmeasured, false)}>
          {measureText.measureAll}
        </Button>
      </div>
    </div>
  )
}

function ReadyBank({
  state,
  estimate = null,
  failure = null,
  proposing = false,
  deciding = false,
  saving = false,
  editing = null,
  formKey = 0,
  measure = NO_MEASURE,
  order = NO_ORDER,
  prepare,
  onPropose = noop,
  onDecide = noop,
  onDecideAngles = noop,
  onCreate = noop,
  onEdit = noop,
  onChange = noop,
}: IdeaBankContentProps & { state: Extract<IdeaBankState, { kind: 'ready' }> }) {
  const [instructions, setInstructions] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  const { bank, pillars, defaultFormat, niche } = state
  const empty = bank.ideas.length === 0
  // The idea being changed, or with angles waiting, stays in sight whatever the filters say.
  const kept = new Set([editing, ...bank.pendingAngles.map((batch) => batch.sourceIdeaId)])
  const passing = new Set(filterIdeas(bank.ideas, filters).map((idea) => idea.id))
  const shown = bank.ideas.filter((idea) => passing.has(idea.id) || kept.has(idea.id))
  const shownIds = shown.map((idea) => idea.id)
  const queue = bank.queue.flatMap((id) => bank.ideas.find((idea) => idea.id === id) ?? [])
  const titleOf = (id: string | null) => bank.ideas.find((idea) => idea.id === id)?.title ?? null
  // The angles wait by the idea they came from, one set per idea; with that idea out of the bank, under the list.
  const anglesOf = (sourceIdeaId: string | null, sourceTitle: string | null) =>
    bank.pendingAngles
      .filter((batch) => batch.sourceIdeaId === sourceIdeaId || (sourceIdeaId === null && !titleOf(batch.sourceIdeaId)))
      .map((batch) => (
        <IdeaBatch
          key={batch.id}
          batch={batch}
          sourceTitle={sourceTitle}
          nested={sourceIdeaId !== null}
          estimate={null}
          failure={null}
          busy={measure.angles?.busy ?? false}
          deciding={deciding}
          onDecide={(keep, discard) => onDecideAngles(batch.id, keep, discard)}
          // «Proponer otras variantes» opens the request in the card, with its instructions and its cost.
          {...(sourceIdeaId !== null && measure.angles ? { onAgain: () => measure.angles!.onOpen(sourceIdeaId) } : {})}
        />
      ))
  // With ideas to measure, measuring is the main action; with the bank empty, proposing (contracts/ui-screens.md).
  const canMeasureAll =
    measure.job === null &&
    (bank.interrupted !== null || (unmeasuredOf(bank).length > 0 && (measure.estimate?.measurable ?? 0) > 0))
  return (
    <>
      <p className={styles.why}>{text.why}</p>
      <MeasureAll bank={bank} measure={measure} primary={canMeasureAll && !bank.pendingBatch} />
      <p role="status" className={styles.why}>
        {measure.announcement}
      </p>
      {bank.pendingBatch ? (
        <IdeaBatch
          batch={bank.pendingBatch}
          estimate={estimate}
          failure={failure}
          busy={proposing}
          deciding={deciding}
          onDecide={onDecide}
          onAgain={(instructions) => onPropose(instructions)}
        />
      ) : (
        <div className={styles.option}>
          {!empty && (
            <TextArea
              label={text.instructions}
              description={text.instructionsHelp}
              optional
              maxLength={IDEA_LIMITS.instructions}
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          )}
          <AiAction
            label={empty ? text.propose : text.proposeMore}
            estimate={estimate}
            failure={failure}
            busy={proposing}
            // With nothing to measure, proposing is the main action again (contracts/ui-screens.md).
            primary={empty || !canMeasureAll}
            onRun={() => onPropose(empty ? undefined : instructions)}
          />
        </div>
      )}
      <p role="status" className={styles.why}>
        {order.announcement}
      </p>
      {!empty && (
        <IdeaQueue
          ideas={queue}
          busy={order.busy}
          onMove={(ideaId, direction) => order.onMove('queue', ideaId, direction, bank.queue)}
          onRemove={(idea) => order.onStatus(idea, 'banco')}
        />
      )}
      <section aria-label={text.listTitle}>
        <h2 tabIndex={-1} data-ideas-title>
          {text.listTitle}
        </h2>
        {!empty && <Filters filters={filters} shown={shown.length} total={bank.ideas.length} onChange={setFilters} />}
        {empty ? (
          <p>{text.empty}</p>
        ) : shown.length === 0 ? (
          <p>{ideasEs.filters.none}</p>
        ) : (
          <ul className={styles.options}>
            {shown.map((idea, index) =>
              editing === idea.id ? (
                <li key={idea.id} className={styles.option}>
                  <h3>{ideasEs.editor.editTitle}</h3>
                  <IdeaEditor
                    pillars={pillars}
                    idea={idea}
                    busy={saving}
                    prepare={prepare}
                    onSave={(body) => onChange(idea, body)}
                    onCancel={() => onEdit(null)}
                  />
                  {anglesOf(idea.id, idea.title)}
                </li>
              ) : (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  sourceTitle={titleOf(idea.sourceIdeaId)}
                  onEdit={() => onEdit(idea.id)}
                  actions={
                    <>
                      <IdeaMoves idea={idea} busy={order.busy} onStatus={(status) => order.onStatus(idea, status)} />
                      <OrderButtons
                        list="bank"
                        idea={idea}
                        first={index === 0}
                        last={index === shown.length - 1}
                        busy={order.busy}
                        onMove={(direction) => order.onMove('bank', idea.id, direction, shownIds)}
                      />
                    </>
                  }
                >
                  <IdeaMeasure
                    idea={idea}
                    basis={bank.measureBasis}
                    units={bank.measureUnits}
                    now={measure.now}
                    busy={measure.job !== null}
                    canUseTitle={asSearch(idea.title) !== '' && asSearch(idea.pillar ?? niche) !== ''}
                    prepare={cardAiOf(measure.prepare, idea.id)}
                    angles={cardAiOf(measure.angles, idea.id)}
                    onMeasure={(fresh) => measure.onMeasure([idea.id], fresh)}
                    onMeasureWithTitle={() => measure.onMeasureWithTitle(idea)}
                  />
                  {anglesOf(idea.id, idea.title)}
                </IdeaCard>
              ),
            )}
          </ul>
        )}
        {anglesOf(null, null)}
      </section>
      <Disclosure summary={ideasEs.editor.open}>
        <IdeaEditor key={formKey} pillars={pillars} defaultFormat={defaultFormat} busy={saving} onSave={onCreate} />
      </Disclosure>
      <Archive ideas={order.archived} busy={order.busy} onRecover={(idea) => order.onStatus(idea, 'banco')} />
      {!empty && <Downloads onDownload={order.onDownload} />}
    </>
  )
}

interface MeasureItem {
  readonly ideaId: string
  readonly measure: IdeaMeasureView
}

const sayMeasured = (title: string, measure: IdeaMeasureView) =>
  measure.verdict
    ? format(measureText.measured, { titulo: title, semaforo: measureText.verdict[measure.verdict] })
    : format(measureText.failed, { titulo: title })

const isMeasureItem = (item: unknown): item is MeasureItem =>
  typeof item === 'object' && item !== null && 'ideaId' in item && 'measure' in item

// /canal/ideas (contracts/ui-screens.md, «Banco»).
export function IdeaBank() {
  const { toast } = useToast()
  const [state, setState] = useState<IdeaBankState>({ kind: 'loading' })
  const [error, setError] = useState<unknown>(null)
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  const [failure, setFailure] = useState<AiRunFailure | null>(null)
  const [proposing, setProposing] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [measureEstimate, setMeasureEstimate] = useState<MeasureEstimateView | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [prepareEstimate, setPrepareEstimate] = useState<EstimateView | null>(null)
  const [prepareFailure, setPrepareFailure] = useState<AiRunFailure | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareFor, setPrepareFor] = useState<string | null>(null)
  const [prepareTurn, setPrepareTurn] = useState(0)
  // «Buscar otro enfoque»: the idea whose angles are being asked for, and their estimate.
  const [anglesFor, setAnglesFor] = useState<string | null>(null)
  const [anglesEstimate, setAnglesEstimate] = useState<EstimateView | null>(null)
  const [anglesFailure, setAnglesFailure] = useState<AiRunFailure | null>(null)
  const [anglesBusy, setAnglesBusy] = useState(false)
  const [anglesTurn, setAnglesTurn] = useState(0)
  // US4: the archive, a move on its way and what it said.
  const [archived, setArchived] = useState<IdeaView[]>([])
  const [ordering, setOrdering] = useState(false)
  const [orderAnnouncement, setOrderAnnouncement] = useState('')
  const focusAfter = useRef<string | null>(null)
  const channelId = state.kind === 'ready' ? state.channelId : null
  const bank = state.kind === 'ready' ? state.bank : null
  const asked = useRef(0)
  const seen = useRef(0)
  // The ideas of the measure this tab started, and whether any of them came by SSE.
  const requested = useRef<string[]>([])
  const announced = useRef(false)
  const watch = useJob(jobId)

  const load = useCallback(async () => {
    setError(null)
    try {
      const current = await channelApi.current()
      if (!current.channel || !current.profile) {
        setState({ kind: 'noProfile' })
        return
      }
      const [loaded, archive] = await Promise.all([
        ideasApi.list(current.channel.id),
        ideasApi.archived(current.channel.id),
      ])
      setArchived(archive)
      const { concept } = current.profile.profile
      const pillars = concept.pillars.map((pillar) => pillar.title)
      const onlyShorts = concept.cadence.longPerWeek === 0 && concept.cadence.shortsPerWeek > 0
      setState({
        kind: 'ready',
        channelId: current.channel.id,
        pillars,
        niche: current.profile.profile.niche.label,
        defaultFormat: onlyShorts ? 'short' : 'largo',
        bank: loaded,
      })
      // A measure still running in the server (another tab, or this one before a reload) is followed again.
      setJobId(loaded.runningJob)
    } catch (caught) {
      if (isWithoutProfile(caught)) setState({ kind: 'noProfile' })
      else setError(caught)
    }
  }, [])

  const reload = useCallback(async () => {
    if (!channelId) return null
    const loaded = await ideasApi.list(channelId)
    setState((current) => (current.kind === 'ready' ? { ...current, bank: loaded } : current))
    return loaded
  }, [channelId])

  // After a move the focus goes back to the same button of the same idea (contracts/ui-screens.md).
  useEffect(() => {
    if (!focusAfter.current) return
    const target = focusAfter.current.startsWith('card:')
      ? (document.querySelector<HTMLElement>(`[data-card="${focusAfter.current.slice(5)}"]`) ??
        document.querySelector<HTMLElement>('[data-ideas-title]'))
      : document.querySelector<HTMLElement>(`[data-order="${focusAfter.current}"]`)
    target?.focus()
    focusAfter.current = null
  }, [state])

  // Each estimate serves one call: a fresh one after every batch (contracts/cost.md).
  const refreshEstimate = useCallback(async (id: string) => {
    const turn = ++asked.current
    setEstimate(null)
    try {
      const fresh = await ideasApi.estimate(id, 'ideas')
      if (turn === asked.current) setEstimate(fresh)
    } catch (caught) {
      if (turn === asked.current) setError(caught)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (channelId) void refreshEstimate(channelId)
  }, [channelId, refreshEstimate])

  // What «Medir todas» would measure, and its units with the Data API (FR-007c).
  const unmeasuredKey = bank ? unmeasuredOf(bank).join(',') : ''
  useEffect(() => {
    if (!channelId || unmeasuredKey === '') {
      setMeasureEstimate(null)
      return
    }
    let current = true
    ideasApi
      .measureEstimate(channelId, unmeasuredKey.split(','))
      .then((fresh) => current && setMeasureEstimate(fresh))
      .catch(() => current && setMeasureEstimate(null))
    return () => {
      current = false
    }
  }, [channelId, unmeasuredKey])

  // Each measure that arrives is shown at once and said once, politely (contracts/ui-screens.md).
  const items = watch?.items ?? []
  const titles = useRef(new Map<string, string>())
  titles.current = new Map((bank?.ideas ?? []).map((idea) => [idea.id, idea.title]))
  useEffect(() => {
    const fresh = items.slice(seen.current).filter(isMeasureItem)
    seen.current = items.length
    if (fresh.length === 0) return
    setState((current) => {
      if (current.kind !== 'ready') return current
      const ideas = current.bank.ideas.map((idea) => {
        const item = fresh.findLast((one) => one.ideaId === idea.id)
        return item ? { ...idea, measure: item.measure, stale: false, measuredOlderRevision: false } : idea
      })
      return { ...current, bank: { ...current.bank, ideas } }
    })
    // Each idea that arrived is said, even when several come at once.
    const said = fresh.flatMap((item) => {
      const title = titles.current.get(item.ideaId)
      return title ? [sayMeasured(title, item.measure)] : []
    })
    if (said.length > 0) {
      announced.current = true
      setAnnouncement(said.join(' '))
    }
  }, [items])

  // The job ended: what the server has is the truth.
  const status = watch?.status
  useEffect(() => {
    if (status !== 'hecho' && status !== 'fallido') return
    setJobId(null)
    seen.current = 0
    const ids = requested.current
    const missed = !announced.current
    requested.current = []
    announced.current = false
    void reload().then((loaded) => {
      // A short job can end before this tab listens: what it measured is still said, once per idea.
      if (!loaded || !missed) return
      const said = ids.flatMap((id) => {
        const idea = loaded.ideas.find((one) => one.id === id)
        return idea?.measure ? [sayMeasured(idea.title, idea.measure)] : []
      })
      if (said.length > 0) setAnnouncement(said.join(' '))
    })
  }, [status, reload])

  // «Reintentar» asks for the estimate again too: without it the button to propose would stay off.
  const retry = async () => {
    await load()
    if (channelId) void refreshEstimate(channelId)
  }

  const measure = async (ideaIds: string[], fresh: boolean) => {
    if (!channelId) return
    setError(null)
    try {
      const started = await ideasApi.measure(channelId, ideaIds, fresh)
      seen.current = 0
      requested.current = ideaIds
      announced.current = false
      setJobId(started.jobId)
    } catch (caught) {
      // Another tab is measuring: that one is followed instead of starting a second, and it says so.
      if (caught instanceof ApiClientError && caught.body?.jobId) {
        toast({ title: measureText.otherRunning, tone: 'warning' })
        setJobId(caught.body.jobId)
      } else setError(caught)
    }
  }

  // An idea of the creator's without its searches: the title, and as the general topic its pillar or the niche of
  // the channel (T042, entry 37). A search the idea already has is kept.
  const measureWithTitle = async (idea: IdeaView) => {
    if (state.kind !== 'ready') return
    setError(null)
    try {
      await ideasApi.change(idea.id, {
        revision: idea.revision,
        query: idea.query ?? asSearch(idea.title),
        broadQuery: idea.broadQuery ?? asSearch(idea.pillar ?? state.niche),
      })
    } catch (caught) {
      await conflictOr(caught)
      return
    }
    await reload()
    await measure([idea.id], false)
  }

  const propose = async (instructions?: string) => {
    if (!channelId || !estimate) return
    setProposing(true)
    setFailure(null)
    setError(null)
    try {
      const outcome = await ideasApi.propose(channelId, {
        estimateId: estimate.estimateId,
        ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
      })
      if ('failure' in outcome) setFailure(outcome.failure)
      // Every candidate repeated an idea: there is nothing new to show, and it says so (R9).
      else if (outcome.candidates.length === 0) toast({ title: text.allRepeated, tone: 'warning' })
      await reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setProposing(false)
      void refreshEstimate(channelId)
    }
  }

  const decide = async (keep: number[], discard: number[], anglesId?: string) => {
    const batch = anglesId ? bank?.pendingAngles.find((one) => one.id === anglesId) : bank?.pendingBatch
    if (!batch) return
    setDeciding(true)
    setError(null)
    try {
      await ideasApi.decide(batch.id, { keep, discard })
      await reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setDeciding(false)
    }
  }

  const create = async (body: NewIdeaBody) => {
    if (!channelId) return
    setSaving(true)
    setError(null)
    try {
      const { duplicateOf } = await ideasApi.create(channelId, body)
      // The twin may be archived, so not on screen: its title is the same one, written perhaps another way.
      const twin = bank?.ideas.find((idea) => idea.id === duplicateOf)
      toast({
        title: duplicateOf
          ? format(ideasEs.editor.duplicate, { titulo: twin?.title ?? body.title })
          : ideasEs.editor.saved,
        tone: duplicateOf ? 'warning' : 'success',
      })
      setFormKey((key) => key + 1)
      await reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setSaving(false)
    }
  }

  const conflictOr = async (caught: unknown) => {
    // Changed in another tab: what is there now is shown, nothing is overwritten.
    if (caught instanceof ApiClientError && caught.body?.code === 'conflicto') {
      toast({ title: ideasEs.editor.conflict, tone: 'warning' })
      setEditing(null)
      await reload()
    } else setError(caught)
  }

  const change = async (idea: IdeaView, body: NewIdeaBody & { notes?: string }) => {
    setSaving(true)
    setError(null)
    try {
      await ideasApi.change(idea.id, { revision: idea.revision, ...body })
      setEditing(null)
      await reload()
    } catch (caught) {
      await conflictOr(caught)
    } finally {
      setSaving(false)
    }
  }

  // «Preparar la medida» has its own estimate, for the idea being changed or the card that asked for it. Each
  // estimate serves one call: after a failure another one is asked for, or «Reintentar» could never work.
  const prepareTarget = editing ?? prepareFor
  useEffect(() => {
    setPrepareEstimate(null)
    if (!channelId || !prepareTarget) return
    let current = true
    ideasApi
      .estimate(channelId, 'busquedas_idea', prepareTarget)
      .then((fresh) => current && setPrepareEstimate(fresh))
      .catch((caught) => current && setError(caught))
    return () => {
      current = false
    }
  }, [channelId, prepareTarget, prepareTurn])
  useEffect(() => setPrepareFailure(null), [prepareTarget])

  const targetIdea = bank?.ideas.find((idea) => idea.id === prepareTarget) ?? null
  const prepareQueries = async () => {
    if (!targetIdea || !prepareEstimate) return
    setPreparing(true)
    setPrepareFailure(null)
    try {
      const outcome = await ideasApi.queries(targetIdea.id, {
        estimateId: prepareEstimate.estimateId,
        revision: targetIdea.revision,
      })
      if ('failure' in outcome) {
        setPrepareFailure(outcome.failure)
        setPrepareTurn((turn) => turn + 1)
      } else {
        toast({ title: ideasEs.editor.prepared, tone: 'success' })
        setEditing(null)
        setPrepareFor(null)
        await reload()
      }
    } catch (caught) {
      await conflictOr(caught)
      setPrepareTurn((turn) => turn + 1)
    } finally {
      setPreparing(false)
    }
  }

  // The estimate of «Buscar otro enfoque» is for its idea: a new one after every call, as with the others.
  useEffect(() => {
    setAnglesEstimate(null)
    if (!channelId || !anglesFor) return
    let current = true
    ideasApi
      .estimate(channelId, 'otro_enfoque', anglesFor)
      .then((fresh) => current && setAnglesEstimate(fresh))
      .catch((caught) => current && setError(caught))
    return () => {
      current = false
    }
  }, [channelId, anglesFor, anglesTurn])
  useEffect(() => setAnglesFailure(null), [anglesFor])

  const askAngles = async (instructions?: string) => {
    if (!anglesFor || !anglesEstimate) return
    setAnglesBusy(true)
    setAnglesFailure(null)
    setError(null)
    try {
      const outcome = await ideasApi.angles(anglesFor, {
        estimateId: anglesEstimate.estimateId,
        ...(instructions ? { instructions } : {}),
      })
      if ('failure' in outcome) {
        setAnglesFailure(outcome.failure)
        setAnglesTurn((turn) => turn + 1)
        return
      }
      if (outcome.candidates.length === 0) toast({ title: ideasEs.batch.anglesAllRepeated, tone: 'warning' })
      setAnglesFor(null)
      await reload()
    } catch (caught) {
      setError(caught)
      setAnglesTurn((turn) => turn + 1)
    } finally {
      setAnglesBusy(false)
    }
  }

  // Another tab changed the bank: the server refuses the move (`validacion`). What is there now is shown, and said.
  const staleOr = async (caught: unknown) => {
    if (!(caught instanceof ApiClientError && caught.body?.code === 'validacion') || !channelId) {
      await conflictOr(caught)
      return
    }
    try {
      const [, archive] = await Promise.all([reload(), ideasApi.archived(channelId)])
      setArchived(archive)
      toast({ title: ideasEs.order.stale, tone: 'warning' })
    } catch (again) {
      setError(again)
    }
  }

  // «Subir» and «Bajar», of the bank or of the queue. With filters on, the idea passes the one seen next to it.
  const move = async (list: OrderList, ideaId: string, direction: Direction, visible: readonly string[]) => {
    if (!channelId || !bank || ordering) return
    const all = list === 'bank' ? bank.ideas.map((idea) => idea.id) : bank.queue
    const ids = moveAmong(all, visible, ideaId, direction)
    if (ids.every((id, index) => id === all[index])) return
    setOrdering(true)
    setError(null)
    try {
      if (list === 'bank') {
        const { ideas } = await ideasApi.order(channelId, ids)
        setState((current) => (current.kind === 'ready' ? { ...current, bank: { ...current.bank, ideas } } : current))
      } else {
        const { queue } = await ideasApi.queue(channelId, ids)
        setState((current) => (current.kind === 'ready' ? { ...current, bank: { ...current.bank, queue } } : current))
      }
      const place = visible.indexOf(ideaId) + (direction === 'up' ? 0 : 2)
      focusAfter.current = orderKey(list, ideaId, direction)
      const filtered = visible.length < all.length
      setOrderAnnouncement(format(filtered ? ideasEs.order.movedShown : ideasEs.order.moved, { n: number(place) }))
    } catch (caught) {
      await staleOr(caught)
    } finally {
      setOrdering(false)
    }
  }

  const moveSaid = (title: string, status: IdeaMove, wasArchived: boolean, queue: readonly string[]) => {
    const moves = ideasEs.moves
    if (status === 'elegida') return format(moves.chosen, { titulo: title, n: number(queue.length) })
    if (status === 'hecha') return format(moves.madeDone, { titulo: title })
    if (status === 'archivada') return format(moves.archived, { titulo: title })
    return format(wasArchived ? moves.recovered : moves.removed, { titulo: title })
  }

  const changeStatus = async (idea: IdeaView, status: IdeaMove) => {
    if (!channelId || ordering) return
    setOrdering(true)
    setError(null)
    try {
      await ideasApi.change(idea.id, { revision: idea.revision, status })
      // The button pressed may be gone (archived, chosen): once the bank is read again, the focus goes to the card,
      // or else to the list.
      focusAfter.current = `card:${idea.id}`
      const [loaded, archive] = await Promise.all([reload(), ideasApi.archived(channelId)])
      setArchived(archive)
      // Said once, by the notice: the live region is for the moves of the order.
      toast({ title: moveSaid(idea.title, status, idea.status === 'archivada', loaded?.queue ?? []), tone: 'success' })
    } catch (caught) {
      await staleOr(caught)
    } finally {
      setOrdering(false)
    }
  }

  // The file is asked for first: an error is said here, without leaving the app (Puerta A of US4).
  const download = async (kind: 'md' | 'json') => {
    if (!channelId) return
    setError(null)
    try {
      const { blob, name } = await ideasApi.download(channelId, kind)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      toast({
        title: kind === 'md' ? ideasEs.download.downloadedDocument : ideasEs.download.downloadedData,
        tone: 'success',
      })
    } catch (caught) {
      setError(caught)
    }
  }

  return (
    <Screen title={text.title}>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void retry() }} />
      )}
      {(state.kind !== 'loading' || error === null) && (
        <IdeaBankContent
          state={state}
          estimate={estimate}
          failure={failure}
          proposing={proposing}
          deciding={deciding}
          saving={saving}
          editing={editing}
          formKey={formKey}
          measure={{
            job: jobId && watch ? { done: watch.done, total: watch.total } : null,
            estimate: measureEstimate,
            announcement,
            now: new Date(),
            onMeasure: (ideaIds, fresh) => void measure(ideaIds, fresh),
            onMeasureWithTitle: (idea) => void measureWithTitle(idea),
            prepare: {
              ideaId: editing ? null : prepareFor,
              estimate: prepareEstimate,
              failure: prepareFailure,
              busy: preparing,
              onOpen: (ideaId) => {
                setEditing(null)
                setPrepareFor(ideaId)
              },
              onRun: () => void prepareQueries(),
            },
            angles: {
              ideaId: anglesFor,
              estimate: anglesEstimate,
              failure: anglesFailure,
              busy: anglesBusy,
              // One request of angles at a time: another card opens once this one has its answer.
              onOpen: (ideaId) => {
                if (!anglesBusy) setAnglesFor(ideaId)
              },
              onRun: (instructions) => void askAngles(instructions),
            },
          }}
          order={{
            archived,
            busy: ordering,
            announcement: orderAnnouncement,
            onMove: (list, ideaId, direction, visible) => void move(list, ideaId, direction, visible),
            onStatus: (idea, status) => void changeStatus(idea, status),
            onDownload: (kind) => void download(kind),
          }}
          prepare={
            editing && targetIdea
              ? {
                  estimate: prepareEstimate,
                  failure: prepareFailure,
                  busy: preparing,
                  onRun: () => void prepareQueries(),
                }
              : undefined
          }
          onPropose={(instructions) => void propose(instructions)}
          onDecide={(keep, discard) => void decide(keep, discard)}
          onDecideAngles={(batchId, keep, discard) => void decide(keep, discard, batchId)}
          onCreate={(body) => void create(body)}
          onEdit={(ideaId) => {
            setPrepareFor(null)
            setEditing(ideaId)
          }}
          onChange={(idea, body) => void change(idea, body)}
        />
      )}
    </Screen>
  )
}
