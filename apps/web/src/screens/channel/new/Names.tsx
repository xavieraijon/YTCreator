import { HANDLE_PATTERN } from '@ytcreator/core'
import type { JourneyFullView, NameCheckView, ProposalView } from '@ytcreator/core/api'
import {
  Button,
  Card,
  DataSource,
  Dialog,
  Disclosure,
  ErrorMessage,
  format,
  ProgressBar,
  Semaphore,
  TextField,
} from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { useJob } from '../../../shell/useJob.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { AiAction, Proposal } from '../Proposal.tsx'
import { latestOf, payloadOf, useEstimate, useGenerate } from '../useJourney.ts'

const text = channelEs.names

export interface Name {
  readonly displayName: string
  readonly handle: string
  readonly why: string
}

export function reasonTexts(check: NameCheckView): string[] {
  if (check.semaphore === 'verde') return [text.clean]
  return check.reasons.map((reason) => {
    if (reason === 'parecidos') {
      return format(text.reason.parecidos, { canales: check.similarChannels.map((c) => c.title).join(', ') })
    }
    if (reason === 'titulos_con_nombre') {
      return format(text.reason.titulos_con_nombre, { videos: check.titleHits ?? 0 })
    }
    return text.reason[reason]
  })
}

// Letters without accents, as a @ needs them; the creator can always write their own.
export function handleFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 30)
}

export const isValidHandle = (handle: string) => new RegExp(HANDLE_PATTERN).test(handle)

export interface NameCardProps {
  readonly name: Name
  readonly check: NameCheckView | null
  readonly mine?: boolean
  readonly chosen?: boolean
  readonly busy?: boolean
  readonly onChoose: () => void
  readonly onRetry: () => void
  /** The button to go on, next to the one chosen and not at the end of the list (novice audit 003, M1). */
  readonly next?:
    | { readonly label: string; readonly busy: boolean; readonly onClick: () => void; readonly primary?: boolean }
    | undefined
  /** In «Tu canal»: what «chosen» says, and the name the channel has now, which has nothing to choose. */
  readonly chosenLabel?: string | undefined
  readonly currentLabel?: string | undefined
}

export function NameCard({
  name,
  check,
  mine = false,
  chosen = false,
  busy = false,
  onChoose,
  onRetry,
  next,
  chosenLabel = text.chosen,
  currentLabel,
}: NameCardProps) {
  return (
    <Card as="article" className={styles.niche} aria-label={name.displayName}>
      <h2>{name.displayName}</h2>
      <p>{format(text.handle, { arroba: name.handle })}</p>
      <p className={styles.why}>{name.why}</p>
      {!mine && <DataSource kind="ia" />}
      {check ? (
        <div className={styles['indicator-row']}>
          <Semaphore state={check.semaphore}>{text.semaphore[check.semaphore]}</Semaphore>
          {reasonTexts(check).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
          {check.semaphore !== 'sin_comprobar' && <DataSource kind="youtube" date={check.checkedAt} />}
        </div>
      ) : (
        <p className={styles.why}>{text.pending}</p>
      )}
      <div className={styles.actions}>
        {currentLabel ? (
          <Semaphore state="verde">{currentLabel}</Semaphore>
        ) : chosen ? (
          <>
            <Semaphore state="verde">{chosenLabel}</Semaphore>
            {next && (
              <Button
                variant={next.primary === false ? 'secondary' : 'primary'}
                loading={next.busy}
                onClick={next.onClick}
              >
                {next.label}
              </Button>
            )}
          </>
        ) : (
          <Button disabled={busy || !check} onClick={onChoose}>
            {text.choose}
          </Button>
        )}
        {check?.semaphore === 'sin_comprobar' && (
          <Button disabled={busy} onClick={onRetry}>
            {text.retry}
          </Button>
        )}
      </div>
    </Card>
  )
}

export interface RedNameProps {
  readonly name: string | null
  readonly reasons: readonly string[]
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

// A red name is explained and confirmed, never forbidden (FR-018, US3 AS3).
export function RedName({ name, reasons, onCancel, onConfirm }: RedNameProps) {
  return (
    <Dialog
      open={name !== null}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={format(text.red.title, { nombre: name ?? '' })}
      description={reasons.join(' ')}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>{text.red.cancel}</Button>
          <Button variant="primary" onClick={onConfirm}>
            {text.red.confirm}
          </Button>
        </>
      }
    />
  )
}

export interface NamesProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onFinish: (nameLater: boolean) => void
  /** From «Tu canal» (entry 136): the button to keep the one chosen says so, and «Cancelar» leaves it as it was. */
  readonly fromProfile?:
    | {
        readonly finish: string
        readonly cancel: string
        readonly onCancel: () => void
        /** The name the channel has now: it is not chosen again (round 3 of the audit). */
        readonly current: { readonly displayName: string | null; readonly handle: string | null }
        readonly currentLabel: string
        readonly chosenLabel: string
      }
    | undefined
}

