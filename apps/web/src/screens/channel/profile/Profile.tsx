import type { ChannelProfile } from '@ytcreator/core'
import type {
  ChannelReadingView,
  ChannelView,
  MeasureView,
  ProfileVersionItem,
  ProfileVersionView,
} from '@ytcreator/core/api'
import { Button, DataSource, Disclosure, ErrorMessage, format, TextArea, TextField, useToast } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, channelApi, profileApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import styles from '../channel.module.css'
import { ConceptDetails, type ShownConcept } from '../new/Concepts.tsx'
import { Measured, isStale } from '../new/NicheCard.tsx'
import { ExportButtons } from './Export.tsx'
import { ProfileHistory } from './ProfileHistory.tsx'

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
  /** The promise of the last version the AI proposed, to tell what the creator wrote since (principle II). */
  readonly aiPromise?: string | null
}

// The profile shown with the same parts as a concept (FR-021b): the money and the warnings with their sources.
export function profileConcept({
  profile,
  createdAt,
}: Pick<ProfileVersionView, 'profile' | 'createdAt'>): ShownConcept {
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
    monetization: { assumptions: monetization.assumptions },
    figures: {
      monetization: {
        rpmEurRange: monetization.rpmEurRange,
        monthlyViewsAssumption: monetization.monthlyViewsAssumption,
        monthlyEurRange: monetization.monthlyEurRange,
        yppRequirements: monetization.yppRequirements,
        rpmSource: { label: rpm?.label ?? '', reviewedAt: rpm?.date ?? createdAt, confidence: monetization.confidence },
        yppSource: { label: ypp?.label ?? '', reviewedAt: ypp?.date ?? createdAt },
      },
      warnings: profile.concept.warnings.map(({ code, sourceId }) => ({
        code,
        sourceLabel: source(sourceId)?.label ?? null,
        reviewedAt: source(sourceId)?.date ?? null,
      })),
    },
  }
}

export interface ProfileViewProps {
  readonly data: ProfileData
  readonly now: Date
  readonly onEdit: () => void
  readonly onChooseName: () => void
}

