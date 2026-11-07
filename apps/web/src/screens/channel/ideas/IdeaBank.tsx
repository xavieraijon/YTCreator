import { IDEA_LIMITS, type IdeaFormat } from '@ytcreator/core'
import type { AiRunFailure, EstimateView, IdeaBankView, IdeaView, NewIdeaBody } from '@ytcreator/core/api'
import { Button, Disclosure, ErrorMessage, format, TextArea, useToast } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, channelApi, ideasApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { IdeaBatch } from './IdeaBatch.tsx'
import { IdeaCard } from './IdeaCard.tsx'
import { IdeaEditor } from './IdeaEditor.tsx'

const text = ideasEs.bank

// A channel without its profile: the ideas are written for it (US1 AS5).
const isWithoutProfile = (error: unknown) =>
  error instanceof ApiClientError && error.body?.fields?.['profile'] === 'sin_perfil'

export type IdeaBankState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'noProfile' }
  | {
      readonly kind: 'ready'
      readonly channelId: string
      readonly pillars: readonly string[]
      readonly defaultFormat: IdeaFormat
      readonly bank: IdeaBankView
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
  readonly onPropose?: (instructions?: string) => void
  readonly onDecide?: (keep: number[], discard: number[]) => void
  readonly onCreate?: (body: NewIdeaBody) => void
  readonly onEdit?: (ideaId: string | null) => void
  readonly onChange?: (idea: IdeaView, body: NewIdeaBody & { notes?: string }) => void
}

const noop = () => {}

// What the bank shows for each state, without the requests (tested on its own).
export function IdeaBankContent({
  state,
  estimate = null,
  failure = null,
  proposing = false,
  deciding = false,
  saving = false,
  editing = null,
  formKey = 0,
  onPropose = noop,
  onDecide = noop,
  onCreate = noop,
  onEdit = noop,
  onChange = noop,
}: IdeaBankContentProps) {
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
  return (
    <ReadyBank
      state={state}
      estimate={estimate}
      failure={failure}
      proposing={proposing}
      deciding={deciding}
      saving={saving}
      editing={editing}
      formKey={formKey}
      onPropose={onPropose}
      onDecide={onDecide}
      onCreate={onCreate}
      onEdit={onEdit}
      onChange={onChange}
    />
  )
}

type ReadyProps = Required<Omit<IdeaBankContentProps, 'state'>> & {
  readonly state: Extract<IdeaBankState, { kind: 'ready' }>
}

function ReadyBank({
  state,
  estimate,
  failure,
  proposing,
  deciding,
  saving,
  editing,
  formKey,
  onPropose,
  onDecide,
  onCreate,
  onEdit,
  onChange,
}: ReadyProps) {
  const [instructions, setInstructions] = useState('')
  const { bank, pillars, defaultFormat } = state
  const empty = bank.ideas.length === 0
  const titleOf = (id: string | null) => bank.ideas.find((idea) => idea.id === id)?.title ?? null
  return (
    <>
      <p className={styles.why}>{text.why}</p>
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
        // With the bank empty, proposing is the main action (contracts/ui-screens.md).
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
            primary={empty}
            onRun={() => onPropose(empty ? undefined : instructions)}
          />
        </div>
      )}
      <section aria-label={text.listTitle}>
        <h2>{text.listTitle}</h2>
        {empty ? (
          <p>{text.empty}</p>
        ) : (
          <ul className={styles.options}>
            {bank.ideas.map((idea) =>
              editing === idea.id ? (
                <li key={idea.id} className={styles.option}>
                  <h3>{ideasEs.editor.editTitle}</h3>
                  <IdeaEditor
                    pillars={pillars}
                    idea={idea}
                    busy={saving}
                    onSave={(body) => onChange(idea, body)}
                    onCancel={() => onEdit(null)}
                  />
                </li>
              ) : (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  sourceTitle={titleOf(idea.sourceIdeaId)}
                  onEdit={() => onEdit(idea.id)}
                />
              ),
            )}
          </ul>
        )}
      </section>
      <Disclosure summary={ideasEs.editor.open}>
        <IdeaEditor key={formKey} pillars={pillars} defaultFormat={defaultFormat} busy={saving} onSave={onCreate} />
      </Disclosure>
    </>
  )
}

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
  const channelId = state.kind === 'ready' ? state.channelId : null
  const asked = useRef(0)

  const load = useCallback(async () => {
    setError(null)
    try {
      const current = await channelApi.current()
      if (!current.channel || !current.profile) {
        setState({ kind: 'noProfile' })
        return
      }
      const bank = await ideasApi.list(current.channel.id)
      const { concept } = current.profile.profile
      const pillars = concept.pillars.map((pillar) => pillar.title)
      const onlyShorts = concept.cadence.longPerWeek === 0 && concept.cadence.shortsPerWeek > 0
      setState({
        kind: 'ready',
        channelId: current.channel.id,
        pillars,
        defaultFormat: onlyShorts ? 'short' : 'largo',
        bank,
      })
    } catch (caught) {
      if (isWithoutProfile(caught)) setState({ kind: 'noProfile' })
      else setError(caught)
    }
  }, [])

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

  // «Reintentar» asks for the estimate again too: without it the button to propose would stay off.
  const retry = async () => {
    await load()
    if (channelId) void refreshEstimate(channelId)
  }

  const reload = async () => {
    if (state.kind !== 'ready') return
    const bank = await ideasApi.list(state.channelId)
    setState({ ...state, bank })
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

  const decide = async (keep: number[], discard: number[]) => {
    const batch = state.kind === 'ready' ? state.bank.pendingBatch : null
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
      const twin = state.kind === 'ready' ? state.bank.ideas.find((idea) => idea.id === duplicateOf) : undefined
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

  const change = async (idea: IdeaView, body: NewIdeaBody & { notes?: string }) => {
    setSaving(true)
    setError(null)
    try {
      await ideasApi.change(idea.id, { revision: idea.revision, ...body })
      setEditing(null)
      await reload()
    } catch (caught) {
      // Changed in another tab: what is there now is shown, nothing is overwritten.
      if (caught instanceof ApiClientError && caught.body?.code === 'conflicto') {
        toast({ title: ideasEs.editor.conflict, tone: 'warning' })
        setEditing(null)
        await reload()
      } else setError(caught)
    } finally {
      setSaving(false)
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
          onPropose={(instructions) => void propose(instructions)}
          onDecide={(keep, discard) => void decide(keep, discard)}
          onCreate={(body) => void create(body)}
          onEdit={setEditing}
          onChange={(idea, body) => void change(idea, body)}
        />
      )}
    </Screen>
  )
}
