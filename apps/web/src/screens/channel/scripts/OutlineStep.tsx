import type { OutlineBlock } from '@ytcreator/core'
import { SCRIPT_LIMITS } from '@ytcreator/core'
import type { ScriptView } from '@ytcreator/core/api'
import { Badge, Button, Card, DataSource, Disclosure, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.outline

export const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return format(text.clock.seconds, { s: rest })
  return format(rest === 0 ? text.clock.minutes : text.clock.both, { min: minutes, s: rest })
}

const titleOf = (block: OutlineBlock) => block.title.trim() || text.untitled
const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

function BlockEditor({
  block,
  busy,
  onSave,
  onCancel,
}: {
  block: OutlineBlock
  busy: boolean
  onSave: (block: OutlineBlock) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(block.title)
  const [purpose, setPurpose] = useState(block.purpose)
  const [question, setQuestion] = useState(block.question ?? '')
  const [reward, setReward] = useState(block.reward ?? '')
  const [bridge, setBridge] = useState(block.bridge ?? '')
  const [seconds, setSeconds] = useState(String(block.seconds))
  const validSeconds = Number.isInteger(Number(seconds)) && Number(seconds) > 0
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => form.current?.querySelector('input')?.focus(), [])
  return (
    <form
      ref={form}
      className={styles.options}
      onSubmit={(event) => {
        event.preventDefault()
        if (!validSeconds) return
        onSave({
          ...block,
          title: title.trim(),
          purpose: purpose.trim(),
          question: orNull(question),
          reward: orNull(reward),
          bridge: orNull(bridge),
          seconds: Number(seconds),
        })
      }}
    >
      <TextField
        label={text.fieldTitle}
        value={title}
        maxLength={SCRIPT_LIMITS.blockTitle}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextArea
        label={text.fieldPurpose}
        value={purpose}
        maxLength={SCRIPT_LIMITS.blockPurpose}
        onChange={(event) => setPurpose(event.target.value)}
      />
      <TextField
        label={text.fieldQuestion}
        optional
        value={question}
        maxLength={SCRIPT_LIMITS.blockHint}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <TextField
        label={text.fieldReward}
        optional
        value={reward}
        maxLength={SCRIPT_LIMITS.blockHint}
        onChange={(event) => setReward(event.target.value)}
      />
      <TextField
        label={text.fieldBridge}
        optional
        value={bridge}
        maxLength={SCRIPT_LIMITS.blockHint}
        onChange={(event) => setBridge(event.target.value)}
      />
      <TextField
        type="number"
        label={text.fieldSeconds}
        min={1}
        value={seconds}
        onChange={(event) => setSeconds(event.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="sm" disabled={busy || !validSeconds}>
          {text.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {text.cancel}
        </Button>
      </div>
    </form>
  )
}

export interface OutlineStepProps {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
  readonly onToFacts: () => void
  readonly onToDraft: () => void
  /** A block is open: replacing the outline or leaving the step would lose what is being written. */
  readonly onEditing: (editing: boolean) => void
}

export function OutlineStep({ script, ai, onChange, onError, onToFacts, onToDraft, onEditing }: OutlineStepProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [instructions, setInstructions] = useState('')
  // Where the focus goes back after a move: the same button of the same block.
  const refocus = useRef<string | null>(null)
  const outline = script.outline
  const price = useEstimate(script, 'escaleta')
  const { estimate } = price
  const isApproved = script.outline !== null && script.outlineApprovedVersion === script.outline.version
  const writePrice = useEstimate(script, 'guion', isApproved && script.format === 'largo' && !script.draft)

  const isEditing = editing !== null
  useEffect(() => {
    onEditing(isEditing)
    return () => onEditing(false)
  }, [isEditing, onEditing])

  // Another tab can take the open block away: there would be nothing left to finish.
  useEffect(() => {
    if (editing && outline && !outline.content.blocks.some((block) => block.id === editing)) setEditing(null)
  }, [editing, outline])

  useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLElement>(`[data-block-action="${refocus.current}"]`)?.focus()
    refocus.current = null
  }, [outline?.version, editing])

  if (!outline) {
    return (
      <>
        <p>{text.none}</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onToFacts}>
            {text.toFacts}
          </Button>
        </div>
      </>
    )
  }

  const blocks = outline.content.blocks
  const busy = saving || ai.working !== null
  // What is being typed in a block is not in any version yet: it cannot be approved or replaced from outside.
  const locked = busy || editing !== null
  const failure = ai.failureFor('escaleta')
  const approved = script.outlineApprovedVersion === outline.version
  const total = blocks.reduce((sum, block) => sum + block.seconds, 0)
  const allTitled = blocks.every((block) => block.title.trim() !== '')

  const save = async (next: readonly OutlineBlock[]) => {
    setSaving(true)
    try {
      onChange(
        await scriptsApi.saveOutline(script.id, { baseVersion: outline.version, content: { blocks: [...next] } }),
      )
      return true
    } catch (cause) {
      onError(cause)
      return false
    } finally {
      setSaving(false)
    }
  }

  const move = (index: number, by: -1 | 1, action: string) => {
    const next = [...blocks]
    const [block] = next.splice(index, 1)
    next.splice(index + by, 0, block!)
    refocus.current = action
    void save(next)
  }

  const add = async () => {
    const id = crypto.randomUUID()
    const block: OutlineBlock = {
      id,
      type: 'acto',
      title: '',
      purpose: '',
      question: null,
      reward: null,
      bridge: null,
      seconds: 60,
    }
    // Before the closing, where a new act belongs.
    const at = blocks.at(-1)?.type === 'cierre' ? blocks.length - 1 : blocks.length
    if (await save([...blocks.slice(0, at), block, ...blocks.slice(at)])) setEditing(id)
  }

  const approve = async () => {
    setSaving(true)
    try {
      onChange(await scriptsApi.approveOutline(script.id, outline.version))
    } catch (cause) {
      onError(cause)
    } finally {
      setSaving(false)
    }
  }

  const named = (accion: string, block: OutlineBlock) => format(text.named, { accion, titulo: titleOf(block) })
  const actionButton = (label: string, block: OutlineBlock, onClick: () => void, unavailable = false, key = label) => (
    <Button
      variant="ghost"
      size="sm"
      data-block-action={`${block.id}:${key}`}
      aria-label={named(label, block)}
      aria-disabled={unavailable || locked || undefined}
      onClick={() => {
        if (!unavailable && !locked) onClick()
      }}
    >
      {label}
    </Button>
  )

  return (
    <>
      <p className={styles.why}>{text.why}</p>
      {script.outlineFromAi && <DataSource kind="ia" />}
      <ol className={styles.options}>
        {blocks.map((block, index) => (
          <Card as="li" key={block.id} className={styles.option}>
            {editing === block.id ? (
              <BlockEditor
                block={block}
                busy={busy}
                onCancel={() => {
                  refocus.current = `${block.id}:${text.change}`
                  setEditing(null)
                }}
                onSave={(changed) => {
                  void save(blocks.map((one) => (one.id === block.id ? changed : one))).then((ok) => {
                    if (ok) {
                      refocus.current = `${block.id}:${text.change}`
                      setEditing(null)
                    }
                  })
                }}
              />
            ) : (
              <>
                <h2>
                  <Badge>{text.types[block.type]}</Badge> {titleOf(block)}
                </h2>
                {block.purpose && <p>{format(text.purpose, { texto: block.purpose })}</p>}
                {block.question && <p>{format(text.question, { texto: block.question })}</p>}
                {block.reward && <p>{format(text.reward, { texto: block.reward })}</p>}
                {block.bridge && <p>{format(text.bridge, { texto: block.bridge })}</p>}
                <p>{format(text.duration, { tiempo: clock(block.seconds) })}</p>
                <div className={styles.actions}>
                  {actionButton(text.up, block, () => move(index, -1, `${block.id}:up`), index === 0, 'up')}
                  {actionButton(
                    text.down,
                    block,
                    () => move(index, 1, `${block.id}:down`),
                    index === blocks.length - 1,
                    'down',
                  )}
                  {actionButton(text.change, block, () => setEditing(block.id))}
                  {actionButton(
                    text.remove,
                    block,
                    () => {
                      refocus.current = 'add'
                      void save(blocks.filter((one) => one.id !== block.id))
                    },
                    blocks.length === 1,
                  )}
                </div>
              </>
            )}
          </Card>
        ))}
      </ol>
      <p>{format(text.total, { total: clock(total), objetivo: clock(script.targetSeconds) })}</p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          data-block-action="add"
          aria-disabled={locked || undefined}
          onClick={() => !locked && void add()}
        >
          {text.add}
        </Button>
      </div>
      {approved ? (
        <>
          <p className={styles.notice}>{text.approved}</p>
          {writePrice.error !== null && (
            <ErrorMessage
              live
              title={errorText(writePrice.error)}
              action={{ label: es.app.retry, onClick: writePrice.retry }}
            />
          )}
          {script.draft && (
            <div className={styles.actions}>
              <Button variant="primary" onClick={onToDraft}>
                {text.toDraft}
              </Button>
            </div>
          )}
          {!script.draft && (
            <AiAction
              label={text.writeDraft}
              estimate={writePrice.estimate}
              failure={ai.failureFor('guion')}
              busy={ai.working === 'guion'}
              disabled={locked}
              onRun={() => void ai.run('guion', writePrice)}
            />
          )}
        </>
      ) : (
        <>
          {!allTitled && <p className={styles.notice}>{text.needsTitle}</p>}
          <div className={styles.actions}>
            <Button variant="primary" loading={saving} disabled={locked || !allTitled} onClick={() => void approve()}>
              {text.approve}
            </Button>
          </div>
        </>
      )}
      {editing !== null && <p className={styles.notice}>{text.finishEditing}</p>}
      {price.error !== null && (
        <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
      )}
      {/* Open if it failed: the reason and the way out are inside (contracts/http-api.md). */}
      <Disclosure key={failure ? 'failed' : 'idle'} summary={text.againSection} defaultOpen={failure !== null}>
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
          estimate={estimate}
          failure={failure}
          busy={ai.working === 'escaleta'}
          disabled={locked}
          onRun={() => void ai.run('escaleta', price, instructions)}
        />
      </Disclosure>
    </>
  )
}
