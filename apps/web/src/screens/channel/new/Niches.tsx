import type { JourneyFullView, MeasureView, ProposalView } from '@ytcreator/core/api'
import { Button, Card, DataSource, Disclosure, ErrorMessage, format, ProgressBar, TextField } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { useJob } from '../../../shell/useJob.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { AiAction, Proposal } from '../Proposal.tsx'
import { latestOf, payloadOf, useEstimate, useGenerate } from '../useJourney.ts'
import { isStale, type Niche, NicheCard } from './NicheCard.tsx'
import { References } from './References.tsx'

const text = channelEs.niches
const MAX_NICHES = 6

export interface Recommendation {
  readonly recommendedLabel: string
  readonly why: string
  readonly cautions: readonly { label: string; why: string }[]
}

export function OpinionCard({ opinion }: { opinion: Recommendation }) {
  return (
    <Card as="section" className={styles.niche} aria-label={text.opinion.title}>
      <h2>{text.opinion.title}</h2>
      <DataSource kind="ia" />
      <p>
        <strong>{format(text.opinion.recommended, { nicho: opinion.recommendedLabel })}</strong> {opinion.why}
      </p>
      {opinion.cautions.length > 0 && (
        <>
          <h3>{text.opinion.cautions}</h3>
          <ul>
            {opinion.cautions.map((caution) => (
              <li key={caution.label}>
                <strong>{caution.label}:</strong> {caution.why}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

const measureOf = (measures: readonly MeasureView[], label: string) =>
  measures.findLast((measure) => measure.nicheLabel === label) ?? null

const toMeasure = ({ label, queries }: Niche) => ({ label, queries: [...queries] })

export interface NichesProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onStep: (data: object) => void
}

export function Niches({ view, busy, reload, onStep }: NichesProps) {
  const proposal = latestOf(view, 'nichos')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'nichos')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  const failed = estimateError ?? generate.error

  return (
    <div className={styles.options}>
      <p className={styles.why}>{text.why}</p>
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void refresh() }} />
      )}
      {proposal ? (
        <Batch
          view={view}
          proposal={proposal}
          busy={busy}
          reload={reload}
          onStep={onStep}
          proposalActions={
            <Proposal
              estimate={estimate}
              failure={generate.failure}
              claimsTrimmed={proposal.claimsTrimmed}
              busy={generate.busy}
              onRegenerate={(instructions) =>
                void generate.run('nichos', { parentId: proposal.id, ...(instructions ? { instructions } : {}) })
              }
            >
              {null}
            </Proposal>
          }
        />
      ) : (
        <AiAction
          label={text.generate}
          estimate={estimate}
          failure={generate.failure}
          busy={generate.busy}
          onRun={() => void generate.run('nichos')}
        />
      )}
    </div>
  )
}

interface BatchProps extends NichesProps {
  readonly proposal: ProposalView
  readonly proposalActions: React.ReactNode
}

function Batch({ view, proposal, busy, reload, onStep, proposalActions }: BatchProps) {
  const niches = payloadOf<{ niches: Niche[] }>(proposal).niches
  const running = view.jobs.findLast((job) => job.kind === 'medir_nichos' && job.status === 'en_curso') ?? null
  const interrupted = view.jobs.findLast((job) => job.kind === 'medir_nichos')?.status === 'interrumpido'
  const [jobId, setJobId] = useState<string | null>(null)
  const watching = jobId ?? running?.id ?? null
  const watch = useJob(watching)
  const [error, setError] = useState<unknown>(null)
  const [own, setOwn] = useState('')
  const [ownError, setOwnError] = useState<string | undefined>()
  const [deciding, setDeciding] = useState(false)

  const isRunning = watch?.status === 'en_curso' && watching !== null

  const measure = async (list: readonly Niche[], force = false) => {
    setError(null)
    try {
      const { jobId: started } = await channelApi.measure(view.id, {
        revision: view.revision,
        niches: list.map(toMeasure),
        ...(force ? { force: true } : {}),
      })
      setJobId(started)
    } catch (caught) {
      setError(caught)
    }
  }

  // Each niche that ends shows at once; the job goes on if the creator leaves.
  const seen = watch ? `${watch.items.length}-${watch.status}` : ''
  useEffect(() => {
    if (seen) void reload()
  }, [seen, reload])

  // Nothing is spent on measuring, so it starts by itself; after a cut it is the creator who resumes it.
  const pending = niches.filter((niche) => measureOf(view.measures, niche.label) === null)
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (isRunning || interrupted || running) return
    const fresh = pending.filter((niche) => !asked.current.has(niche.label))
    if (fresh.length === 0) return
    for (const niche of fresh) asked.current.add(niche.label)
    void measure(fresh)
  }, [pending.length, isRunning, interrupted, running])

  const decide = async (body: Parameters<typeof channelApi.decide>[1]) => {
    setDeciding(true)
    setError(null)
    try {
      await channelApi.decide(proposal.id, body)
      await reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setDeciding(false)
    }
  }

  const addOwn = async () => {
    const label = own.trim()
    if (!label) return
    if (niches.some((niche) => niche.label.toLowerCase() === label.toLowerCase())) {
      setOwnError(text.own.repeated)
      return
    }
    setOwnError(undefined)
    const added: Niche = { label, summary: label, queries: [label], whyItFits: text.own.why }
    await decide({ editedPayload: { niches: [...niches, added] } })
    setOwn('')
  }

  const chosen =
    proposal.status === 'aprobada' && proposal.selectedIndex !== null ? niches[proposal.selectedIndex] : undefined
  const chosenMeasure = chosen ? measureOf(view.measures, chosen.label) : null
  const measured = view.measures.some((m) => m.status === 'medida')
  const now = new Date()

  return (
    <>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void reload() }} />
      )}
      {isRunning && watch.total > 0 && (
        <div className={styles.option}>
          <p role="status">{format(text.measuring, { hecho: watch.done, total: watch.total })}</p>
          <ProgressBar
            value={Math.round((watch.done / watch.total) * 100)}
            label={format(text.measuring, { hecho: watch.done, total: watch.total })}
          />
          <p className={styles.notice}>{text.measuringHelp}</p>
        </div>
      )}
      {interrupted && !isRunning && (
        <div className={styles.option}>
          <p>{text.interrupted}</p>
          <Button variant="primary" onClick={() => void measure(niches)}>
            {text.resume}
          </Button>
        </div>
      )}

      {niches.map((niche, index) => {
        const nicheMeasure = measureOf(view.measures, niche.label)
        return (
          <NicheCard
            key={niche.label}
            niche={niche}
            measure={nicheMeasure}
            warnings={view.warnings[niche.label] ?? []}
            chosen={chosen?.label === niche.label}
            stale={nicheMeasure ? isStale(nicheMeasure, view.measureStaleDays, now) : false}
            staleDays={view.measureStaleDays}
            busy={deciding}
            onChoose={() => void decide({ selectedIndex: index, status: 'aprobada' })}
            onRetry={() => void measure([niche], nicheMeasure?.status === 'medida')}
          />
        )
      })}

      {measured && !isRunning && <Opinion view={view} reload={reload} />}

      {niches.length < MAX_NICHES && (
        <Disclosure summary={text.own.title}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void addOwn()
            }}
          >
            <TextField
              label={text.own.label}
              description={text.own.help}
              value={own}
              maxLength={80}
              {...(ownError ? { error: ownError } : {})}
              onChange={(event) => setOwn(event.target.value)}
            />
            <div className={styles.actions}>
              <Button type="submit" loading={deciding} disabled={!own.trim()}>
                {text.own.add}
              </Button>
            </div>
          </form>
        </Disclosure>
      )}

      {proposalActions}
      {proposal.parentId && (
        <div className={styles.actions}>
          <Button
            onClick={() => {
              setError(null)
              channelApi.back(proposal.id).then(reload).catch(setError)
            }}
          >
            {text.previousBatch}
          </Button>
        </div>
      )}

      {chosen && chosenMeasure?.status === 'medida' && (
        <References key={chosenMeasure.id} view={view} measureId={chosenMeasure.id} />
      )}
      {chosen && (
        <div className={styles.actions}>
          <Button variant="primary" loading={busy} onClick={() => onStep({})}>
            {text.next}
          </Button>
        </div>
      )}
    </>
  )
}

function Opinion({ view, reload }: { view: JourneyFullView; reload: () => Promise<unknown> }) {
  const latest = latestOf(view, 'recomendacion')
  const { estimate, refresh } = useEstimate(view.id, 'recomendacion')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  return (
    <>
      {latest && <OpinionCard opinion={payloadOf<Recommendation>(latest)} />}
      <AiAction
        label={latest ? text.opinion.again : text.opinion.ask}
        estimate={estimate}
        failure={generate.failure}
        busy={generate.busy}
        primary={false}
        onRun={() => void generate.run('recomendacion', latest ? { parentId: latest.id } : {})}
      />
    </>
  )
}
