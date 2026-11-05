import { AUDIENCE_REGIONS, type ConceptOutput, ON_CAMERA } from '@ytcreator/core'
import { type ConceptFigures, conceptsViewSchema, type JourneyFullView, type ProposalView } from '@ytcreator/core/api'
import {
  Button,
  Card,
  Checkbox,
  DataSource,
  ErrorMessage,
  format,
  RadioGroup,
  Semaphore,
  TextArea,
  TextField,
} from '@ytcreator/ui'
import { type ReactNode, useState } from 'react'
import { channelApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { AiAction, Proposal } from '../Proposal.tsx'
import { latestOf, payloadOf, useEstimate, useGenerate } from '../useJourney.ts'

const text = channelEs.concepts
const form = text.form
const warningTexts = channelEs.niches.warnings

export type Concept = ConceptOutput & { readonly figures: ConceptFigures }
// What the screen reads of a concept: a saved profile has no kind of content to show (US5).
export type ShownConcept = Omit<Concept, 'monetization' | 'warnings'> & {
  readonly monetization: Pick<Concept['monetization'], 'assumptions'>
}

const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)
const euros = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)

function Part({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className={styles['indicator-row']}>
      <h2>{title}</h2>
      <p className={styles.why}>{why}</p>
      {children}
    </section>
  )
}

