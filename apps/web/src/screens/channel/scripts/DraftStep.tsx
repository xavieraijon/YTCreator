import { durationSeconds, SCRIPT_LIMITS, splitMarks, type Claim, type DraftBlock } from '@ytcreator/core'
import type { ScriptView } from '@ytcreator/core/api'
import { Button, Card, DataSource, Dialog, Disclosure, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { type MutableRefObject, useEffect, useRef, useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { channelEs } from '../../../strings/channel.es.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { clock } from './OutlineStep.tsx'
import { SourceLine } from './FactsList.tsx'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.draft

export interface DraftStepProps {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
  readonly onToOutline: () => void
  readonly onToReview: () => void
  /** The block a notice of the review points at: it takes the focus. */
  readonly targetBlock: string | null
  readonly onTargetReached: () => void
  /** A block is open: leaving the step would lose what is being written. */
  readonly onEditing: (editing: boolean) => void
}

function BlockEditor({
  block,
  busy,
  wordsPerMinute,
  onSave,
  onCancel,
  current,
}: {
  readonly block: DraftBlock
  readonly busy: boolean
  readonly wordsPerMinute: number
  readonly onSave: (block: DraftBlock) => void
  readonly onCancel: () => void
  readonly current: MutableRefObject<DraftBlock | null>
}) {
  const [spoken, setSpoken] = useState(block.text)
  const [visual, setVisual] = useState(block.visual)
  useEffect(() => {
    current.current = { ...block, text: spoken, visual }
  })
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => form.current?.querySelector('textarea')?.focus(), [])
  return (
    <form
      ref={form}
      className={styles.options}
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ ...block, text: spoken, visual })
      }}
    >
      <TextArea
        label={text.spoken}
        description={format(text.duration, { tiempo: clock(durationSeconds(spoken, wordsPerMinute)) })}
        value={spoken}
        rows={8}
        autoResize
        maxLength={SCRIPT_LIMITS.blockText}
        onChange={(event) => setSpoken(event.target.value)}
      />
      <TextField
        label={text.visual}
        value={visual}
        maxLength={SCRIPT_LIMITS.visual}
        onChange={(event) => setVisual(event.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={busy}>
          {text.save}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {text.cancel}
        </Button>
      </div>
    </form>
  )
}

function BlockAgain({
  script,
  block,
  ai,
  disabled,
  guard,
  saveOpenEdit,
  onClose,
}: {
  readonly script: ScriptView
  readonly block: DraftBlock
  readonly ai: ScriptAi
  readonly disabled: boolean
  readonly guard: (action: () => void) => void
  readonly saveOpenEdit: () => Promise<boolean>
  readonly onClose: () => void
}) {
  // Priced only when asked for: one estimate per block would be as many requests as blocks on every change.
  const price = useEstimate(script, 'bloque_guion', true, block.id)
  const [instructions, setInstructions] = useState('')
  const field = useRef<HTMLDivElement>(null)
  useEffect(() => field.current?.querySelector('textarea')?.focus(), [])
  return (
    <div ref={field} className={styles.options}>
      <TextArea
        label={text.blockInstructions}
        description={text.instructionsHelp}
        optional
        value={instructions}
        maxLength={SCRIPT_LIMITS.instructions}
        disabled={disabled}
        onChange={(event) => setInstructions(event.target.value)}
      />
      {/* What is there now goes, hand-written words too: said before paying (novice audit, decision 51). */}
      <p className={styles.notice}>{text.blockReplaces}</p>
      {price.error !== null && (
        <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
      )}
      <AiAction
        label={text.blockAgain}
        primary={false}
        estimate={price.estimate}
        busy={ai.working === 'bloque_guion'}
        disabled={disabled}
        onRun={() =>
          guard(() => {
            // What is being written in another block is saved first (spec, «Edición sin guardar al pedir un bloque»).
            void saveOpenEdit().then((ok) => {
              if (ok) void ai.run('bloque_guion', price, instructions, block.id)
            })
          })
        }
      />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          {text.cancel}
        </Button>
      </div>
    </div>
  )
}

type ClaimAction = 'confirmar' | 'corregir' | 'no_es_dato' | 'quitar_del_guion' | 'aceptar_propuesta'

