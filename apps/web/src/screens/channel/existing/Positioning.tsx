import type { ChannelOutput, PositioningOutput } from '@ytcreator/core'
import type { ChannelReadingView, ConceptFigures, JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { Button, Card, DataSource, ErrorMessage, format, TextArea } from '@ytcreator/ui'
import { useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { type Concept, ConceptDetails, ConceptEditor } from '../new/Concepts.tsx'
import { AiAction, Proposal } from '../Proposal.tsx'
import { latestOf, payloadOf, useEstimate, useGenerate } from '../useJourney.ts'
import { videoLine } from './format.ts'

const text = channelEs.existing.positioning
const form = text.form

type CurrentProfile = ChannelOutput<'lectura_canal'>
type Claim = CurrentProfile['niche']
type Positioned = PositioningOutput & { readonly figures: ConceptFigures; readonly basedOn?: unknown }

// The videos a claim rests on, as data and apart from the claim, which is an opinion (contracts/ui-screens.md).
function Cited({ videoIds, reading }: { videoIds: readonly string[]; reading: ChannelReadingView | null }) {
  const videos = (reading?.videos ?? []).filter((video) => videoIds.includes(video.id))
  if (videos.length === 0) return null
  return (
    <div className={styles.cited}>
      <span>{text.citesWhat}</span>
      <ul>
        {videos.map((video) => (
          <li key={video.id}>{video.ratio === null ? video.title : videoLine(video.title, video.ratio)}</li>
        ))}
      </ul>
    </div>
  )
}

function Claims({
  title,
  list,
  reading,
}: {
  title: string
  list: readonly Claim[]
  reading: ChannelReadingView | null
}) {
  if (list.length === 0) return null
  return (
    <div className={styles['indicator-row']}>
      <h3>{title}</h3>
      <ul className={styles.claims}>
        {list.map((claim) => (
          <li key={claim.text}>
            <p>{claim.text}</p>
            <Cited videoIds={claim.videoIds} reading={reading} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CurrentProfileCard({
  profile,
  reading,
}: {
  profile: CurrentProfile
  reading: ChannelReadingView | null
}) {
  return (
    <Card as="article" className={styles.niche} aria-label={text.current}>
      <DataSource kind="ia" />
      <Claims title={text.niche} list={[profile.niche]} reading={reading} />
      <Claims title={text.pillars} list={profile.pillars} reading={reading} />
      <Claims title={text.audience} list={[profile.audience]} reading={reading} />
      <Claims title={text.works} list={profile.works} reading={reading} />
      <Claims title={text.doesNotWork} list={profile.doesNotWork} reading={reading} />
      {reading && <DataSource kind="youtube" date={reading.fetchedAt} />}
    </Card>
  )
}

interface CurrentProfileEditorProps {
  readonly profile: CurrentProfile
  readonly busy: boolean
  readonly onSave: (profile: CurrentProfile) => void
  readonly onCancel: () => void
}

// Only the words change: the videos each claim rests on stay. An item left blank goes away.
function CurrentProfileEditor({ profile, busy, onSave, onCancel }: CurrentProfileEditorProps) {
  const [draft, setDraft] = useState(profile)
  const [invalid, setInvalid] = useState(false)

  const setItem = (key: 'pillars' | 'works' | 'doesNotWork', index: number, value: string) =>
    setDraft({
      ...draft,
      [key]: draft[key].map((claim, i) => (i === index ? { ...claim, text: value } : claim)),
    })
  const kept = (list: readonly Claim[]) => list.filter((claim) => claim.text.trim())

  const save = () => {
    if (!draft.niche.text.trim() || !draft.audience.text.trim() || kept(draft.pillars).length === 0) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave({
      ...draft,
      pillars: kept(draft.pillars),
      works: kept(draft.works),
      doesNotWork: kept(draft.doesNotWork),
    })
  }

  const list = (key: 'pillars' | 'works' | 'doesNotWork', label: string) =>
    draft[key].map((claim, index) => (
      <TextArea
        key={`${key}-${index}`}
        label={format(label, { numero: index + 1 })}
        description={form.help}
        rows={2}
        value={claim.text}
        onChange={(event) => setItem(key, index, event.target.value)}
      />
    ))

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {invalid && <ErrorMessage live title={form.invalid} action={{ label: form.cancel, onClick: onCancel }} />}
      <TextArea
        label={form.niche}
        rows={2}
        value={draft.niche.text}
        onChange={(event) => setDraft({ ...draft, niche: { ...draft.niche, text: event.target.value } })}
      />
      {list('pillars', form.pillar)}
      <TextArea
        label={form.audience}
        rows={2}
        value={draft.audience.text}
        onChange={(event) => setDraft({ ...draft, audience: { ...draft.audience, text: event.target.value } })}
      />
      {list('works', form.works)}
      {list('doesNotWork', form.doesNotWork)}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {form.save}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          {form.cancel}
        </Button>
      </div>
    </form>
  )
}

function useDecide(reload: () => Promise<unknown>) {
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const clear = () => setError(null)
  const decide = async (id: string, body: Parameters<typeof channelApi.decide>[1]) => {
    setDeciding(true)
    setError(null)
    try {
      await channelApi.decide(id, body)
      await reload()
      return true
    } catch (caught) {
      setError(caught)
      return false
    } finally {
      setDeciding(false)
    }
  }
  return { deciding, error, clear, decide }
}

export interface PositioningProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onStep: (data: object) => void
}

// Going back to the proposal before this one. This one goes away for good, as in the niches (entry 13, P3).
function Previous({ proposal, busy, onBack }: { proposal: ProposalView; busy: boolean; onBack: () => void }) {
  if (!proposal.parentId) return null
  return (
    <div className={styles.actions}>
      <Button disabled={busy} onClick={onBack}>
        {text.previous}
      </Button>
    </div>
  )
}

export interface CurrentSectionProps extends Pick<PositioningProps, 'view' | 'reload'> {
  readonly proposal: ProposalView
  readonly onApproved?: () => void
}

export function CurrentSection({ view, reload, proposal, onApproved }: CurrentSectionProps) {
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'lectura_canal')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  const { deciding, error, clear, decide } = useDecide(reload)
  const [editing, setEditing] = useState(false)
  const [backError, setBackError] = useState<unknown>(null)
  const failed = estimateError ?? generate.error ?? error ?? backError
  const profile = payloadOf<CurrentProfile>(proposal)
  const approved = proposal.status === 'aprobada'
  const approve = () =>
    void decide(proposal.id, { status: 'aprobada' }).then((done) => {
      if (done) onApproved?.()
    })

  return (
    <section className={styles.options} aria-label={text.current}>
      <h2>{text.current}</h2>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{
            label: es.app.retry,
            onClick: () => {
              clear()
              setBackError(null)
              void refresh()
            },
          }}
        />
      )}
      {editing ? (
        <CurrentProfileEditor
          profile={profile}
          busy={deciding}
          onCancel={() => setEditing(false)}
          onSave={(edited) =>
            void decide(proposal.id, { editedPayload: edited }).then((saved) => {
              if (saved) setEditing(false)
            })
          }
        />
      ) : (
        <Proposal
          estimate={estimate}
          failure={generate.failure}
          claimsTrimmed={proposal.claimsTrimmed}
          busy={generate.busy || deciding}
          {...(!approved
            ? { onApprove: approve }
            : onApproved
              ? { onApprove: onApproved, approveLabel: text.goOn }
              : {})}
          onEdit={() => setEditing(true)}
          onRegenerate={(instructions) =>
            void generate.run('perfil_actual', { parentId: proposal.id, ...(instructions ? { instructions } : {}) })
          }
        >
          <CurrentProfileCard profile={profile} reading={view.reading} />
          {approved && !onApproved && <p role="status">{text.approved}</p>}
        </Proposal>
      )}
      {!editing && (
        <Previous
          proposal={proposal}
          busy={generate.busy || deciding}
          onBack={() => {
            setBackError(null)
            channelApi.back(proposal.id).then(reload).catch(setBackError)
          }}
        />
      )}
    </section>
  )
}

function Changes({ list, reading }: { list: Positioned['changes']; reading: ChannelReadingView | null }) {
  if (list.length === 0) return null
  return (
    <div className={styles['indicator-row']}>
      <h3>{text.changes}</h3>
      <ul className={styles.claims}>
        {list.map((change) => (
          <li key={change.what}>
            <p>
              <strong>{change.what}</strong> {change.why}
            </p>
            <Cited videoIds={change.videoIds} reading={reading} />
          </li>
        ))}
      </ul>
      {reading && <DataSource kind="youtube" date={reading.fetchedAt} />}
    </div>
  )
}

// The changes are the AI's too: they can be reworded or removed, and the videos they rest on stay.
function ChangesFields({
  changes,
  onChange,
}: {
  changes: Positioned['changes']
  onChange: (changes: Positioned['changes']) => void
}) {
  const set = (index: number, change: Partial<Positioned['changes'][number]>) =>
    onChange(changes.map((item, i) => (i === index ? { ...item, ...change } : item)))
  return (
    <>
      {changes.map((change, index) => (
        <div key={index} className={styles.form}>
          <TextArea
            label={format(form.change, { numero: index + 1 })}
            description={form.help}
            rows={2}
            value={change.what}
            onChange={(event) => set(index, { what: event.target.value })}
          />
          <TextArea
            label={format(form.changeWhy, { numero: index + 1 })}
            rows={2}
            value={change.why}
            onChange={(event) => set(index, { why: event.target.value })}
          />
        </div>
      ))}
    </>
  )
}

function ProposalSection({ view, busy, reload, onStep, current }: PositioningProps & { current: ProposalView }) {
  const proposal = latestOf(view, 'posicionamiento')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'posicionamiento')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  const { deciding, error, clear, decide } = useDecide(reload)
  const [editing, setEditing] = useState(false)
  const [changes, setChanges] = useState<Positioned['changes']>([])
  const [backError, setBackError] = useState<unknown>(null)
  const failed = estimateError ?? generate.error ?? error ?? backError
  const positioned = proposal ? payloadOf<Positioned>(proposal) : null
  const { hoursPerWeek, onCamera } = view.state
  const stale =
    positioned?.basedOn !== undefined &&
    JSON.stringify(positioned.basedOn) !==
      JSON.stringify({ currentProfile: payloadOf(current), hoursPerWeek, onCamera })

  return (
    <section className={styles.options} aria-label={text.proposal}>
      <h2>{text.proposal}</h2>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{
            label: es.app.retry,
            onClick: () => {
              clear()
              setBackError(null)
              void refresh()
            },
          }}
        />
      )}
      {stale && <p className={styles.notice}>{text.stale}</p>}
      {!proposal || !positioned ? (
        <AiAction
          label={text.generate}
          estimate={estimate}
          failure={generate.failure}
          busy={generate.busy}
          onRun={() => void generate.run('posicionamiento')}
        />
      ) : editing ? (
        <ConceptEditor
          concept={positioned as Concept}
          busy={deciding}
          extra={<ChangesFields changes={changes} onChange={setChanges} />}
          onCancel={() => setEditing(false)}
          onSave={(edited) => {
            const kept = changes.filter((change) => change.what.trim() && change.why.trim())
            void decide(proposal.id, { editedPayload: { ...positioned, ...edited, changes: kept } }).then((saved) => {
              if (saved) setEditing(false)
            })
          }}
        />
      ) : (
        <Proposal
          estimate={estimate}
          failure={generate.failure}
          claimsTrimmed={proposal.claimsTrimmed}
          busy={generate.busy || deciding || busy}
          onApprove={() =>
            void decide(proposal.id, { status: 'aprobada' }).then((approved) => {
              if (approved) onStep({})
            })
          }
          onEdit={() => {
            setChanges(positioned.changes)
            setEditing(true)
          }}
          onRegenerate={(instructions) =>
            void generate.run('posicionamiento', { parentId: proposal.id, ...(instructions ? { instructions } : {}) })
          }
        >
          <Card as="article" className={styles.niche} aria-label={positioned.promise}>
            <DataSource kind="ia" />
            <Changes list={positioned.changes} reading={view.reading} />
            <ConceptDetails
              concept={positioned as Concept}
              own={
                view.reading
                  ? { medianViews: view.reading.summary.long.medianViews, readAt: view.reading.fetchedAt }
                  : undefined
              }
            />
          </Card>
        </Proposal>
      )}
      {proposal && !editing && (
        <Previous
          proposal={proposal}
          busy={generate.busy || deciding}
          onBack={() => {
            setBackError(null)
            channelApi.back(proposal.id).then(reload).catch(setBackError)
          }}
        />
      )}
    </section>
  )
}

// The current profile, as the AI sees it and with the videos behind it, and what it would change (FR-021).
export function Positioning(props: PositioningProps) {
  const current = latestOf(props.view, 'perfil_actual')
  return (
    <div className={styles.options}>
      <p className={styles.why}>{text.why}</p>
      {current && <CurrentSection view={props.view} reload={props.reload} proposal={current} />}
      {current?.status === 'aprobada' && <ProposalSection {...props} current={current} />}
      {current && current.status !== 'aprobada' && <p className={styles.why}>{text.approveFirst}</p>}
    </div>
  )
}
