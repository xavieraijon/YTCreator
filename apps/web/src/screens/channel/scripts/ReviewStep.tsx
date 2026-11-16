import { type DraftBlock, type ReviewNotice, reviewScript, splitMarks } from '@ytcreator/core'
import type { ScriptReviewView, ScriptView } from '@ytcreator/core/api'
import { SCRIPT_LIMITS } from '@ytcreator/core'
import { Button, Card, DataSource, Dialog, Disclosure, ErrorMessage, format, TextArea } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { ApiClientError, packagesApi, scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { subtitlesEs } from '../../../strings/subtitles.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { clock } from './OutlineStep.tsx'
import { saveFile } from './saveFile.ts'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.review

type ReviewRulesView = ScriptReviewView['rules']

export interface ReviewStepProps {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
  readonly onToBlock: (blockId: string) => void
  readonly onToDraft: () => void
  /** The AI is working on this script: nothing can be approved meanwhile. */
  readonly busy: boolean
}

export function noticeText(notice: ReviewNotice): string {
  switch (notice.rule) {
    case 'duracion':
      return format(text.notices.duracion, { dura: clock(notice.seconds), objetivo: clock(notice.target) })
    case 'gancho_largo':
      return format(text.notices.gancho_largo, { dura: clock(notice.seconds), limite: clock(notice.limit) })
    case 'short_largo':
      return format(text.notices.short_largo, {
        dura: clock(notice.seconds),
        limite: clock(notice.limit),
        sobra: clock(notice.excess),
      })
    case 'muletilla':
      return format(text.notices.muletilla, { texto: notice.text })
    case 'frase_larga':
      return format(text.notices.frase_larga, { palabras: notice.words, texto: notice.text })
    case 'por_comprobar':
      return format(notice.count === 1 ? text.notices.por_comprobar.one : text.notices.por_comprobar.other, {
        n: notice.count,
      })
  }
}

const nameOf = (block: DraftBlock | undefined) =>
  block?.title || (block ? scriptEs.outline.types[block.type] : scriptEs.outline.untitled)

// The duration is of the whole script: its block is only where to start.
function whereText(notice: ReviewNotice, titulo: string): string {
  if (notice.rule === 'short_largo') return format(text.startLongest, { titulo })
  if (notice.rule !== 'duracion') return format(text.inBlock, { titulo })
  return format(notice.seconds > notice.target ? text.startLongest : text.startShortest, { titulo })
}

// What can be fixed for free before recording. Nothing here stops the approval (FR-016).
export function ReviewStep({ script, ai, onChange, onError, onToBlock, onToDraft, busy }: ReviewStepProps) {
  const [rules, setRules] = useState<ReviewRulesView | null>(null)
  // An audio chosen but not listened to yet is not subtitles (contracts/ui-screens.md, «con subtítulos»).
  const hasSubtitles = script.subtitles !== null && script.subtitles.status !== 'sin_hacer'
  const [failed, setFailed] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [changedElsewhere, setChangedElsewhere] = useState(false)
  const [justApproved, setJustApproved] = useState(false)
  const approvedNote = useRef<HTMLParagraphElement>(null)
  const [choosing, setChoosing] = useState<number | null>(null)
  const [anglesAsk, setAnglesAsk] = useState('')
  const { id } = script
  const canAskAngles = script.format === 'largo' && script.status === 'guion_aprobado'
  const anglesPrice = useEstimate(script, 'enfoques_short', canAskAngles)
  // What was asked for is not sent again once new angles arrive.
  const lastAngle = script.shortAngles.at(-1)?.index ?? null
  useEffect(() => setAnglesAsk(''), [lastAngle])

  useEffect(() => {
    const controller = new AbortController()
    scriptsApi
      .review(id, { signal: controller.signal })
      .then((got) => {
        setRules(got.rules)
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailed(cause)
      })
    return () => controller.abort()
  }, [id, attempt])

  // The button that had the focus has gone: it moves to what took its place.
  useEffect(() => {
    if (justApproved) approvedNote.current?.focus()
  }, [justApproved])

  const openPackage = async () => {
    setOpening(true)
    try {
      const pkg = script.package ?? (await packagesApi.open(script.id))
      navigate({ page: 'package', id: pkg.id })
    } catch (cause) {
      onError(cause)
    } finally {
      setOpening(false)
    }
  }

  const draft = script.draft
  if (!draft) return <p className={styles.notice}>{scriptEs.draft.none}</p>

  const { blocks, claims } = draft.content
  const pending = claims.filter((claim) => claim.status === 'pendiente').length
  const approved = script.status === 'guion_aprobado'
  const hasEmpty = blocks.some((block) => block.text.trim() === '')
  const notices = rules
    ? reviewScript({
        format: script.format,
        targetSeconds: script.targetSeconds,
        wordsPerMinute: script.voice.wordsPerMinute,
        blocks,
        claims,
        rules,
        shortMaxSeconds: script.limits.maxSeconds,
      })
    : []
  const titleOf = (blockId: string) => nameOf(blocks.find((block) => block.id === blockId))

  const approve = async () => {
    setSaving(true)
    setAsking(false)
    setJustApproved(false)
    try {
      onChange(await scriptsApi.approveDraft(id, { version: draft.version, acknowledgedPending: pending }))
      setChangedElsewhere(false)
      setJustApproved(true)
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.body?.code === 'conflicto') {
        setChangedElsewhere(true)
        try {
          onChange(await scriptsApi.get(id))
        } catch (reload) {
          onError(reload)
        }
      } else onError(cause)
    } finally {
      setSaving(false)
    }
  }

  // Costs nothing: the Short opens unwritten, with its price on the button (FR-019).
  const chooseAngle = async (index: number) => {
    setChoosing(index)
    try {
      const { scriptId } = await scriptsApi.chooseShortAngle(id, index, { baseUpdatedAt: script.updatedAt })
      navigate({ page: 'script', id: scriptId })
    } catch (cause) {
      onError(cause)
      setChoosing(null)
    }
  }

  const download = async (kind: 'md' | 'json') => {
    try {
      const { blob, name } = await scriptsApi.download(id, kind)
      saveFile(blob, name)
    } catch (cause) {
      onError(cause)
    }
  }

  return (
    <>
      <p className={styles.why}>{text.why}</p>
      {/* What is approved can be read here, whole, without going back a step (novice audit, decision 50). */}
      <Disclosure summary={text.readAll}>
        {/* The figures still to check stay marked here too: what the AI wrote is not passed off as fact (principle II). */}
        <DataSource kind="ia" />
        {claims.some((claim) => claim.status === 'pendiente') && <p className={styles.notice}>{text.readAllMarks}</p>}
        {blocks.map((block) => (
          <section key={block.id} aria-label={nameOf(block)}>
            <h2>{nameOf(block)}</h2>
            <p>
              {splitMarks(
                block.text,
                claims.filter((claim) => claim.blockId === block.id),
              ).map((part, index) =>
                part.claimId ? (
                  <span key={index} className={styles.claim}>
                    <mark>{part.text}</mark>
                  </span>
                ) : (
                  part.text
                ),
              )}
            </p>
          </section>
        ))}
      </Disclosure>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{ label: es.app.retry, onClick: () => setAttempt((n) => n + 1) }}
        />
      )}
      {rules === null && failed === null && <p role="status">{es.app.loading}</p>}
      {rules !== null &&
        (notices.length === 0 ? (
          <p>{text.nothing}</p>
        ) : (
          <ul className={styles.options}>
            {notices.map((notice, index) => (
              <Card as="li" key={`${notice.rule}-${notice.blockId}-${index}`}>
                <p>{noticeText(notice)}</p>
                <p className={styles.notice}>{whereText(notice, titleOf(notice.blockId))}</p>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={format(text.toBlockNamed, { titulo: titleOf(notice.blockId) })}
                    onClick={() => onToBlock(notice.blockId)}
                  >
                    {text.toBlock}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        ))}
      {rules !== null && <DataSource kind="conocimiento" label={rules.basis.label} date={rules.basis.date} />}
      {notices.some((notice) => notice.rule === 'short_largo') && script.limits.maxReviewedAt && (
        <DataSource kind="conocimiento" label={text.shortsBasis} date={script.limits.maxReviewedAt} />
      )}
      {approved ? (
        <>
          <p role="status" tabIndex={-1} ref={approvedNote}>
            {script.draftApprovedPending
              ? format(script.draftApprovedPending === 1 ? text.approvedPending.one : text.approvedPending.other, {
                  n: script.draftApprovedPending,
                })
              : text.approved}
          </p>
          {/* The next step of the video: its publishing package (006, contracts/ui-screens.md). */}
          <p className={styles.why}>{publishEs.entry.why}</p>
          <div className={styles.actions}>
            <Button variant="primary" loading={opening} onClick={() => void openPackage()}>
              {script.package === null
                ? publishEs.entry.prepare
                : script.package.status === 'aprobado'
                  ? publishEs.entry.see
                  : publishEs.entry.continue}
            </Button>
            {/* Its subtitles (007, contracts/ui-screens.md): a secondary action next to the package. */}
            <Button variant="secondary" onClick={() => navigate({ page: 'subtitles', scriptId: script.id })}>
              {hasSubtitles ? subtitlesEs.entry.see : subtitlesEs.entry.make}
            </Button>
          </div>
          {hasSubtitles && script.subtitles && (
            <p className={styles.notice}>
              {format(subtitlesEs.entry.state, { estado: subtitlesEs.entry.states[script.subtitles.status] })}
            </p>
          )}
        </>
      ) : (
        <>
          {changedElsewhere && (
            <p role="status" className={styles.notice}>
              {text.changedElsewhere}
            </p>
          )}
          {hasEmpty && <p className={styles.notice}>{text.emptyBlock}</p>}
          <div className={styles.actions}>
            <Button
              variant="primary"
              loading={saving}
              disabled={hasEmpty || busy}
              onClick={() => (pending > 0 ? setAsking(true) : void approve())}
            >
              {text.approve}
            </Button>
          </div>
        </>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => void download('md')}>
          {text.downloadDocument}
        </Button>
        <Button variant="secondary" onClick={() => void download('json')}>
          {text.downloadData}
        </Button>
      </div>
      {script.format === 'largo' &&
        (canAskAngles ? (
          <>
            <p className={styles.why}>{text.makeShortIntro}</p>
            {anglesPrice.error !== null && (
              <ErrorMessage
                live
                title={errorText(anglesPrice.error)}
                action={{ label: es.app.retry, onClick: anglesPrice.retry }}
              />
            )}
            {script.shortAngles.length > 0 && (
              <>
                <h2>{text.anglesTitle}</h2>
                <DataSource kind="ia" />
                {script.shortAngles.some((angle) => angle.trimmed) && (
                  <p className={styles.notice}>{text.anglesTrimmed}</p>
                )}
                <ul className={styles.options}>
                  {script.shortAngles.map((angle) => (
                    <Card as="li" key={angle.index}>
                      <h3>{angle.title}</h3>
                      <p>{format(text.angleHook, { texto: angle.hook })}</p>
                      <p>{format(text.angleMoment, { titulo: titleOf(angle.blockId) })}</p>
                      <p className={styles.notice}>{format(text.angleWhy, { texto: angle.why })}</p>
                      {angle.scriptId !== null ? (
                        <p className={styles.notice}>
                          {text.angleUsed}{' '}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={format(text.openShortNamed, { titulo: angle.title })}
                            onClick={() => navigate({ page: 'script', id: angle.scriptId! })}
                          >
                            {text.openShort}
                          </Button>
                        </p>
                      ) : (
                        <div className={styles.actions}>
                          <Button
                            variant="secondary"
                            loading={choosing === angle.index}
                            disabled={busy || (choosing !== null && choosing !== angle.index)}
                            aria-label={format(text.chooseAngleNamed, { titulo: angle.title })}
                            onClick={() => void chooseAngle(angle.index)}
                          >
                            {text.chooseAngle}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </ul>
              </>
            )}
            {script.shortAngles.length > 0 && (
              <TextArea
                label={text.anglesInstructions}
                description={text.anglesInstructionsHelp}
                optional
                value={anglesAsk}
                maxLength={SCRIPT_LIMITS.instructions}
                disabled={busy}
                onChange={(event) => setAnglesAsk(event.target.value)}
              />
            )}
            <AiAction
              label={script.shortAngles.length > 0 ? text.anglesAgain : text.makeShort}
              primary={false}
              estimate={anglesPrice.estimate}
              failure={ai.failureFor('enfoques_short')}
              busy={ai.working === 'enfoques_short'}
              disabled={busy}
              onRun={() => void ai.run('enfoques_short', anglesPrice, anglesAsk)}
            />
          </>
        ) : (
          <p className={styles.notice}>{text.makeShortBlocked}</p>
        ))}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={format(pending === 1 ? text.pendingTitle.one : text.pendingTitle.other, { n: pending })}
        description={text.pendingBody}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAsking(false)
                onToDraft()
              }}
            >
              {text.pendingReview}
            </Button>
            <Button variant="primary" onClick={() => void approve()}>
              {text.pendingApprove}
            </Button>
          </>
        }
      />
    </>
  )
}