function ClaimDialog({
  claim,
  busy,
  onAct,
  onClose,
}: {
  readonly claim: Claim
  readonly busy: boolean
  readonly onAct: (action: ClaimAction, fixed?: string) => void
  readonly onClose: () => void
}) {
  const [correcting, setCorrecting] = useState(false)
  const [fixed, setFixed] = useState(claim.text)
  const usable = fixed.trim() !== '' && fixed.trim() !== claim.text
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={format(text.claimTitle, { texto: claim.text })}
      description={`${text.claimReason[claim.reason]} ${text.claimRemoveNote}`}
    >
      {claim.check && (
        <>
          <p>{format(text.verdictLabel, { texto: text.verdicts[claim.check.verdict] })}</p>
          <DataSource kind="ia" />
          {claim.check.sources.length > 0 && (
            <ul>
              {claim.check.sources.map((source) => (
                <SourceLine key={source.id} source={source} />
              ))}
            </ul>
          )}
          {claim.check.proposal && (
            <>
              <p>{format(text.proposalLabel, { texto: claim.check.proposal })}</p>
              <div className={styles.actions}>
                <Button variant="primary" loading={busy} onClick={() => onAct('aceptar_propuesta')}>
                  {text.useProposal}
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {correcting ? (
        <form
          className={styles.options}
          onSubmit={(event) => {
            event.preventDefault()
            if (usable) onAct('corregir', fixed.trim())
          }}
        >
          <TextField
            label={text.claimFix}
            value={fixed}
            maxLength={SCRIPT_LIMITS.claimText}
            onChange={(event) => setFixed(event.target.value)}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={busy} disabled={!usable}>
              {text.save}
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <Button
            variant={claim.check?.proposal ? 'secondary' : 'primary'}
            loading={busy}
            onClick={() => onAct('confirmar')}
          >
            {text.claimConfirm}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setCorrecting(true)}>
            {text.claimCorrect}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onAct('no_es_dato')}>
            {text.claimNotData}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onAct('quitar_del_guion')}>
            {text.claimRemove}
          </Button>
        </div>
      )}
    </Dialog>
  )
}

// What the counter adds: where the marks are, and, once searched, where the answer is (novice audit of 005).
function searchedSaid(pending: number, searched: number): string {
  if (searched === 0) return text.claimsHint
  if (searched === pending) return pending === 1 ? text.claimsSearched.one : text.claimsSearched.other
  return format(text.claimsSearched.some, { n: String(searched) })
}

