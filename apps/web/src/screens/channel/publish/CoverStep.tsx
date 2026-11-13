import {
  AI_THUMBNAILS,
  PUBLISH_LIMITS,
  TITLE_COUNTS,
  type ThumbnailConcept,
  type ThumbnailsContent,
  type TitlesContent,
} from '@ytcreator/core'
import type { PackageView } from '@ytcreator/core/api'
import {
  Button,
  Card,
  Checkbox,
  DataSource,
  ErrorMessage,
  format,
  RadioGroup,
  TextArea,
  TextField,
} from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { packagesApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { type PackageAi, usePackageEstimate } from './usePackageAi.ts'

const text = publishEs.cover
// A choice is saved a moment after the last change, so that moving through the options with the arrows saves once
// and the focus stays where it is (principle VI).
const CHOICE_DELAY_MS = 400
type TitleChoice = Pick<TitlesContent, 'main' | 'alternatives'>
const CONCEPT_FIELDS = ['scene', 'bigText', 'emotion', 'composition', 'colors'] as const
type ConceptField = (typeof CONCEPT_FIELDS)[number]

export interface CoverStepProps {
  readonly pkg: PackageView
  readonly ai: PackageAi
  readonly onChange: (pkg: PackageView) => void
  readonly onError: (cause: unknown) => void
  readonly onNext: () => void
}

/** Whether the cover is approved in the versions there are now. */
export function coverApproved(pkg: PackageView): boolean {
  const { titulos, miniaturas, portada_short } = pkg.pieces
  const cover = pkg.approvals.cover
  const second =
    pkg.format === 'short' ? { key: 'portada_short', piece: portada_short } : { key: 'miniaturas', piece: miniaturas }
  return (
    cover !== null &&
    titulos !== null &&
    second.piece !== null &&
    cover['titulos'] === titulos.version &&
    cover[second.key] === second.piece.version
  )
}

// «Título y miniatura»: what makes people click (contracts/ui-screens.md).
export function CoverStep({ pkg, ai, onChange, onError, onNext }: CoverStepProps) {
  const titles = pkg.pieces.titulos
  const thumbnails = pkg.pieces.miniaturas
  const isShort = pkg.format === 'short'
  const scriptApproved = pkg.script.status === 'guion_aprobado'
  const hasMain = titles?.content.main != null
  // Between asking and the job starting nothing is chosen: the AI works with what there was (it would be refused).
  const [asking, setAsking] = useState(false)
  const idle = ai.working === null && !asking
  // Room for the three new ideas next to the chosen ones and those the creator edited (decision 31).
  const savedChosen = thumbnails?.content.chosen ?? []
  const conceptRoom =
    PUBLISH_LIMITS.concepts -
      (thumbnails?.content.concepts ?? []).filter(
        (concept) => savedChosen.includes(concept.id) || concept.origin === 'creador',
      ).length >=
    AI_THUMBNAILS
  const thumbnailPrice = usePackageEstimate(
    pkg,
    'miniaturas',
    scriptApproved && idle && !isShort && hasMain && conceptRoom,
  )
  const [instructions, setInstructions] = useState('')
  const [thumbnailInstructions, setThumbnailInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editingConcept, setEditingConcept] = useState<ThumbnailConcept | null>(null)
  const [mine, setMine] = useState('')
  const [pendingTitles, setPendingTitles] = useState<TitleChoice | null>(null)
  const [pendingChosen, setPendingChosen] = useState<string[] | null>(null)
  const latest = useRef(pkg)
  latest.current = pkg
  const savingNow = useRef(false)
  const choices = useRef<{ titles: TitleChoice | null; chosen: string[] | null }>({ titles: null, chosen: null })
  const timers = useRef<{ titles?: number; chosen?: number }>({})
  const flushes = useRef<{ titles?: () => void; chosen?: () => void }>({})
  const pending = pendingTitles !== null || pendingChosen !== null
  const busy = saving || !idle
  const approved = coverApproved(pkg)

  const saved = async (work: () => Promise<PackageView>) => {
    setSaving(true)
    savingNow.current = true
    try {
      const view = await work()
      // Read at once: a choice saved after leaving the step starts from this version, not from the old one.
      latest.current = view
      onChange(view)
      return true
    } catch (cause) {
      onError(cause)
      return false
    } finally {
      savingNow.current = false
      setSaving(false)
    }
  }

  // What is on screen: the choices not saved yet over what is saved.
  const main = pendingTitles ? pendingTitles.main : (titles?.content.main ?? null)
  const alternatives = pendingTitles ? pendingTitles.alternatives : (titles?.content.alternatives ?? [])
  const chosen = pendingChosen ?? thumbnails?.content.chosen ?? []

  const saveTitles = (content: TitlesContent) =>
    saved(() =>
      packagesApi.savePiece(pkg.id, 'titulos', {
        baseVersion: latest.current.pieces.titulos?.version ?? 0,
        content: { ...content, ...(choices.current.titles ?? {}) },
      }),
    )
  const saveThumbnails = (content: ThumbnailsContent) =>
    saved(() =>
      packagesApi.savePiece(pkg.id, 'miniaturas', {
        baseVersion: latest.current.pieces.miniaturas?.version ?? 0,
        content: { ...content, chosen: choices.current.chosen ?? content.chosen },
      }),
    )

  const later = (key: 'titles' | 'chosen', run: () => Promise<unknown>) => {
    window.clearTimeout(timers.current[key])
    const go = () => {
      // One save at a time: each one starts from the version the other left.
      if (savingNow.current) {
        timers.current[key] = window.setTimeout(go, CHOICE_DELAY_MS)
        return
      }
      flushes.current[key] = undefined
      void run()
    }
    flushes.current[key] = go
    timers.current[key] = window.setTimeout(go, CHOICE_DELAY_MS)
  }

  // Leaving the step before the moment is up still saves the choice.
  useEffect(
    () => () => {
      for (const key of ['titles', 'chosen'] as const) {
        window.clearTimeout(timers.current[key])
        flushes.current[key]?.()
      }
    },
    [],
  )

  const chooseTitles = (next: TitleChoice) => {
    choices.current.titles = next
    setPendingTitles(next)
    later('titles', async () => {
      const piece = latest.current.pieces.titulos
      if (!piece) return
      await saveTitles(piece.content)
      if (choices.current.titles === next) {
        choices.current.titles = null
        setPendingTitles(null)
      }
    })
  }

  const chooseConcepts = (next: string[]) => {
    choices.current.chosen = next
    setPendingChosen(next)
    later('chosen', async () => {
      const piece = latest.current.pieces.miniaturas
      if (!piece) return
      await saveThumbnails(piece.content)
      if (choices.current.chosen === next) {
        choices.current.chosen = null
        setPendingChosen(null)
      }
    })
  }

  const blockTitle = (blockId: string | null) => {
    const block = pkg.script.blocks.find((one) => one.id === blockId)
    return block ? block.title || scriptEs.outline.types[block.type] : null
  }

  const measured = pkg.measured
  const candidates = titles?.content.candidates ?? []
  const titleText = (id: string | null) => candidates.find((candidate) => candidate.id === id)?.text ?? ''
  // A title over the maximum is a warning, not a lock (FR-013): YouTube itself will say no.
  const ready = main !== null && !pending && (isShort ? pkg.pieces.portada_short !== null : chosen.length > 0)
  // Asking for more titles needs room for the fewest the AI gives next to the ones kept (decision 31).
  const kept = candidates.filter(
    (candidate) => candidate.id === main || alternatives.includes(candidate.id) || candidate.origin === 'creador',
  ).length
  const titleRoom = titles === null || PUBLISH_LIMITS.candidates - kept >= TITLE_COUNTS[pkg.format].min
  const titlePrice = usePackageEstimate(pkg, 'titulos', scriptApproved && idle && titleRoom && !pending)

  const ask: PackageAi['run'] = async (...args) => {
    setAsking(true)
    try {
      await ai.run(...args)
    } finally {
      setAsking(false)
    }
  }

  const approve = () =>
    saved(() =>
      packagesApi.approve(pkg.id, {
        step: 'portada',
        versions: {
          titulos: titles!.version,
          ...(isShort ? { portada_short: pkg.pieces.portada_short!.version } : { miniaturas: thumbnails!.version }),
        },
      }),
    )

  const chooseMain = (next: string) =>
    chooseTitles({ main: next, alternatives: alternatives.filter((one) => one !== next) })

  const toggleAlternative = (id: string, checked: boolean) =>
    chooseTitles({ main, alternatives: checked ? [...alternatives, id] : alternatives.filter((one) => one !== id) })

  const saveEdit = async (id: string) => {
    const done = await saveTitles({
      ...titles!.content,
      candidates: candidates.map((candidate) =>
        candidate.id === id ? { ...candidate, text: editText.trim() } : candidate,
      ),
    })
    if (done) setEditing(null)
  }

  const addMine = async () => {
    const candidate = { id: crypto.randomUUID(), text: mine.trim(), why: '', blockId: null, origin: 'creador' as const }
    const content = titles?.content ?? { candidates: [], main: null, alternatives: [] }
    if (await saveTitles({ ...content, candidates: [...content.candidates, candidate] })) setMine('')
  }

  const toggleConcept = (id: string, checked: boolean) =>
    chooseConcepts(checked ? [...chosen, id] : chosen.filter((one) => one !== id))

  const saveConcept = async () => {
    if (!editingConcept) return
    const done = await saveThumbnails({
      ...thumbnails!.content,
      concepts: thumbnails!.content.concepts.map((concept) =>
        concept.id === editingConcept.id ? editingConcept : concept,
      ),
    })
    if (done) setEditingConcept(null)
  }

  const conceptLabel: Record<ConceptField, string> = {
    scene: text.scene,
    bigText: text.bigText,
    emotion: text.emotion,
    composition: text.composition,
    colors: text.colors,
  }
  const conceptMax: Record<ConceptField, number> = {
    scene: PUBLISH_LIMITS.scene,
    bigText: PUBLISH_LIMITS.bigText,
    emotion: PUBLISH_LIMITS.emotion,
    composition: PUBLISH_LIMITS.composition,
    colors: PUBLISH_LIMITS.colors,
  }

  return (
    <section aria-labelledby="cover-title">
      <h2 id="cover-title">{isShort ? publishEs.screen.steps.portadaShort : publishEs.screen.steps.portada}</h2>
      <p className={styles.why}>{publishEs.screen.why.portada}</p>
      {pkg.idea.hook && <p>{format(publishEs.screen.hook, { gancho: pkg.idea.hook })}</p>}

      {measured ? (
        <p>
          {measured.query ? format(text.measured, { busqueda: measured.query }) : null}{' '}
          <DataSource kind="youtube" date={measured.measuredAt} />
          {measured.olderRevision && <span> {text.measuredOlder}</span>}
          {measured.partial && <span> {text.measuredPartial}</span>}
        </p>
      ) : (
        <p className={styles.notice}>{text.measuredNone}</p>
      )}

      {titlePrice.error !== null && (
        <ErrorMessage
          live
          title={errorText(titlePrice.error)}
          action={{ label: es.app.retry, onClick: titlePrice.retry }}
        />
      )}

      {titles === null ? (
        <AiAction
          label={text.ask}
          estimate={titlePrice.estimate}
          failure={ai.failureFor('titulos')}
          busy={ai.working === 'titulos'}
          disabled={busy || !scriptApproved}
          onRun={() => void ask('titulos', titlePrice)}
        />
      ) : (
        <>
          <h3>{text.titles}</h3>
          <RadioGroup
            label={text.main}
            description={text.mainHint}
            value={main ?? ''}
            onValueChange={chooseMain}
            disabled={!idle}
            options={candidates.map((candidate) => {
              const length = candidate.text.length
              const block = blockTitle(candidate.blockId)
              return {
                value: candidate.id,
                label: candidate.text,
                description: candidate.why || undefined,
                extra: (
                  <>
                    <span>{format(text.chars, { n: length })}</span>
                    {length > pkg.limits.titleMaxChars ? (
                      <span> {format(text.tooLong, { n: pkg.limits.titleMaxChars })}</span>
                    ) : (
                      length > pkg.limits.mobileTitleChars && (
                        <span> {format(text.cutOnMobile, { n: pkg.limits.mobileTitleChars })}</span>
                      )
                    )}
                    {block && (
                      <span>
                        {text.separator}
                        {format(text.fromBlock, { bloque: block })}
                      </span>
                    )}{' '}
                    {candidate.origin === 'ia' ? <DataSource kind="ia" /> : <span>{text.yours}</span>}
                  </>
                ),
              }
            })}
          />
          <DataSource kind="conocimiento" label={pkg.limits.youtube.label} date={pkg.limits.youtube.date} />

          <fieldset className={styles.option}>
            <legend>{text.alsoTry}</legend>
            <p>{format(text.alsoTryHint, { n: PUBLISH_LIMITS.alternatives + 1 })}</p>
            {alternatives.length >= PUBLISH_LIMITS.alternatives && (
              <p role="status">{format(text.alsoTryFull, { n: PUBLISH_LIMITS.alternatives })}</p>
            )}
            {candidates
              .filter((candidate) => candidate.id !== main)
              .map((candidate) => (
                <Checkbox
                  key={candidate.id}
                  label={candidate.text}
                  checked={alternatives.includes(candidate.id)}
                  disabled={
                    !idle ||
                    (!alternatives.includes(candidate.id) && alternatives.length >= PUBLISH_LIMITS.alternatives)
                  }
                  onCheckedChange={(checked) => toggleAlternative(candidate.id, checked)}
                />
              ))}
          </fieldset>

          <ul className={styles.options}>
            {candidates.map((candidate) =>
              editing === candidate.id ? (
                <li key={candidate.id} className={styles.option}>
                  <TextField
                    label={text.titleField}
                    value={editText}
                    maxLength={PUBLISH_LIMITS.titleText}
                    description={format(text.chars, { n: editText.length })}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      loading={saving}
                      disabled={editText.trim() === ''}
                      onClick={() => void saveEdit(candidate.id)}
                    >
                      {text.save}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {text.cancel}
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={candidate.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={format(text.editNamed, { titulo: candidate.text })}
                    onClick={() => {
                      setEditing(candidate.id)
                      setEditText(candidate.text)
                    }}
                  >
                    {text.edit}
                  </Button>{' '}
                  {candidate.text}
                </li>
              ),
            )}
          </ul>

          {candidates.length < PUBLISH_LIMITS.candidates && (
            <div className={styles.option}>
              <TextField
                label={text.writeMine}
                value={mine}
                maxLength={PUBLISH_LIMITS.titleText}
                onChange={(event) => setMine(event.target.value)}
              />
              <div className={styles.actions}>
                <Button variant="secondary" disabled={busy || mine.trim() === ''} onClick={() => void addMine()}>
                  {text.add}
                </Button>
              </div>
            </div>
          )}

          <TextArea
            label={text.instructions}
            description={text.instructionsHint}
            value={instructions}
            maxLength={PUBLISH_LIMITS.instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          {titleRoom ? (
            <AiAction
              label={text.askAgain}
              estimate={titlePrice.estimate}
              failure={ai.failureFor('titulos')}
              busy={ai.working === 'titulos'}
              primary={false}
              disabled={busy || pending || !scriptApproved}
              onRun={() => void ask('titulos', titlePrice, instructions)}
            />
          ) : (
            <p className={styles.notice}>{text.full}</p>
          )}
        </>
      )}

      {isShort
        ? titles !== null && <p className={styles.notice}>{text.shortCover}</p>
        : titles !== null && (
            <>
              <h3>{text.thumbnails}</h3>
              <p className={styles.why}>{format(text.thumbnailsWhy, { n: PUBLISH_LIMITS.chosen })}</p>
              {!hasMain ? (
                <p className={styles.notice}>{text.needsMain}</p>
              ) : (
                <>
                  {thumbnailPrice.error !== null && (
                    <ErrorMessage
                      live
                      title={errorText(thumbnailPrice.error)}
                      action={{ label: es.app.retry, onClick: thumbnailPrice.retry }}
                    />
                  )}
                  {thumbnails !== null && (
                    <>
                      {chosen.length >= PUBLISH_LIMITS.chosen && (
                        <p role="status">{format(text.chosenFull, { n: PUBLISH_LIMITS.chosen })}</p>
                      )}
                      <ul className={styles.options}>
                        {thumbnails.content.concepts.map((concept, index) => {
                          const n = index + 1
                          const isEditing = editingConcept?.id === concept.id
                          return (
                            <Card as="li" key={concept.id} className={styles.option}>
                              <h4>{format(text.concept, { n })}</h4>
                              {isEditing ? (
                                <>
                                  {CONCEPT_FIELDS.map((field) => (
                                    <TextField
                                      key={field}
                                      label={conceptLabel[field]}
                                      value={editingConcept[field]}
                                      maxLength={conceptMax[field]}
                                      onChange={(event) =>
                                        setEditingConcept({ ...editingConcept, [field]: event.target.value })
                                      }
                                    />
                                  ))}
                                  <div className={styles.actions}>
                                    <Button
                                      variant="secondary"
                                      loading={saving}
                                      disabled={editingConcept.scene.trim() === ''}
                                      onClick={() => void saveConcept()}
                                    >
                                      {text.save}
                                    </Button>
                                    <Button variant="ghost" onClick={() => setEditingConcept(null)}>
                                      {text.cancel}
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <dl>
                                    {CONCEPT_FIELDS.map((field) => (
                                      <div key={field}>
                                        <dt>{conceptLabel[field]}</dt>
                                        <dd>
                                          {concept[field] || (field === 'bigText' ? text.bigTextNone : text.fieldEmpty)}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                  {concept.titleId && (
                                    <p>{format(text.forTitle, { titulo: titleText(concept.titleId) })}</p>
                                  )}
                                  {concept.origin === 'ia' ? <DataSource kind="ia" /> : <p>{text.yours}</p>}
                                  <Checkbox
                                    label={text.choose}
                                    aria-label={format(text.chooseNamed, { n })}
                                    checked={chosen.includes(concept.id)}
                                    disabled={
                                      !idle || (!chosen.includes(concept.id) && chosen.length >= PUBLISH_LIMITS.chosen)
                                    }
                                    onCheckedChange={(checked) => toggleConcept(concept.id, checked)}
                                  />
                                  <div className={styles.actions}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      aria-label={format(text.editConcept, { n })}
                                      onClick={() => setEditingConcept(concept)}
                                    >
                                      {text.edit}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </Card>
                          )
                        })}
                      </ul>
                      <TextArea
                        label={text.instructions}
                        description={text.instructionsHint}
                        value={thumbnailInstructions}
                        maxLength={PUBLISH_LIMITS.instructions}
                        onChange={(event) => setThumbnailInstructions(event.target.value)}
                      />
                    </>
                  )}
                  {conceptRoom ? (
                    <AiAction
                      label={thumbnails === null ? text.askThumbnails : text.askThumbnailsAgain}
                      estimate={thumbnailPrice.estimate}
                      failure={ai.failureFor('miniaturas')}
                      busy={ai.working === 'miniaturas'}
                      primary={thumbnails === null}
                      disabled={busy || pending || !scriptApproved}
                      onRun={() =>
                        void ask('miniaturas', thumbnailPrice, thumbnails === null ? undefined : thumbnailInstructions)
                      }
                    />
                  ) : (
                    <p className={styles.notice}>{text.full}</p>
                  )}
                </>
              )}
            </>
          )}

      {approved ? (
        <>
          <p role="status">{isShort ? text.approvedShort : text.approved}</p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={onNext}>
              {publishEs.screen.toTexts}
            </Button>
          </div>
        </>
      ) : (
        (thumbnails !== null || (isShort && titles !== null)) && (
          <>
            {!ready && !pending && <p className={styles.notice}>{isShort ? text.notReadyShort : text.notReady}</p>}
            <div className={styles.actions}>
              <Button
                variant="primary"
                loading={saving}
                disabled={busy || !ready || !scriptApproved}
                onClick={() => void approve()}
              >
                {isShort ? text.approveShort : text.approve}
              </Button>
            </div>
          </>
        )
      )}
    </section>
  )
}
