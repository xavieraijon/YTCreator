import {
  cadenceWithinLimits,
  AUDIENCE_REGIONS,
  type ChannelProfile,
  ON_CAMERA,
  hoursNeeded,
  type ProfilePart,
  type Rhythm,
  type RpmCategory,
  type YouTubeFailureCode,
} from '@ytcreator/core'
import type {
  AiRunFailure,
  ChannelReadingView,
  EstimateView,
  ChannelView,
  MeasureView,
  ProfileRegeneration,
  ProfileVersionItem,
  ProfileVersionView,
} from '@ytcreator/core/api'
import {
  Button,
  Checkbox,
  DataSource,
  Disclosure,
  ErrorMessage,
  format,
  RadioGroup,
  TextArea,
  TextField,
  useToast,
} from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiClientError, channelApi, profileApi } from '../../../api/client.ts'
import { navigate, useLeaveGuard } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { useJob } from '../../../shell/useJob.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import {
  youtubeFailureActionsEs,
  youtubeFailuresEs,
  type YouTubeFailureText,
} from '../../../strings/youtube-failures.es.ts'
import styles from '../channel.module.css'
import { ConceptDetails, parseCount, type ShownConcept } from '../new/Concepts.tsx'
import { Measured, isStale } from '../new/NicheCard.tsx'
import { ExportButtons } from './Export.tsx'
import { NamePanel } from './NamePanel.tsx'
import { ProfileHistory } from './ProfileHistory.tsx'
import { RewritePart } from './RewritePart.tsx'

const text = channelEs.profile
const form = text.form
const DAY_MS = 86_400_000
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)

export interface ProfileData {
  readonly channel: ChannelView
  readonly current: ProfileVersionView
  readonly measure: MeasureView | null
  readonly reading: ChannelReadingView | null
  readonly staleDays: number
  /** What a video takes, to say the hours the rhythm needs (entry 136). */
  readonly rhythm?: Rhythm | undefined
  /** The promise of the last version the AI proposed, to tell what the creator wrote since (principle II). */
  /** The promises the AI wrote, to mark the one the creator wrote instead (entry 111). */
  readonly aiPromises?: readonly string[]
  /** The kind of content the money of the current version is worked out with (P8). */
  readonly category?: RpmCategory | null
}

// The profile shown with the same parts as a concept (FR-021b): the money and the warnings with their sources.
export function profileConcept(
  { profile, createdAt }: Pick<ProfileVersionView, 'profile' | 'createdAt'>,
  rhythm?: Rhythm,
  category?: RpmCategory | null,
): ShownConcept {
  const source = (id: string) => profile.sources.find((s) => s.id === id)
  const rpm = source('rpm')
  const ypp = source('ypp')
  const { monetization } = profile.concept
  return {
    promise: profile.concept.promise,
    pillars: profile.concept.pillars,
    audience: profile.concept.audience,
    format: profile.concept.format,
    cadence: profile.concept.cadence,
    monetization: { assumptions: monetization.assumptions, category: category ?? null },
    figures: {
      monetization: {
        rpmEurRange: monetization.rpmEurRange,
        monthlyViewsAssumption: monetization.monthlyViewsAssumption,
        monthlyEurRange: monetization.monthlyEurRange,
        yppRequirements: monetization.yppRequirements,
        rpmSource: { label: rpm?.label ?? '', reviewedAt: rpm?.date ?? createdAt, confidence: monetization.confidence },
        yppSource: { label: ypp?.label ?? '', reviewedAt: ypp?.date ?? createdAt },
      },
      warnings: [
        ...profile.concept.warnings.map(({ code, sourceId }) => ({
          code,
          sourceLabel: source(sourceId)?.label ?? null,
          reviewedAt: source(sourceId)?.date ?? null,
        })),
        // It comes from the creator's own hours, not from the knowledge, so it is not stored: it is worked out here
        // from the rhythm as it is now (novice audit 003, round 2, M1).
        ...(rhythm && hoursNeeded(profile.concept.cadence, rhythm) > profile.concept.cadence.hoursPerWeek
          ? [{ code: 'ritmo_insostenible' as const, sourceLabel: null, reviewedAt: null }]
          : []),
      ],
    },
  }
}

