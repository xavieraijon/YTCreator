import { type ScriptView } from '@ytcreator/core/api'
import { SCRIPT_LIMITS } from '@ytcreator/core'
import { Button, Card, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { ApiClientError, scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { FactsList } from './FactsList.tsx'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.facts

export interface FactsStepProps {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly nothingFound: boolean
  readonly onChange: (script: ScriptView) => void
  // Saving the notes or the duration on its own: it keeps the messages on screen, which the creator has not closed.
  readonly onSaved?: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
  readonly onToDraft: () => void
  readonly onToOutline: () => void
}

const AUTOSAVE_MS = 1500

// Duration and notes: what the AI starts from (contracts/ui-screens.md, «Hechos»).
export function FactsStep({
  script,
  ai,
  nothingFound,
  onChange,
  onSaved = onChange,
  onError,
  onToDraft,
  onToOutline,
}: FactsStepProps) {
  // A long video is thought of in minutes and a Short in seconds.
  const unit = script.format === 'largo' ? 60 : 1
  const [duration, setDuration] = useState(String(Math.round(script.targetSeconds / unit)))
  const [notes, setNotes] = useState(script.notes)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [mine, setMine] = useState<string | null>(null)
  const isShort = script.format === 'short'
  const writeUse = isShort ? 'guion_short' : 'escaleta'
  // Once a Short is written, asking for another is done from its script, where an approval is protected.
  // Once written, what is next is never replaced from here: another one is asked for in its own step, which protects
  // an approval (decision 28; for the outline, novice audit of 005, decision 51).
  const canWrite = isShort ? script.draft === null : script.outline === null
  const price = useEstimate(script, writeUse, canWrite)
  const { estimate } = price
  const researchPrice = useEstimate(script, 'investigacion', script.webResearch)

  // Untouched, the duration stays as it was saved: what is shown is rounded.
  const seconds =
    duration === String(Math.round(script.targetSeconds / unit)) ? script.targetSeconds : Number(duration) * unit
  const valid = Number.isInteger(seconds) && seconds >= script.limits.minSeconds && seconds <= script.limits.maxSeconds
  const dirty = (valid && seconds !== script.targetSeconds) || notes !== script.notes

  // A click on a button blurs the field first: both saves go one after the other, each on top of the last one.
  const lastSaved = useRef(script)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  if (lastSaved.current.updatedAt < script.updatedAt) lastSaved.current = script

  const send = async (): Promise<boolean> => {
    if (conflict) return false
    const base = lastSaved.current
    if (seconds === base.targetSeconds && notes === base.notes) return true
    try {
      const changed = await scriptsApi.change(base.id, {
        baseUpdatedAt: base.updatedAt,
        ...(seconds !== base.targetSeconds ? { targetSeconds: seconds } : {}),
        ...(notes !== base.notes ? { notes } : {}),
      })
      lastSaved.current = changed
      onSaved(changed)
      setSaved(true)
      return true
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.body?.code === 'version_cambiada') setConflict(true)
      else onError(cause)
      return false
    }
  }

  // Nothing of the other tab or of this one is lost without the creator choosing (R18, decision 16).
  const takeLatest = async () => {
    try {
      const latest = await scriptsApi.get(script.id)
      lastSaved.current = latest
      setMine(notes)
      setNotes(latest.notes)
      setDuration(String(Math.round(latest.targetSeconds / unit)))
      setConflict(false)
      onChange(latest)
    } catch (cause) {
      onError(cause)
    }
  }

  const keepMine = async () => {
    try {
      const latest = await scriptsApi.get(script.id)
      const changed = await scriptsApi.change(script.id, {
        baseUpdatedAt: latest.updatedAt,
        notes,
        targetSeconds: seconds,
      })
      lastSaved.current = changed
      setConflict(false)
      onChange(changed)
    } catch (cause) {
      onError(cause)
    }
  }

  const save = (): Promise<boolean> => {
    if (!valid) return Promise.resolve(false)
    queue.current = queue.current.then(send, send)
    return queue.current
  }

  // The notes save themselves a moment after the creator stops typing: closing the tab with the cursor still in them
  // used to lose them (novice audit of 005, decision 51).
  const latestSave = useRef(save)
  latestSave.current = save
  useEffect(() => {
    if (notes === lastSaved.current.notes) return
    const timer = setTimeout(() => void latestSave.current(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [notes])

  const propose = async () => {
    // Saved first, so the price is the one of what is on the screen.
    if (await save()) await ai.run(writeUse, price)
  }

  const research = async () => {
    // Saved first: the notes are what it searches with.
    if (await save()) await ai.run('investigacion', researchPrice)
  }

  const words = Math.round((seconds / 60) * script.voice.wordsPerMinute)
  return (
    <>
      <p className={styles.why}>{text.why}</p>
      <Card className={styles.option}>
        <h2>{scriptEs.idea.title}</h2>
        {script.idea.hook && <p>{format(scriptEs.idea.hook, { texto: script.idea.hook })}</p>}
        {script.idea.query && <p>{format(scriptEs.idea.query, { texto: script.idea.query })}</p>}
        <p>{format(scriptEs.idea.format, { texto: scriptEs.format[script.format] })}</p>
      </Card>
      <TextField
        type="number"
        label={script.format === 'largo' ? text.minutes : text.seconds}
        value={duration}
        inputMode="numeric"
        min={Math.ceil(script.limits.minSeconds / unit)}
        max={Math.floor(script.limits.maxSeconds / unit)}
        disabled={ai.working !== null}
        description={
          valid
            ? format(text.words, { palabras: String(words), ritmo: String(script.voice.wordsPerMinute) })
            : undefined
        }
        error={
          valid
            ? undefined
            : format(text.outOfRange, {
                min: String(Math.ceil(script.limits.minSeconds / unit)),
                max: String(Math.floor(script.limits.maxSeconds / unit)),
                unidad: unit === 60 ? text.unitMinutes : text.unitSeconds,
              })
        }
        onChange={(event) => {
          setDuration(event.target.value)
          setSaved(false)
        }}
        onBlur={() => void save()}
      />
      <TextArea
        label={text.notes}
        description={`${format(text.notesHelp, {
          n: notes.length.toLocaleString('es-ES'),
          max: SCRIPT_LIMITS.notes.toLocaleString('es-ES'),
        })}${script.webResearch ? ` ${text.notesSearch}` : ''}`}
        value={notes}
        rows={8}
        autoResize
        maxLength={SCRIPT_LIMITS.notes}
        disabled={ai.working !== null}
        onChange={(event) => {
          setNotes(event.target.value)
          setSaved(false)
        }}
        onBlur={() => void save()}
      />
      <p role="status">{saved && !dirty ? text.saved : ''}</p>
      {conflict && (
        <>
          <ErrorMessage
            live
            title={text.conflict}
            action={{ label: text.useLatest, onClick: () => void takeLatest() }}
          />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => void keepMine()}>
              {text.keepMine}
            </Button>
          </div>
        </>
      )}
      {mine !== null && <TextArea label={text.yourText} value={mine} rows={6} readOnly />}
      {script.webResearch ? (
        <>
          <p className={styles.why}>{text.researchIntro}</p>
          {researchPrice.error !== null && (
            <ErrorMessage
              live
              title={errorText(researchPrice.error)}
              action={{ label: es.app.retry, onClick: researchPrice.retry }}
            />
          )}
          <AiAction
            label={text.research}
            primary={false}
            estimate={researchPrice.estimate}
            failure={ai.failureFor('investigacion')}
            busy={ai.working === 'investigacion'}
            disabled={!valid || ai.working !== null}
            onRun={() => void research()}
          />
          {researchPrice.estimate && !researchPrice.estimate.included && (
            <p className={styles.notice}>
              {format(text.researchCost, { n: String(researchPrice.estimate.searches ?? 0) })}
            </p>
          )}
        </>
      ) : (
        <p className={styles.notice}>{text.noWeb}</p>
      )}
      <p role="status">{nothingFound ? text.researchEmpty : ''}</p>
      <FactsList script={script} locked={ai.working !== null} onChange={onChange} />
      {notes.trim() === '' && (script.facts?.content.facts.length ?? 0) === 0 && (
        <p className={styles.notice}>{text.noNotes}</p>
      )}
      {/* The button greys out and the notes do not save for a duration far above, out of sight (decision 53). */}
      {!valid && <p className={styles.notice}>{text.fixDuration}</p>}
      {canWrite ? (
        <>
          <p className={styles.why}>{isShort ? text.shortIntro : text.outlineIntro}</p>
          {price.error !== null && (
            <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
          )}
          <AiAction
            label={isShort ? text.writeShort : text.proposeOutline}
            estimate={estimate}
            failure={ai.failureFor(writeUse)}
            busy={ai.working === writeUse}
            disabled={!valid || ai.working !== null}
            onRun={() => void propose()}
          />
        </>
      ) : (
        <>
          <p className={styles.why}>{isShort ? text.shortIntro : text.outlineDone}</p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={isShort ? onToDraft : onToOutline}>
              {isShort ? scriptEs.outline.toDraft : scriptEs.draft.toOutline}
            </Button>
          </div>
        </>
      )}
    </>
  )
}