// US5 AS1: the whole profile in one page, with the figures and their dates (FR-026).
export function ProfileView({ data, now, onEdit, onChooseName }: ProfileViewProps) {
  const { channel, current, measure, reading, staleDays, aiPromise } = data
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
        {named
          ? profile.name.handle && <p>{format(text.handle, { arroba: profile.name.handle })}</p>
          : channel.origin === 'nuevo' && (
              <>
                <h3>{channelEs.start.nameMissing}</h3>
                <p>{channelEs.start.nameMissingWhy}</p>
                <div className={styles.actions}>
                  <Button onClick={onChooseName}>{channelEs.start.chooseName}</Button>
                </div>
              </>
            )}
      </section>

      <section className={styles.option}>
        <h2>{text.niche}</h2>
        <p>
          <strong>{profile.niche.label}</strong>
        </p>
        {profile.niche.summary !== profile.niche.label && <p>{profile.niche.summary}</p>}
        {stale && (
          <p className={styles.notice} role="status">
            {format(channelEs.niches.stale, { dias: String(staleDays) })}
          </p>
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
        concept={profileConcept(current)}
        promiseNote={
          aiPromise != null && aiPromise !== current.profile.concept.promise ? text.promiseByCreator : undefined
        }
        own={
          ownReading ? { medianViews: ownReading.summary.long.medianViews, readAt: ownReading.fetchedAt } : undefined
        }
      />

      <div className={styles.option}>
        <p className={styles.why}>{text.editWhy}</p>
        <div className={styles.actions}>
          <Button onClick={onEdit}>{text.edit}</Button>
        </div>
      </div>

      <ExportButtons channelId={channel.id} />

      <p className={styles.why}>{text.nextStep}</p>
    </>
  )
}

export interface ProfileEditorProps {
  readonly profile: ChannelProfile
  readonly busy: boolean
  readonly onSave: (profile: ChannelProfile) => void
  readonly onCancel: () => void
}

// Only the words: the server keeps the figures, the answers they rest on and the name (principle V).
export function ProfileEditor({ profile, busy, onSave, onCancel }: ProfileEditorProps) {
  const [summary, setSummary] = useState(profile.niche.summary)
  const [promise, setPromise] = useState(profile.concept.promise)
  const [pillars, setPillars] = useState(profile.concept.pillars.map((pillar) => ({ ...pillar })))
  const [audience, setAudience] = useState(profile.concept.audience.description)
  const [longForm, setLongForm] = useState(profile.concept.format.longForm)
  const [shortsRole, setShortsRole] = useState(profile.concept.format.shortsRole)
  const [invalid, setInvalid] = useState(false)

  const save = () => {
    const texts = [
      summary,
      promise,
      audience,
      longForm,
      shortsRole,
      ...pillars.flatMap((p) => [p.title, p.description]),
    ]
    if (texts.some((value) => value.trim() === '') || promise.trim().length > 160) {
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
        audience: { ...profile.concept.audience, description: audience.trim() },
        format: { ...profile.concept.format, longForm: longForm.trim(), shortsRole: shortsRole.trim() },
      },
    })
  }

  return (
    <form
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
      <TextArea label={form.longForm} value={longForm} onChange={(e) => setLongForm(e.target.value)} />
      <TextArea label={form.shortsRole} value={shortsRole} onChange={(e) => setShortsRole(e.target.value)} />
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

export interface ProfileProps {
  readonly channel: ChannelView
  readonly journeyId: string | null
  readonly onChooseName: () => void
}

// «Mi canal» once the journey is done: the profile, its versions and its export (US5).
export function Profile({ channel, journeyId, onChooseName }: ProfileProps) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [versions, setVersions] = useState<readonly ProfileVersionItem[]>([])
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [shown, setShown] = useState<ProfileVersionView | null>(null)
  // Saved meanwhile in another tab or window: the editor closes on what is there now, and the screen says so.
  const [conflict, setConflict] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setError(null)
    try {
      const [current, list, journey] = await Promise.all([
        channelApi.current(),
        profileApi.versions(channel.id),
        journeyId ? channelApi.journey(journeyId) : Promise.resolve(null),
      ])
      if (!current.channel || !current.profile) return
      const { profile } = current.profile
      // The last version the AI proposed, if the current one is not it: only to mark what the creator wrote.
      const ia = list
        .filter((item) => item.origin === 'ia')
        .reduce<ProfileVersionItem | null>((last, item) => (last && last.version > item.version ? last : item), null)
      const aiPromise =
        ia && ia.version !== current.profile.version
          ? (await profileApi.version(channel.id, ia.version)).profile.concept.promise
          : null
      setVersions(list)
      setData({
        channel: current.channel,
        current: current.profile,
        measure: journey?.measures.find((m) => m.id === profile.niche.measureId) ?? null,
        reading: journey?.reading ?? null,
        staleDays: journey?.measureStaleDays ?? 90,
        aiPromise,
      })
    } catch (caught) {
      setError(caught)
    }
  }, [channel.id, journeyId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (profile: ChannelProfile) => {
    if (!data) return
    setSaving(true)
    setError(null)
    setConflict(false)
    try {
      const saved = await profileApi.save(channel.id, { baseVersion: data.current.version, profile })
      setEditing(false)
      toast({ title: format(text.saved, { version: String(saved.version) }) })
      await load()
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.body?.code === 'conflicto') {
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
      {conflict && (
        <p className={styles.notice} role="alert">
          {text.conflict}
        </p>
      )}
      {!data && error === null && <p className={styles.why}>{es.app.loading}</p>}
      {data &&
        (editing ? (
          <ProfileEditor
            profile={data.current.profile}
            busy={saving}
            onSave={(profile) => void save(profile)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ProfileView
            data={data}
            now={new Date()}
            onEdit={() => {
              setConflict(false)
              setEditing(true)
            }}
            onChooseName={onChooseName}
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
              <ConceptDetails concept={profileConcept(shown)} />
            </div>
          )}
        </Disclosure>
      )}
    </>
  )
}