// The profile with the part the AI proposed in it, for «Editar antes de guardar» (entry 115).
export function withProposedPart(profile: ChannelProfile, { proposed }: ProfileRegeneration): ChannelProfile {
  return {
    ...profile,
    concept: {
      ...profile.concept,
      ...(proposed.promise !== undefined ? { promise: proposed.promise } : {}),
      ...(proposed.pillars !== undefined ? { pillars: proposed.pillars } : {}),
      ...(proposed.audienceDescription !== undefined
        ? { audience: { ...profile.concept.audience, description: proposed.audienceDescription } }
        : {}),
    },
  }
}

export interface ProfileViewProps {
  readonly data: ProfileData
  readonly now: Date
  readonly onEdit: () => void
  readonly onChooseName: () => void
  /** The panel to change the name, once open (entry 136): it takes the place of the name's button. */
  readonly naming?: ReactNode
  /** Where the download went (novice audit 003, M7). */
  readonly onDownloaded?: ((message: string) => void) | undefined
  /** «Volver a medir» (entry 114): only for a niche that was measured. */
  readonly onRemeasure?: (() => void) | undefined
  readonly remeasuring?: boolean
  /** «Reescribir con la IA» (entry 115): the button, and the panel once it is open. */
  readonly onRewrite?: (() => void) | undefined
  readonly rewrite?: ReactNode
}

// US5 AS1: the whole profile in one page, with the figures and their dates (FR-026).
export function ProfileView({
  data,
  now,
  onEdit,
  onChooseName,
  naming,
  onDownloaded,
  onRemeasure,
  remeasuring = false,
  onRewrite,
  rewrite,
}: ProfileViewProps) {
  const { channel, current, measure, reading, staleDays, rhythm, aiPromises, category } = data
  const { profile } = current
  const measured = measure?.status === 'medida' && measure.measuredAt ? measure : null
  const ownReading = profile.context && reading?.id === profile.context.readingId ? reading : null
  // FR-027: figures that may have changed since they were read.
  const stale =
    (measured !== null && isStale(measured, staleDays, now)) ||
    (ownReading !== null && now.getTime() - Date.parse(ownReading.fetchedAt) > staleDays * DAY_MS)
  const named = profile.name.displayName !== null

  return (
    <>
      <p className={styles.why}>{text.why}</p>

      <section className={styles.option}>
        {/* The name of the channel heads its profile, the same as the start screen did before. */}
        <h2>{named ? profile.name.displayName : text.name}</h2>
        {named ? (
          <>
            {profile.name.handle && <p>{format(text.handle, { arroba: profile.name.handle })}</p>}
            {/* Entry 136: a new channel changes its name here, with the check of the @. */}
            {channel.origin === 'nuevo' && !naming && (
              <div className={styles.actions}>
                <Button onClick={onChooseName}>{text.changeName}</Button>
              </div>
            )}
          </>
        ) : (
          channel.origin === 'nuevo' && (
            <>
              <h3>{channelEs.start.nameMissing}</h3>
              <p>{channelEs.start.nameMissingWhy}</p>
              {!naming && (
                <div className={styles.actions}>
                  <Button onClick={onChooseName}>{channelEs.start.chooseName}</Button>
                </div>
              )}
            </>
          )
        )}
      </section>
      {naming}
      <p className={styles.why}>{channelEs.start.oneChannelHere}</p>

      <section className={styles.option}>
        <h2>{text.niche}</h2>
        <p>
          <strong>{profile.niche.label}</strong>
        </p>
        {profile.niche.summary !== profile.niche.label && <p>{profile.niche.summary}</p>}
        {stale && (
          <>
            <p className={styles.notice} role="status">
              {format(channelEs.niches.stale, { dias: String(staleDays) })}
            </p>
            {/* Entries 114 and 125: the niche measured again, or the channel that already existed read again. */}
            {(measured || ownReading) && onRemeasure && (
              <div className={styles.actions}>
                <Button onClick={onRemeasure} loading={remeasuring}>
                  {ownReading
                    ? remeasuring
                      ? text.rereading
                      : text.reread
                    : remeasuring
                      ? text.remeasuring
                      : text.remeasure}
                </Button>
              </div>
            )}
          </>
        )}
        {measured ? (
          <Measured measure={measured} date={measured.measuredAt!} />
        ) : (
          !profile.context && <p className={styles.why}>{text.nicheNoFigures}</p>
        )}
      </section>

      {profile.context && (
        <section className={styles.option}>
          <h2>{text.today}</h2>
          <p className={styles.why}>{text.todayWhy}</p>
          {profile.context.currentProfile.split('\n').map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <DataSource kind="ia" />
          {ownReading && (
            <>
              <p>{format(text.readAt, { videos: number(ownReading.summary.videosRead) })}</p>
              <DataSource kind="youtube" date={ownReading.fetchedAt} />
            </>
          )}
        </section>
      )}

      <ConceptDetails
        concept={profileConcept(current, rhythm, category)}
        rhythm={rhythm}
        existing={profile.context !== null}
        promiseNote={
          aiPromises && aiPromises.length > 0 && !aiPromises.includes(current.profile.concept.promise)
            ? text.promiseByCreator
            : undefined
        }
        own={
          ownReading ? { medianViews: ownReading.summary.long.medianViews, readAt: ownReading.fetchedAt } : undefined
        }
      />

      <div className={styles.option}>
        <p className={styles.why}>{text.editWhy}</p>
        <div className={styles.actions}>
          {/* While a new measure is being saved, nothing else is saved over it (entry 114). */}
          <Button onClick={onEdit} disabled={remeasuring}>
            {text.edit}
          </Button>
          {onRewrite && !rewrite && (
            <Button onClick={onRewrite} disabled={remeasuring}>
              {text.rewrite.open}
            </Button>
          )}
        </div>
      </div>
      {rewrite}

      <ExportButtons channelId={channel.id} onDownloaded={onDownloaded} />

      <div className={styles.option}>
        <p className={styles.why}>{text.nextStep}</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => navigate({ page: 'ideaBank' })}>
            {ideasEs.bank.open}
          </Button>
          <Button variant="secondary" onClick={() => navigate({ page: 'scriptList' })}>
            {scriptEs.list.channelLink}
          </Button>
        </div>
      </div>
    </>
  )
}