// What the creator is going to say, block by block (contracts/ui-screens.md).
export function DraftStep({
  script,
  ai,
  onChange,
  onError,
  onToOutline,
  onToReview,
  targetBlock,
  onTargetReached,
  onEditing,
}: DraftStepProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openClaim, setOpenClaim] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [pending, setPending] = useState<(() => void) | null>(null)
  const counter = useRef<HTMLParagraphElement>(null)
  const openEdit = useRef<DraftBlock | null>(null)
  const focusCounter = useRef(false)
  const refocusBlock = useRef<string | null>(null)
  const refocus = useRef<string | null>(null)
  const rewriteUse = script.format === 'short' ? 'guion_short' : 'guion'
  const canRewrite =
    script.format === 'short' || (script.outline !== null && script.outlineApprovedVersion === script.outline.version)
  const price = useEstimate(script, rewriteUse, canRewrite)
  // Only what has not been searched yet: searching again the same marks would spend for the same answer (novice audit).
  const unchecked =
    script.draft?.content.claims.filter((claim) => claim.status === 'pendiente' && claim.check === null).length ?? 0
  const checkPrice = useEstimate(script, 'comprobar_guion', script.webResearch && unchecked > 0)
  const draft = script.draft

  useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLElement>(`[data-block-action="${refocus.current}"]`)?.focus()
    refocus.current = null
  }, [draft?.version, editing, asking])

  const isEditing = editing !== null
  useEffect(() => {
    onEditing(isEditing)
    return () => onEditing(false)
  }, [isEditing, onEditing])

  useEffect(() => {
    if (!targetBlock) return
    document.querySelector<HTMLElement>(`[data-block-heading="${CSS.escape(targetBlock)}"]`)?.focus()
    onTargetReached()
  }, [targetBlock, onTargetReached])

  // After the dialog has gone: until then the page is inert, and it hands the focus back to a mark that no longer exists.
  useEffect(() => {
    if (openClaim !== null) return
    if (refocusBlock.current) {
      const heading = document.querySelector<HTMLElement>(`[data-block-heading="${CSS.escape(refocusBlock.current)}"]`)
      refocusBlock.current = null
      heading?.scrollIntoView({ block: 'start' })
      heading?.focus()
      return
    }
    if (!focusCounter.current) return
    focusCounter.current = false
    counter.current?.focus()
  }, [openClaim])

  if (!draft) return <p className={styles.notice}>{text.none}</p>

  const { blocks, claims } = draft.content
  const { wordsPerMinute } = script.voice
  const pendingClaims = claims.filter((claim) => claim.status === 'pendiente')
  const searched = pendingClaims.filter((claim) => claim.check !== null).length
  // The marks are found by their colour alone, so the button takes the creator to the first one (novice audit).
  const toFirstClaim = () => {
    const first = document.querySelector<HTMLElement>('[data-claim]')
    first?.scrollIntoView({ block: 'center' })
    first?.focus()
  }
  const claim = claims.find((one) => one.id === openClaim) ?? null
  const total = durationSeconds(blocks.map((block) => block.text).join(' '), wordsPerMinute)
  const busy = saving || ai.working !== null
  const locked = busy || editing !== null
  const again = ai.failureFor(rewriteUse)
  const blockFailure = ai.failureFor('bloque_guion')
  const isApproved = script.status === 'guion_aprobado'

  // An approved script stops being approved when it changes: it says so once, before the first change (FR-017).
  const guard = (action: () => void) => {
    if (isApproved) setPending(() => action)
    else action()
  }

  const save = async (block: DraftBlock) => {
    setSaving(true)
    try {
      const changed = await scriptsApi.saveDraft(script.id, {
        baseVersion: draft.version,
        content: { claims, blocks: blocks.map((one) => (one.id === block.id ? block : one)) },
      })
      refocus.current = `${block.id}:change`
      setEditing(null)
      onChange(changed)
      return true
    } catch (cause) {
      onError(cause)
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveOpenEdit = async () => (editing !== null && openEdit.current ? save(openEdit.current) : true)

  const act = async (action: ClaimAction, fixed?: string) => {
    if (!claim) return
    setSaving(true)
    try {
      const changed = await scriptsApi.actOnClaim(script.id, claim.id, {
        baseVersion: draft.version,
        action,
        ...(fixed ? { text: fixed } : {}),
      })
      // The mark that opened it is gone: the count that just went down is the next thing to read. Taking a fragment out
      // may leave the sentence broken, so then the block is what comes next, in sight (novice audit, decision 50).
      if (action === 'quitar_del_guion') refocusBlock.current = claim.blockId
      else focusCounter.current = true
      setOpenClaim(null)
      onChange(changed)
    } catch (cause) {
      setOpenClaim(null)
      onError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className={styles.why}>{text.why}</p>
      <p className={styles.notice}>
        {format(script.voice.isDefault ? text.voiceDefault : text.voiceCurrent, {
          trato: text.address[script.voice.address],
          registro: text.register[script.voice.register],
        })}{' '}
        <Button
          variant="ghost"
          size="sm"
          aria-disabled={locked || undefined}
          onClick={() => !locked && navigate({ page: 'scriptVoice' })}
        >
          {text.changeVoice}
        </Button>
      </p>
      <DataSource kind="ia" />
      <p ref={counter} tabIndex={-1} role="status">
        {pendingClaims.length === 0
          ? text.noClaims
          : `${format(pendingClaims.length === 1 ? text.claimsCount.one : text.claimsCount.other, {
              n: pendingClaims.length,
            })}. ${searchedSaid(pendingClaims.length, searched)}`}
      </p>
      {pendingClaims.length > 0 && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={toFirstClaim}>
          {text.toFirstClaim}
        </Button>
      )}
      {script.webResearch && unchecked > 0 && (
        <>
          <p className={styles.why}>{text.checkIntro}</p>
          {checkPrice.error !== null && (
            <ErrorMessage
              live
              title={errorText(checkPrice.error)}
              action={{ label: es.app.retry, onClick: checkPrice.retry }}
            />
          )}
          <AiAction
            label={text.check}
            primary={false}
            estimate={checkPrice.estimate}
            failure={ai.failureFor('comprobar_guion')}
            busy={ai.working === 'comprobar_guion'}
            disabled={locked}
            onRun={() =>
              guard(() => {
                void saveOpenEdit().then((ok) => {
                  if (ok) void ai.run('comprobar_guion', checkPrice)
                })
              })
            }
          />
          {checkPrice.estimate && !checkPrice.estimate.included && (
            <p className={styles.notice}>{format(text.checkCost, { n: String(checkPrice.estimate.searches ?? 0) })}</p>
          )}
        </>
      )}
      {blockFailure && (
        <ErrorMessage
          live
          title={channelEs.aiFailure[blockFailure]}
          action={
            blockFailure === 'limite_de_gasto'
              ? { label: text.toLimits, onClick: () => navigate({ page: 'aiSettings' }) }
              : { label: text.understood, onClick: ai.dismiss }
          }
        />
      )}
      <ol className={styles.options}>
        {blocks.map((block) => (
          <Card as="li" key={block.id}>
            <h2 tabIndex={-1} data-block-heading={block.id}>
              {block.title || scriptEs.outline.types[block.type]}
            </h2>
            {editing === block.id ? (
              <BlockEditor
                block={block}
                busy={saving}
                wordsPerMinute={wordsPerMinute}
                current={openEdit}
                onSave={(changed) => void save(changed)}
                onCancel={() => {
                  refocus.current = `${block.id}:change`
                  setEditing(null)
                }}
              />
            ) : (
              <>
                <p>
                  {splitMarks(
                    block.text,
                    claims.filter((one) => one.blockId === block.id),
                  ).map((part, index) =>
                    part.claimId ? (
                      <button
                        key={index}
                        type="button"
                        className={styles.claim}
                        data-claim
                        aria-label={format(text.claimName, { texto: part.text })}
                        aria-disabled={busy || undefined}
                        onClick={() => !busy && part.claimId && guard(() => setOpenClaim(part.claimId ?? null))}
                      >
                        <mark>{part.text}</mark>
                      </button>
                    ) : (
                      part.text
                    ),
                  )}
                </p>
                {block.visual !== '' && <p className={styles.notice}>{format(text.seen, { texto: block.visual })}</p>}
                <p className={styles.notice}>
                  {format(text.duration, { tiempo: clock(durationSeconds(block.text, wordsPerMinute)) })}
                </p>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-block-action={`${block.id}:change`}
                    aria-label={format(text.named, {
                      accion: text.change,
                      titulo: block.title || scriptEs.outline.types[block.type],
                    })}
                    aria-disabled={locked || undefined}
                    onClick={() => !locked && guard(() => setEditing(block.id))}
                  >
                    {text.change}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-block-action={`${block.id}:again`}
                    aria-label={format(text.named, {
                      accion: text.blockAgain,
                      titulo: block.title || scriptEs.outline.types[block.type],
                    })}
                    aria-disabled={busy || undefined}
                    aria-expanded={asking === block.id}
                    onClick={() => !busy && setAsking(asking === block.id ? null : block.id)}
                  >
                    {text.blockAgain}
                  </Button>
                </div>
                {asking === block.id && (
                  <BlockAgain
                    script={script}
                    block={block}
                    ai={ai}
                    disabled={busy}
                    guard={guard}
                    saveOpenEdit={saveOpenEdit}
                    onClose={() => {
                      refocus.current = `${block.id}:again`
                      setAsking(null)
                    }}
                  />
                )}
              </>
            )}
          </Card>
        ))}
      </ol>
      <p>{format(text.total, { total: clock(total), objetivo: clock(script.targetSeconds) })}</p>
      {editing !== null && <p className={styles.notice}>{scriptEs.outline.finishEditing}</p>}
      <div className={styles.actions}>
        <Button variant="primary" disabled={locked} onClick={onToReview}>
          {text.review}
        </Button>
      </div>
      {price.error !== null && (
        <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
      )}
      <Disclosure key={again ? 'failed' : 'idle'} summary={text.againSection} defaultOpen={again !== null}>
        {canRewrite ? (
          <>
            <p className={styles.notice}>{scriptEs.warnings.redoBody}</p>
            <TextArea
              label={text.instructions}
              description={text.instructionsHelp}
              optional
              value={instructions}
              maxLength={SCRIPT_LIMITS.instructions}
              disabled={locked}
              onChange={(event) => setInstructions(event.target.value)}
            />
            <AiAction
              label={text.again}
              primary={false}
              estimate={price.estimate}
              failure={again}
              busy={ai.working === rewriteUse}
              disabled={locked}
              onRun={() => guard(() => void ai.run(rewriteUse, price, instructions))}
            />
          </>
        ) : (
          <>
            <p className={styles.notice}>{text.approveOutlineFirst}</p>
            <Button variant="secondary" onClick={onToOutline}>
              {text.toOutline}
            </Button>
          </>
        )}
      </Disclosure>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={text.unapproveTitle}
        description={text.unapproveBody}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {text.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                pending?.()
                setPending(null)
              }}
            >
              {text.unapproveConfirm}
            </Button>
          </>
        }
      />
      {claim && !pending && (
        <ClaimDialog
          claim={claim}
          busy={saving}
          onAct={(action, fixed) => void act(action, fixed)}
          onClose={() => setOpenClaim(null)}
        />
      )}
    </>
  )
}