function Money({ concept, own }: { concept: ShownConcept; own: OwnVideos | undefined }) {
  const { monetization } = concept.figures
  const {
    monthlyEurRange: month,
    monthlyViewsAssumption: views,
    rpmEurRange: rate,
    yppRequirements: ypp,
  } = monetization
  return (
    <Part title={text.money} why={text.moneyWhy}>
      {month && views ? (
        <>
          <p>
            <strong>{format(text.moneyRange, { min: number(month.min), max: number(month.max) })}</strong>
          </p>
          <p>
            {own
              ? format(text.moneyViewsOwn, { visitas: number(views.min) })
              : format(text.moneyViews, { min: number(views.min), max: number(views.max) })}
          </p>
        </>
      ) : (
        <p>{own ? text.moneyUnknownOwn : text.moneyUnknown}</p>
      )}
      {own && own.medianViews !== null && (
        <>
          <p>{format(text.moneyMedianOwn, { visitas: number(own.medianViews) })}</p>
          <DataSource kind="youtube" date={own.readAt} />
        </>
      )}
      <p>{format(text.moneyPerThousand, { min: euros(rate.min), max: euros(rate.max) })}</p>
      <p>{text.moneyConfidence[monetization.rpmSource.confidence]}</p>
      <DataSource kind="conocimiento" label={monetization.rpmSource.label} date={monetization.rpmSource.reviewedAt} />
      {concept.monetization.assumptions.length > 0 && (
        <>
          <h3>{text.assumptions}</h3>
          <ul>
            {concept.monetization.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <DataSource kind="ia" />
        </>
      )}
      <p>
        {format(text.partnerProgram, {
          suscriptores: number(ypp.subscribers),
          horas: number(ypp.watchHours),
          shorts: number(ypp.shortsViews),
        })}
      </p>
      <DataSource kind="conocimiento" label={monetization.yppSource.label} date={monetization.yppSource.reviewedAt} />
    </Part>
  )
}

export interface ConceptCardProps {
  readonly concept: Concept
  readonly chosen?: boolean
  readonly busy?: boolean
  readonly onChoose: () => void
  readonly onEdit: () => void
}

// What a concept says; a positioning has the same parts (FR-021b).
// For a channel that exists: what a long video of its own gets, the data the money is worked out from (FR-008).
export interface OwnVideos {
  readonly medianViews: number | null
  readonly readAt: string
}

export function ConceptDetails({
  concept,
  own,
  promiseNote,
}: {
  concept: ShownConcept
  own?: OwnVideos | undefined
  /** The promise was written by the creator, not the AI (principle II): this note replaces «Opinión de la IA». */
  promiseNote?: string | undefined
}) {
  const { promise, pillars, audience, format: shape, cadence, figures } = concept
  return (
    <>
      <Part title={text.promise} why={text.promiseWhy}>
        <p>
          <strong>{promise}</strong>
        </p>
      </Part>
      {promiseNote ? <p className={styles.why}>{promiseNote}</p> : <DataSource kind="ia" />}
      <Part title={text.pillars} why={text.pillarsWhy}>
        <ul>
          {pillars.map((pillar) => (
            <li key={pillar.title}>
              <strong>{pillar.title}:</strong> {pillar.description}
            </li>
          ))}
        </ul>
      </Part>
      <Part title={text.audience} why={text.audienceWhy}>
        <p>{audience.description}</p>
        <p>{channelEs.rhythm.regionOptions[audience.region]}</p>
      </Part>
      <Part title={text.format} why={text.formatWhy}>
        <p>{text.presence[shape.presence]}</p>
        <p>{shape.longForm}</p>
        <p>{format(text.shortsRole, { texto: shape.shortsRole })}</p>
      </Part>
      <Part title={text.cadence} why={text.cadenceWhy}>
        <p>
          {format(text.cadenceText, {
            largos: number(cadence.longPerWeek),
            shorts: number(cadence.shortsPerWeek),
            horas: number(cadence.hoursPerWeek),
          })}
        </p>
      </Part>
      {figures.warnings.map((warning) => (
        <div key={warning.code} className={styles['indicator-row']}>
          <Semaphore state="ambar">{warningTexts[warning.code]}</Semaphore>
          {warning.sourceLabel && warning.reviewedAt && (
            <DataSource kind="conocimiento" label={warning.sourceLabel} date={warning.reviewedAt} />
          )}
        </div>
      ))}
      <Money concept={concept} own={own} />
    </>
  )
}

export function ConceptCard({ concept, chosen = false, busy = false, onChoose, onEdit }: ConceptCardProps) {
  return (
    <Card as="article" className={styles.niche} aria-label={concept.promise}>
      <ConceptDetails concept={concept} />
      <div className={styles.actions}>
        {chosen ? (
          <Semaphore state="verde">{text.chosen}</Semaphore>
        ) : (
          <Button variant="primary" disabled={busy} onClick={onChoose}>
            {text.choose}
          </Button>
        )}
        <Button disabled={busy} onClick={onEdit}>
          {text.edit}
        </Button>
      </div>
    </Card>
  )
}

export const parseCount = (value: string): number | null => {
  const parsed = Number(value.replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export interface ConceptEditorProps {
  readonly concept: Concept
  readonly busy?: boolean
  readonly onSave: (concept: ConceptOutput) => void
  readonly onCancel: () => void
  /** More fields of the same form, for what only this screen has. */
  readonly extra?: ReactNode
}

export function ConceptEditor({ concept, busy = false, onSave, onCancel, extra }: ConceptEditorProps) {
  const [draft, setDraft] = useState(concept)
  const [long, setLong] = useState(String(concept.cadence.longPerWeek))
  const [shorts, setShorts] = useState(String(concept.cadence.shortsPerWeek))
  const [assumptions, setAssumptions] = useState(concept.monetization.assumptions.join('\n'))
  const [invalid, setInvalid] = useState(false)
  const update = (change: Partial<Concept>) => setDraft({ ...draft, ...change })
  const setPillar = (index: number, change: { title?: string; description?: string }) =>
    update({ pillars: draft.pillars.map((pillar, i) => (i === index ? { ...pillar, ...change } : pillar)) })

  const save = () => {
    const longPerWeek = parseCount(long)
    const shortsPerWeek = parseCount(shorts)
    const texts = [
      draft.promise,
      draft.audience.description,
      draft.format.longForm,
      draft.format.shortsRole,
      ...draft.pillars.flatMap(({ title, description }) => [title, description]),
    ]
    if (longPerWeek === null || shortsPerWeek === null || texts.some((value) => !value.trim())) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave({
      ...draft,
      cadence: { ...draft.cadence, longPerWeek, shortsPerWeek },
      monetization: {
        ...draft.monetization,
        assumptions: assumptions
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      },
    })
  }

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
        label={form.promise}
        description={form.promiseHelp}
        maxLength={160}
        rows={2}
        value={draft.promise}
        onChange={(event) => update({ promise: event.target.value })}
      />
      {draft.pillars.map((pillar, index) => (
        <div key={index} className={styles.form}>
          <TextField
            label={format(form.pillarTitle, { numero: index + 1 })}
            value={pillar.title}
            onChange={(event) => setPillar(index, { title: event.target.value })}
          />
          <TextArea
            label={format(form.pillarDescription, { numero: index + 1 })}
            rows={2}
            value={pillar.description}
            onChange={(event) => setPillar(index, { description: event.target.value })}
          />
        </div>
      ))}
      <TextArea
        label={form.audience}
        rows={2}
        value={draft.audience.description}
        onChange={(event) => update({ audience: { ...draft.audience, description: event.target.value } })}
      />
      <Checkbox
        label={form.madeForKids}
        checked={draft.audience.madeForKids}
        onChange={(event) => update({ audience: { ...draft.audience, madeForKids: event.target.checked } })}
      />
      <RadioGroup
        label={form.region}
        value={draft.audience.region}
        options={AUDIENCE_REGIONS.map((value) => ({ value, label: channelEs.rhythm.regionOptions[value] }))}
        onValueChange={(value) =>
          update({ audience: { ...draft.audience, region: value as Concept['audience']['region'] } })
        }
      />
      <RadioGroup
        label={form.presence}
        value={draft.format.presence}
        options={ON_CAMERA.map((value) => ({ value, label: text.presence[value] }))}
        onValueChange={(value) =>
          update({ format: { ...draft.format, presence: value as Concept['format']['presence'] } })
        }
      />
      <TextArea
        label={form.longForm}
        rows={2}
        value={draft.format.longForm}
        onChange={(event) => update({ format: { ...draft.format, longForm: event.target.value } })}
      />
      <TextArea
        label={form.shortsRole}
        rows={2}
        value={draft.format.shortsRole}
        onChange={(event) => update({ format: { ...draft.format, shortsRole: event.target.value } })}
      />
      <TextField
        label={form.longPerWeek}
        inputMode="decimal"
        value={long}
        onChange={(event) => setLong(event.target.value)}
      />
      <TextField
        label={form.shortsPerWeek}
        inputMode="decimal"
        value={shorts}
        onChange={(event) => setShorts(event.target.value)}
      />
      <TextArea
        label={form.assumptions}
        description={form.assumptionsHelp}
        optional
        rows={3}
        value={assumptions}
        onChange={(event) => setAssumptions(event.target.value)}
      />
      {extra}
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

export const isStale = (proposal: Pick<ProposalView, 'payload' | 'editedPayload'>) =>
  conceptsViewSchema.safeParse(proposal.editedPayload ?? proposal.payload).data?.stale === true

export interface ConceptsProps {
  readonly view: JourneyFullView
  readonly busy: boolean
  readonly reload: () => Promise<unknown>
  readonly onStep: (data: object) => void
}

export function Concepts({ view, busy, reload, onStep }: ConceptsProps) {
  const proposal = latestOf(view, 'conceptos')
  const { estimate, error: estimateError, refresh } = useEstimate(view.id, 'conceptos')
  const generate = useGenerate(view, estimate, async () => {
    await reload()
    await refresh()
  })
  const failed = estimateError ?? generate.error

  return (
    <div className={styles.options}>
      <p className={styles.why}>{text.why}</p>
      {view.state.conceptNeedsReview ? (
        <p role="status">{text.needsReview}</p>
      ) : (
        proposal && isStale(proposal) && <p role="status">{text.stale}</p>
      )}
      {failed !== null && (
        <ErrorMessage live title={errorText(failed)} action={{ label: es.app.retry, onClick: () => void refresh() }} />
      )}
      {proposal ? (
        <Proposal
          estimate={estimate}
          failure={generate.failure}
          claimsTrimmed={proposal.claimsTrimmed}
          busy={generate.busy}
          onRegenerate={(instructions) =>
            void generate.run('conceptos', { parentId: proposal.id, ...(instructions ? { instructions } : {}) })
          }
        >
          <List view={view} proposal={proposal} busy={busy} reload={reload} onStep={onStep} />
        </Proposal>
      ) : (
        <AiAction
          label={text.generate}
          estimate={estimate}
          failure={generate.failure}
          busy={generate.busy}
          onRun={() => void generate.run('conceptos')}
        />
      )}
    </div>
  )
}

function List({ view, proposal, busy, reload, onStep }: ConceptsProps & { proposal: ProposalView }) {
  const concepts = payloadOf<{ concepts: Concept[] }>(proposal).concepts
  const [editing, setEditing] = useState<number | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const review = view.state.conceptNeedsReview === true
  const chosenIndex = proposal.status === 'aprobada' && !review ? proposal.selectedIndex : null

  const decide = async (body: Parameters<typeof channelApi.decide>[1]) => {
    setDeciding(true)
    setError(null)
    try {
      await channelApi.decide(proposal.id, body)
      await reload()
      setEditing(null)
    } catch (caught) {
      setError(caught)
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className={styles.options}>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void reload() }} />
      )}
      {concepts.map((concept, index) =>
        editing === index ? (
          <ConceptEditor
            key={index}
            concept={concept}
            busy={deciding}
            onCancel={() => setEditing(null)}
            onSave={(edited) =>
              void decide({ editedPayload: { concepts: concepts.map((c, i) => (i === index ? edited : c)) } })
            }
          />
        ) : (
          <ConceptCard
            key={index}
            concept={concept}
            chosen={chosenIndex === index}
            busy={deciding}
            onChoose={() => void decide({ selectedIndex: index, status: 'aprobada' })}
            onEdit={() => setEditing(index)}
          />
        ),
      )}
      {chosenIndex !== null && (
        <div className={styles.actions}>
          <Button variant="primary" loading={busy} onClick={() => onStep({})}>
            {text.next}
          </Button>
        </div>
      )}
    </div>
  )
}