// FR-022: a channel that already has its name goes on with it.
function KeptName({ view, busy, onFinish }: Pick<NamesProps, 'view' | 'busy' | 'onFinish'>) {
  const { keptName } = view.state
  if (!keptName) return null
  return (
    <div className={styles.option}>
      <p>{format(text.kept, { nombre: keptName.displayName })}</p>
      {keptName.handle && <p>{format(text.handle, { arroba: keptName.handle })}</p>}
      <Button variant="primary" loading={busy} onClick={() => onFinish(false)}>
        {text.finish}
      </Button>
    </div>
  )
}

export function Names(props: NamesProps) {
  return props.view.state.keptName && !props.fromProfile ? <KeptName {...props} /> : <ChooseName {...props} />
}

function ChooseName({ view, busy, reload, onFinish, fromProfile }: NamesProps) {
  const proposal = latestOf(view, 'nombres')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'nombres')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  const failed = estimateError ?? generate.error

  return (
    <div className={styles.options}>
      {!fromProfile && <p className={styles.why}>{text.why}</p>}
      <p role="note">{text.notice}</p>
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void refresh() }} />
      )}
      {proposal ? (
        <Proposal
          key={proposal.id}
          estimate={estimate}
          failure={generate.failure}
          claimsTrimmed={proposal.claimsTrimmed}
          busy={generate.busy}
          onRegenerate={(instructions) =>
            void generate.run('nombres', { parentId: proposal.id, ...(instructions ? { instructions } : {}) })
          }
        >
          <List
            view={view}
            proposal={proposal}
            busy={busy}
            reload={reload}
            onFinish={onFinish}
            fromProfile={fromProfile}
          />
        </Proposal>
      ) : (
        <AiAction
          label={text.generate}
          primary={!fromProfile}
          estimate={estimate}
          failure={generate.failure}
          busy={generate.busy}
          onRun={() => void generate.run('nombres')}
        />
      )}
      {fromProfile ? (
        <div className={styles.actions}>
          <Button disabled={busy || generate.busy} onClick={fromProfile.onCancel}>
            {fromProfile.cancel}
          </Button>
        </div>
      ) : (
        // Novice audit 003, minor 28: with a name chosen there is nothing to leave for later.
        proposal?.status !== 'aprobada' && (
          <div className={styles.option}>
            <p>{text.laterWhy}</p>
            <Button disabled={busy || generate.busy} onClick={() => onFinish(true)}>
              {text.later}
            </Button>
          </div>
        )
      )}
    </div>
  )
}

const checkOf = (view: JourneyFullView, { displayName, handle }: Name) =>
  view.nameChecks.findLast((check) => check.displayName === displayName && check.handle === handle) ?? null