export interface ProfileEditorProps {
  readonly profile: ChannelProfile
  readonly busy: boolean
  readonly onSave: (profile: ChannelProfile) => void
  readonly onCancel: () => void
}

// The words and the answers (entry 117): the server works the money and the warnings out again from the answers, and
// keeps the figures of YouTube and the name (principle V).
export function ProfileEditor({ profile, busy, onSave, onCancel }: ProfileEditorProps) {
  const [summary, setSummary] = useState(profile.niche.summary)
  const [promise, setPromise] = useState(profile.concept.promise)
  const [pillars, setPillars] = useState(profile.concept.pillars.map((pillar) => ({ ...pillar })))
  const [audience, setAudience] = useState(profile.concept.audience.description)
  const [longForm, setLongForm] = useState(profile.concept.format.longForm)
  const [shortsRole, setShortsRole] = useState(profile.concept.format.shortsRole)
  const [madeForKids, setMadeForKids] = useState(profile.concept.audience.madeForKids)
  const [region, setRegion] = useState(profile.concept.audience.region)
  const [presence, setPresence] = useState(profile.concept.format.presence)
  const [hours, setHours] = useState(String(profile.concept.cadence.hoursPerWeek))
  const [long, setLong] = useState(String(profile.concept.cadence.longPerWeek))
  const [shorts, setShorts] = useState(String(profile.concept.cadence.shortsPerWeek))
  const [assumptions, setAssumptions] = useState(profile.concept.monetization.assumptions.join('\n'))
  const [invalid, setInvalid] = useState(false)
  // What is written and not saved yet: leaving asks first (novice audit 003, M4).
  const fields = JSON.stringify([
    summary,
    promise,
    pillars,
    audience,
    longForm,
    shortsRole,
    madeForKids,
    region,
    presence,
    hours,
    long,
    shorts,
    assumptions,
  ])
  const [initial] = useState(fields)
  useLeaveGuard(fields !== initial && !busy ? text.unsaved : null)
  // Opened, the editor starts at its top with the first field ready, not where the button was (novice audit 003,
  // round 3, M2).
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const opened = formRef.current
    opened?.scrollIntoView?.({ block: 'start' })
    opened?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true })
  }, [])

  const save = () => {
    const texts = [
      summary,
      promise,
      audience,
      longForm,
      shortsRole,
      ...pillars.flatMap((p) => [p.title, p.description]),
    ]
    const [hoursPerWeek, longPerWeek, shortsPerWeek] = [parseCount(hours), parseCount(long), parseCount(shorts)]
    // What changes in the rhythm has to be what the journey and the concepts accept (entry 124).
    const cadenceOk =
      hoursPerWeek != null &&
      longPerWeek != null &&
      shortsPerWeek != null &&
      cadenceWithinLimits(profile.concept.cadence, { hoursPerWeek, longPerWeek, shortsPerWeek })
    if (
      texts.some((value) => value.trim() === '') ||
      promise.trim().length > 160 ||
      !cadenceOk ||
      hoursPerWeek == null ||
      longPerWeek == null ||
      shortsPerWeek == null
    ) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave({
      ...profile,
      niche: { ...profile.niche, summary: summary.trim() },
      concept: {
        ...profile.concept,
        promise: promise.trim(),
        pillars: pillars.map((p) => ({ title: p.title.trim(), description: p.description.trim() })),
        audience: { description: audience.trim(), region, madeForKids },
        format: { presence, longForm: longForm.trim(), shortsRole: shortsRole.trim() },
        cadence: { hoursPerWeek, longPerWeek, shortsPerWeek },
        monetization: {
          ...profile.concept.monetization,
          assumptions: assumptions
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        },
      },
    })
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className={styles.why}>{text.editWhy}</p>
      {invalid && (
        <p className={styles.alert} role="alert">
          {form.invalid}
        </p>
      )}
      <TextArea label={form.nicheSummary} value={summary} onChange={(e) => setSummary(e.target.value)} />
      <TextField
        label={form.promise}
        description={form.promiseHelp}
        value={promise}
        maxLength={160}
        onChange={(e) => setPromise(e.target.value)}
      />
      {pillars.map((pillar, index) => (
        <div key={index} className={styles.option}>
          <TextField
            label={format(form.pillarTitle, { numero: String(index + 1) })}
            value={pillar.title}
            onChange={(e) => setPillars(pillars.map((p, i) => (i === index ? { ...p, title: e.target.value } : p)))}
          />
          <TextArea
            label={format(form.pillarDescription, { numero: String(index + 1) })}
            value={pillar.description}
            onChange={(e) =>
              setPillars(pillars.map((p, i) => (i === index ? { ...p, description: e.target.value } : p)))
            }
          />
        </div>
      ))}
      <TextArea label={form.audience} value={audience} onChange={(e) => setAudience(e.target.value)} />
      <Checkbox label={form.madeForKids} checked={madeForKids} onChange={(e) => setMadeForKids(e.target.checked)} />
      <RadioGroup
        label={form.region}
        value={region}
        options={AUDIENCE_REGIONS.map((value) => ({ value, label: channelEs.rhythm.regionOptions[value] }))}
        onValueChange={(value) => setRegion(value as typeof region)}
      />
      <RadioGroup
        label={form.presence}
        value={presence}
        options={ON_CAMERA.map((value) => ({ value, label: channelEs.concepts.presence[value] }))}
        onValueChange={(value) => setPresence(value as typeof presence)}
      />
      <TextArea label={form.longForm} value={longForm} onChange={(e) => setLongForm(e.target.value)} />
      <TextArea label={form.shortsRole} value={shortsRole} onChange={(e) => setShortsRole(e.target.value)} />
      <TextField label={form.hours} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
      <TextField label={form.longPerWeek} inputMode="decimal" value={long} onChange={(e) => setLong(e.target.value)} />
      <TextField
        label={form.shortsPerWeek}
        inputMode="decimal"
        value={shorts}
        onChange={(e) => setShorts(e.target.value)}
      />
      <TextArea
        label={form.assumptions}
        description={form.assumptionsHelp}
        rows={3}
        value={assumptions}
        onChange={(e) => setAssumptions(e.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {form.save}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {form.cancel}
        </Button>
      </div>
    </form>
  )
}

// The promises the AI wrote: those an AI version brought of its own. One that rewrote the topics or the audience kept
// the promise it had, which may be the creator's; one brought back from the history is still the AI's (entry 111).
async function aiPromisesOf(channelId: string, list: readonly ProfileVersionItem[]): Promise<string[]> {
  const numbers = new Set(list.map((item) => item.version))
  const promiseOf = async (version: number) => (await profileApi.version(channelId, version)).profile.concept.promise
  const written = await Promise.all(
    list
      .filter((item) => item.origin === 'ia')
      .map(async ({ version }) => {
        const promise = await promiseOf(version)
        return !numbers.has(version - 1) || (await promiseOf(version - 1)) !== promise ? promise : null
      }),
  )
  return written.filter((promise) => promise !== null)
}

export interface ProfileProps {
  readonly channel: ChannelView
  readonly journeyId: string | null
}

// «Mi canal» once the journey is done: the profile, its versions and its export (US5).
export function Profile({ channel, journeyId }: ProfileProps) {
  // The panel to change the name (entry 136).
  const [naming, setNaming] = useState(false)
  const [data, setData] = useState<ProfileData | null>(null)
  const [versions, setVersions] = useState<readonly ProfileVersionItem[]>([])
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [shown, setShown] = useState<ProfileVersionView | null>(null)
  // Saved meanwhile in another tab or window: the editor closes on what is there now, and the screen says so.
  const [conflict, setConflict] = useState(false)
  // «Volver a medir» runs in the background (entry 114).
  const [remeasureJob, setRemeasureJob] = useState<string | null>(null)
  const [remeasureFailure, setRemeasureFailure] = useState<YouTubeFailureText | null>(null)
  const remeasureWatch = useJob(remeasureJob)
  // «Reescribir con la IA» (entry 115).
  const [rewriting, setRewriting] = useState(false)
  const [part, setPart] = useState<ProfilePart>('promesa')
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  const [aiFailure, setAiFailure] = useState<AiRunFailure | null>(null)
  const [asking, setAsking] = useState(false)
  const [proposal, setProposal] = useState<ProfileRegeneration | null>(null)
  const [approving, setApproving] = useState(false)
  // «Editar antes de guardar»: the editor opens on the profile with the proposed part in it.
  const [draft, setDraft] = useState<{ profile: ChannelProfile; regenerationId: string } | null>(null)
  const [expired, setExpired] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async (): Promise<ProfileData | null> => {
    setError(null)
    try {
      const [current, list, journey, pending, reading] = await Promise.all([
        channelApi.current(),
        profileApi.versions(channel.id),
        journeyId ? channelApi.journey(journeyId) : Promise.resolve(null),
        profileApi.pendingRegeneration(channel.id),
        profileApi.reading(channel.id),
      ])
      if (!current.channel || !current.profile) return null
      const { profile } = current.profile
      // The promise the AI wrote last, only to mark what the creator wrote since (entry 111).
      const aiPromises = await aiPromisesOf(channel.id, list)
      setVersions(list)
      // A proposal already paid for is shown again on coming back, until the creator saves it or leaves it (entry 119).
      if (pending) {
        setProposal(pending)
        setPart(pending.part)
        setRewriting(true)
      }
      const next: ProfileData = {
        channel: current.channel,
        current: current.profile,
        measure: journey?.measures.find((m) => m.id === profile.niche.measureId) ?? null,
        reading,
        staleDays: journey?.measureStaleDays ?? 90,
        rhythm: journey?.rhythm,
        aiPromises,
        category: current.category ?? null,
      }
      setData(next)
      // A measure or reading still running after leaving and coming back: the screen follows it again (entry 130).
      const running = journey?.jobs.findLast(
        (job) => job.status === 'en_curso' && job.kind === (profile.context ? 'leer_canal' : 'medir_nichos'),
      )
      if (running) setRemeasureJob(running.id)
      return next
    } catch (caught) {
      setError(caught)
      return null
    }
  }, [channel.id, journeyId])

  useEffect(() => {
    void load()
  }, [load])

  const remeasure = async () => {
    setRemeasureFailure(null)
    setError(null)
    try {
      setRemeasureJob((await profileApi.remeasure(channel.id)).jobId)
    } catch (caught) {
      setError(caught)
    }
  }

  useEffect(() => {
    if (!remeasureWatch || remeasureWatch.status === 'en_curso') return
    setRemeasureJob(null)
    if (remeasureWatch.status === 'fallido') {
      const failure = remeasureWatch.failure as YouTubeFailureCode | null
      setRemeasureFailure(
        failure && failure in youtubeFailuresEs
          ? youtubeFailuresEs[failure]
          : { what: es.clientError.respuesta, action: 'volver_a_intentar' },
      )
      return
    }
    void load().then((loaded) =>
      toast({ title: loaded?.current.profile.context ? text.rereadDone : text.remeasuredDone, tone: 'success' }),
    )
  }, [remeasureWatch, load, toast])

  // What the AI would cost, asked for once the panel is open (FR-029): an estimate is used once.
  const refreshEstimate = useCallback(
    async (which: ProfilePart) => {
      setEstimate(null)
      try {
        setEstimate(await profileApi.estimate(channel.id, which))
      } catch (caught) {
        setError(caught)
      }
    },
    [channel.id],
  )

  useEffect(() => {
    if (rewriting && !proposal) void refreshEstimate(part)
  }, [rewriting, part, proposal, refreshEstimate])

  const closeRewrite = () => {
    setExpired(false)
    setRewriting(false)
    setProposal(null)
    setAiFailure(null)
    setEstimate(null)
  }

  const isConflict = (caught: unknown) => caught instanceof ApiClientError && caught.body?.code === 'conflicto'

  const ask = async (instructions: string) => {
    if (!data || !estimate) return
    setAsking(true)
    setAiFailure(null)
    setExpired(false)
    setError(null)
    try {
      const outcome = await profileApi.regenerate(channel.id, {
        part,
        baseVersion: data.current.version,
        estimateId: estimate.estimateId,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      })
      if ('failure' in outcome) {
        setAiFailure(outcome.failure)
        await refreshEstimate(part)
      } else {
        setProposal(outcome)
      }
    } catch (caught) {
      if (isConflict(caught)) {
        closeRewrite()
        await load()
        setConflict(true)
      } else {
        setError(caught)
        await refreshEstimate(part)
      }
    } finally {
      setAsking(false)
    }
  }

  const approve = async () => {
    if (!proposal) return
    setApproving(true)
    setError(null)
    try {
      const saved = await profileApi.approveRegeneration(channel.id, {
        regenerationId: proposal.regenerationId,
        baseVersion: proposal.baseVersion,
      })
      closeRewrite()
      toast({ title: format(text.saved, { version: String(saved.version) }) })
      await load()
    } catch (caught) {
      if (isConflict(caught)) {
        closeRewrite()
        await load()
        setConflict(true)
      } else if (caught instanceof ApiClientError && caught.body?.code === 'no_encontrado') {
        // Too old to be saved: it can be asked for again.
        setProposal(null)
        setExpired(true)
      } else {
        setError(caught)
      }
    } finally {
      setApproving(false)
    }
  }

  const discard = async () => {
    if (!proposal) return
    setError(null)
    try {
      await profileApi.discardRegeneration(channel.id, proposal.regenerationId)
    } catch (caught) {
      // Already gone (saved or left in another window): nothing to keep.
      if (!(caught instanceof ApiClientError && caught.body?.code === 'no_encontrado')) {
        setError(caught)
        return
      }
    }
    setExpired(false)
    setProposal(null)
  }

  const save = async (profile: ChannelProfile) => {
    if (!data) return
    setSaving(true)
    setError(null)
    setConflict(false)
    try {
      const saved = await profileApi.save(channel.id, { baseVersion: data.current.version, profile })
      setEditing(false)
      // The proposal is in this version now: it no longer waits (entry 119).
      if (draft) await profileApi.discardRegeneration(channel.id, draft.regenerationId).catch(() => undefined)
      setDraft(null)
      toast({ title: format(text.saved, { version: String(saved.version) }) })
      await load()
    } catch (caught) {
      if (isConflict(caught)) {
        setDraft(null)
        // Nothing is saved over what the other tab saved: the creator sees it first and edits again if they want.
        setEditing(false)
        await load()
        setConflict(true)
      } else {
        // The editor stays open with what was typed.
        setError(caught)
      }
    } finally {
      setSaving(false)
    }
  }

  const restore = async (version: number) => {
    setRestoring(version)
    setError(null)
    try {
      const restored = await profileApi.restore(channel.id, version)
      setShown(null)
      toast({ title: format(text.restored, { anterior: String(version), version: String(restored.version) }) })
      await load()
    } catch (caught) {
      setError(caught)
    } finally {
      setRestoring(null)
    }
  }

  const show = async (version: number | null) => {
    if (version === null) {
      setShown(null)
      return
    }
    try {
      setShown(await profileApi.version(channel.id, version))
    } catch (caught) {
      setError(caught)
    }
  }

  return (
    <>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      )}
      {remeasureFailure !== null && (
        <ErrorMessage
          live
          title={remeasureFailure.what}
          action={
            remeasureFailure.action === 'ir_a_ajustes'
              ? { label: youtubeFailureActionsEs.ir_a_ajustes, onClick: () => navigate({ page: 'youtubeSettings' }) }
              : remeasureFailure.action === 'esperar'
                ? { label: youtubeFailureActionsEs.esperar, onClick: () => setRemeasureFailure(null) }
                : { label: youtubeFailureActionsEs.volver_a_intentar, onClick: () => void remeasure() }
          }
        />
      )}
      {conflict && (
        <p className={styles.notice} role="alert">
          {text.conflict}
        </p>
      )}
      {!data && error === null && <p className={styles.why}>{es.app.loading}</p>}
      {data &&
        (editing ? (
          <ProfileEditor
            profile={draft?.profile ?? data.current.profile}
            busy={saving}
            onSave={(profile) => void save(profile)}
            onCancel={() => {
              setEditing(false)
              // The proposal opened in the editor still waits: it shows again (entry 126).
              if (draft) void load()
              setDraft(null)
            }}
          />
        ) : (
          <ProfileView
            data={data}
            now={new Date()}
            onEdit={() => {
              setConflict(false)
              closeRewrite()
              setDraft(null)
              setEditing(true)
            }}
            onChooseName={() => {
              setEditing(false)
              setNaming(true)
            }}
            onDownloaded={(message) => toast({ title: message, tone: 'success' })}
            naming={
              naming && journeyId ? (
                <NamePanel
                  channelId={channel.id}
                  journeyId={journeyId}
                  current={data.current.profile.name}
                  onCancel={() => setNaming(false)}
                  onSaved={(message) => {
                    setNaming(false)
                    toast({ title: message, tone: 'success' })
                    void load()
                  }}
                />
              ) : undefined
            }
            onRemeasure={() => void remeasure()}
            remeasuring={remeasureJob !== null}
            onRewrite={() => {
              setConflict(false)
              setRewriting(true)
            }}
            rewrite={
              rewriting ? (
                <RewritePart
                  part={part}
                  estimate={estimate}
                  failure={aiFailure}
                  busy={asking}
                  proposal={proposal}
                  saving={approving}
                  locked={remeasureJob !== null}
                  expired={expired}
                  outdated={proposal !== null && proposal.baseVersion !== data.current.version}
                  onPart={(next) => {
                    setPart(next)
                    setAiFailure(null)
                  }}
                  onAsk={(instructions) => void ask(instructions)}
                  onApprove={() => void approve()}
                  onDiscard={() => void discard()}
                  onEdit={() => {
                    if (!proposal) return
                    // Saved from the editor it is the creator's version (`manual`); the AI one is left unsaved.
                    setDraft({
                      profile: withProposedPart(data.current.profile, proposal),
                      regenerationId: proposal.regenerationId,
                    })
                    closeRewrite()
                    setEditing(true)
                  }}
                  onClose={closeRewrite}
                />
              ) : undefined
            }
          />
        ))}
      {data && versions.length > 1 && !editing && (
        <Disclosure summary={text.history}>
          <p className={styles.why}>{text.historyWhy}</p>
          <ProfileHistory
            versions={versions}
            current={data.current.version}
            busy={restoring}
            shown={shown?.version ?? null}
            onRestore={(version) => void restore(version)}
            onShow={(version) => void show(version)}
          />
          {shown && (
            <div className={styles.proposal}>
              <h3>{format(text.version, { numero: String(shown.version) })}</h3>
              <p>
                <strong>{shown.profile.niche.label}</strong>
              </p>
              <ConceptDetails
                concept={profileConcept(shown, data.rhythm)}
                rhythm={data.rhythm}
                existing={shown.profile.context !== null}
              />
            </div>
          )}
        </Disclosure>
      )}
    </>
  )
}
