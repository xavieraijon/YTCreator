import { AI_RUN_FAILURES, type AiRunFailure, type EstimateView, type SubtitlesView } from '@ytcreator/core/api'
import { AiWorking, Button, Checkbox, Disclosure, ErrorMessage, format } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { subtitlesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { useJob } from '../../../shell/useJob.ts'
import { es } from '../../../strings/es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { clockText } from './format.ts'

const text = subtitlesEs.review.ai
const USE = 'revision_subtitulos'

const plural = (forms: { one: string; other: string }, n: number) => format(n === 1 ? forms.one : forms.other, { n })
const isAiFailure = (value: string | null): value is AiRunFailure =>
  (AI_RUN_FAILURES as readonly string[]).includes(value ?? '')

// The AI's review (R11): the cost on the button, then each change with what it said before and why, for the creator
// to accept or not. Nothing changes until they save what they accept.
export function AiReview({
  view,
  version,
  onView,
  onReload,
  onError,
}: {
  readonly view: SubtitlesView
  readonly version: number
  readonly onView: (view: SubtitlesView) => void
  readonly onReload: () => void
  readonly onError: (cause: unknown) => void
}) {
  const job = view.job?.op === 'revision_ia' ? view.job : null
  const running = job !== null && (job.status === 'en_curso' || job.status === 'en_cola')
  const proposal = view.aiProposal
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  // The price is asked for on its own: if it cannot be had (no AI connected, say), it is said here, not over the
  // whole review (as in 006).
  const [priceError, setPriceError] = useState<unknown>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const watch = useJob(running ? job.id : jobId)

  const price = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const got = await subtitlesApi.estimate(view.scriptId, USE, { signal })
        setEstimate(got)
        setPriceError(null)
        return got
      } catch (cause) {
        if (!signal?.aborted) setPriceError(cause)
        return null
      }
    },
    [view.scriptId],
  )

  // Asked again for each version: another version costs differently.
  useEffect(() => {
    if (running || proposal) return undefined
    const controller = new AbortController()
    void price(controller.signal)
    return () => controller.abort()
  }, [price, running, proposal, version])

  useEffect(() => {
    if (watch && watch.status !== 'en_curso') {
      setJobId(null)
      onReload()
    }
  }, [watch, onReload])

  const run = async () => {
    const shown = estimate?.cents
    const fresh = await price()
    if (!fresh || fresh.blockedBy || fresh.cents !== shown) return
    try {
      const { jobId: started } = await subtitlesApi.generate(view.scriptId, {
        use: USE,
        estimateId: fresh.estimateId,
        baseVersion: version,
      })
      setJobId(started)
      onReload()
    } catch (cause) {
      onError(cause)
    }
  }

  const ended = job && !running && job.status !== 'hecho' && job.id !== dismissed ? job : null

  return (
    <Disclosure summary={text.title} defaultOpen={running || proposal !== null}>
      <p className={styles.why}>{text.why}</p>
      {running || jobId ? (
        <AiWorking label={text.working} />
      ) : proposal ? (
        <Proposal
          key={version}
          view={view}
          version={version}
          busy={busy}
          setBusy={setBusy}
          onView={onView}
          onError={onError}
        />
      ) : (
        <>
          {ended && !isAiFailure(ended.failure) && (
            <ErrorMessage
              live
              title={text.otherFailure}
              action={{ label: text.dismiss, onClick: () => setDismissed(ended.id) }}
            />
          )}
          {priceError !== null && (
            <ErrorMessage
              live
              title={errorText(priceError)}
              action={{ label: es.app.retry, onClick: () => void price() }}
            />
          )}
          <AiAction
            label={text.action}
            primary={false}
            estimate={estimate}
            failure={ended && isAiFailure(ended.failure) ? ended.failure : null}
            onRun={() => void run()}
          />
        </>
      )}
    </Disclosure>
  )
}

function Proposal({
  view,
  version,
  busy,
  setBusy,
  onView,
  onError,
}: {
  readonly view: SubtitlesView
  readonly version: number
  readonly busy: boolean
  readonly setBusy: (busy: boolean) => void
  readonly onView: (view: SubtitlesView) => void
  readonly onError: (cause: unknown) => void
}) {
  const changes = view.aiProposal ?? []
  // Nothing is accepted until the creator marks it (FR-011, principle II).
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => new Set())
  const cues = new Map((view.latest?.content.cues ?? []).map((cue) => [cue.id, cue]))

  const decide = async (accept: string[]) => {
    setBusy(true)
    try {
      onView(await subtitlesApi.decide(view.scriptId, { baseVersion: version, accept }))
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  if (changes.length === 0) {
    return (
      <>
        <p role="status">{text.none}</p>
        <div className={styles.actions}>
          <Button variant="secondary" disabled={busy} onClick={() => void decide([])}>
            {text.dismiss}
          </Button>
        </div>
      </>
    )
  }

  const toggle = (id: string, on: boolean) =>
    setAccepted((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <>
      <h3>{plural(text.proposalTitle, changes.length)}</h3>
      <p className={styles.why}>{text.choose}</p>
      <ol className={styles.cueList}>
        {changes.map((change) => {
          const cue = cues.get(change.cueId)
          return (
            <li key={change.cueId} className={styles.cue}>
              {cue && <p className={styles.cueTime}>{format(text.at, { inicio: clockText(cue.start) })}</p>}
              {cue && <p>{format(text.before, { texto: cue.text.replace(/\n/g, ' ') })}</p>}
              <p>{format(text.after, { texto: change.text.replace(/\n/g, ' ') })}</p>
              <p className={styles.why}>{format(text.reason, { motivo: change.reason })}</p>
              <Checkbox
                label={format(text.accept, { inicio: cue ? clockText(cue.start) : '' })}
                checked={accepted.has(change.cueId)}
                disabled={busy}
                onCheckedChange={(on) => toggle(change.cueId, on)}
              />
            </li>
          )
        })}
      </ol>
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={busy}
          disabled={busy || accepted.size === 0}
          onClick={() => void decide([...accepted])}
        >
          {plural(text.apply, accepted.size)}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void decide(changes.map((one) => one.cueId))}>
          {text.acceptAll}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void decide([])}>
          {text.rejectAll}
        </Button>
      </div>
    </>
  )
}