function List({ view, proposal, busy, reload, onFinish, fromProfile }: NamesProps & { proposal: ProposalView }) {
  const names = payloadOf<{ names: Name[] }>(proposal).names
  const original = (proposal.payload as { names: Name[] }).names
  const running = view.jobs.findLast((job) => job.kind === 'comprobar_nombres' && job.status === 'en_curso') ?? null
  const interrupted = view.jobs.findLast((job) => job.kind === 'comprobar_nombres')?.status === 'interrumpido'
  const [jobId, setJobId] = useState<string | null>(null)
  const watching = jobId ?? running?.id ?? null
  const watch = useJob(watching)
  const isRunning = watch?.status === 'en_curso' && watching !== null
  const [error, setError] = useState<unknown>(null)
  const [deciding, setDeciding] = useState(false)
  const [redIndex, setRedIndex] = useState<number | null>(null)
  const [ownName, setOwnName] = useState('')
  const [ownHandle, setOwnHandle] = useState('')
  const [ownError, setOwnError] = useState<{ name?: string; handle?: string }>({})

  const isMine = (name: Name) => !original.some((o) => o.handle === name.handle && o.displayName === name.displayName)
  const toCheck = (name: Name) => ({
    displayName: name.displayName,
    handle: name.handle,
    origin: isMine(name) ? ('creador' as const) : ('ia' as const),
  })

  const check = async (list: readonly Name[]) => {
    setError(null)
    try {
      const { jobId: started } = await channelApi.checkNames(view.id, {
        revision: view.revision,
        names: list.map(toCheck),
      })
      setJobId(started)
    } catch (caught) {
      setError(caught)
    }
  }

  const seen = watch ? `${watch.items.length}-${watch.status}` : ''
  useEffect(() => {
    if (seen) void reload()
  }, [seen, reload])

  // Nothing is spent on checking, so it starts by itself; after a cut it is the creator who resumes it.
  const pending = names.filter((name) => checkOf(view, name) === null)
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (isRunning || interrupted || running) return
    const fresh = pending.filter((name) => !asked.current.has(name.handle))
    if (fresh.length === 0) return
    for (const name of fresh) asked.current.add(name.handle)
    void check(fresh)
  }, [pending.length, isRunning, interrupted, running])

  const decide = async (body: Parameters<typeof channelApi.decide>[1]) => {
    setDeciding(true)
    setError(null)
    try {
      await channelApi.decide(proposal.id, body)
      await reload()
      return true
    } catch (caught) {
      setError(caught)
      return false
    } finally {
      setDeciding(false)
    }
  }

  const choose = (index: number) => void decide({ selectedIndex: index, status: 'aprobada' })

  const addOwn = async () => {
    const displayName = ownName.trim()
    // Novice audit 003, minor 23: the @ and the spaces written by habit are taken out.
    const handle = ownHandle.replace(/[@\s]/g, '') || handleFrom(displayName)
    if (!displayName) return
    if (names.some((name) => name.displayName.toLowerCase() === displayName.toLowerCase())) {
      setOwnError({ name: text.own.repeated })
      return
    }
    if (!isValidHandle(handle)) {
      setOwnError({ handle: text.own.handleInvalid })
      return
    }
    setOwnError({})
    if (await decide({ editedPayload: { names: [...names, { displayName, handle, why: text.own.why }] } })) {
      setOwnName('')
      setOwnHandle('')
    }
  }

  const chosenIndex = proposal.status === 'aprobada' ? proposal.selectedIndex : null
  const red = redIndex === null ? null : names[redIndex]!
  const redCheck = red && checkOf(view, red)

  return (
    <div className={styles.options}>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void reload() }} />
      )}
      {isRunning && watch.total > 0 && (
        <ProgressBar
          value={Math.round((watch.done / watch.total) * 100)}
          label={format(text.checking, { hecho: watch.done, total: watch.total })}
        />
      )}
      {interrupted && !isRunning && (
        <div className={styles.option}>
          <p>{text.interrupted}</p>
          <Button variant="primary" onClick={() => void check(pending)}>
            {text.resume}
          </Button>
        </div>
      )}
      {names.map((name, index) => (
        <NameCard
          key={`${name.displayName}-${name.handle}`}
          name={name}
          check={checkOf(view, name)}
          mine={isMine(name)}
          chosen={chosenIndex === index}
          busy={deciding}
          onChoose={() => {
            if (checkOf(view, name)?.semaphore === 'rojo') setRedIndex(index)
            else choose(index)
          }}
          onRetry={() => void check([name])}
          next={{
            label: fromProfile?.finish ?? text.finish,
            busy,
            onClick: () => onFinish(false),
            // In «Tu canal» the page has its own main button: the panel has none (as RewritePart, entry 130).
            primary: !fromProfile,
          }}
          chosenLabel={fromProfile?.chosenLabel}
          currentLabel={
            fromProfile &&
            name.displayName === fromProfile.current.displayName &&
            name.handle === fromProfile.current.handle
              ? fromProfile.currentLabel
              : undefined
          }
        />
      ))}
      <Disclosure summary={text.own.title}>
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void addOwn()
          }}
        >
          <TextField
            label={text.own.name}
            maxLength={50}
            value={ownName}
            {...(ownError.name ? { error: ownError.name } : {})}
            onChange={(event) => setOwnName(event.target.value)}
          />
          <TextField
            label={text.own.handle}
            description={text.own.handleHelp}
            optional
            value={ownHandle}
            {...(ownError.handle ? { error: ownError.handle } : {})}
            onChange={(event) => setOwnHandle(event.target.value)}
          />
          <div className={styles.actions}>
            <Button type="submit" loading={deciding} disabled={!ownName.trim()}>
              {text.own.add}
            </Button>
          </div>
        </form>
      </Disclosure>
      <RedName
        name={red?.displayName ?? null}
        reasons={redCheck ? reasonTexts(redCheck) : []}
        onCancel={() => setRedIndex(null)}
        onConfirm={() => {
          const index = redIndex
          setRedIndex(null)
          if (index !== null) choose(index)
        }}
      />
    </div>
  )
}
