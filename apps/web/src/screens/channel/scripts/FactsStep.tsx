import { type ScriptView } from '@ytcreator/core/api'
import { SCRIPT_LIMITS } from '@ytcreator/core'
import { Button, Card, ErrorMessage, format, TextArea, TextField } from '@ytcreator/ui'
import { useRef, useState } from 'react'
import { ApiClientError, scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.facts

export interface FactsStepProps {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
}

// Duration and notes: what the AI starts from (contracts/ui-screens.md, «Hechos»).
export function FactsStep({ script, ai, onChange, onError }: FactsStepProps) {
  // A long video is thought of in minutes and a Short in seconds.
  const unit = script.format === 'largo' ? 60 : 1
  const [duration, setDuration] = useState(String(Math.round(script.targetSeconds / unit)))
  const [notes, setNotes] = useState(script.notes)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [mine, setMine] = useState<string | null>(null)
  const price = useEstimate(script, 'escaleta', script.format === 'largo')
  const { estimate } = price

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
      onChange(changed)
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

  const propose = async () => {
    // Saved first, so the price is the one of what is on the screen.
    if (await save()) await ai.run('escaleta', price)
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
        description={format(text.notesHelp, {
          n: notes.length.toLocaleString('es-ES'),
          max: SCRIPT_LIMITS.notes.toLocaleString('es-ES'),
        })}
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
      {notes.trim() === '' && (script.facts?.content.facts.length ?? 0) === 0 && (
        <p className={styles.notice}>{text.noNotes}</p>
      )}
      {script.format === 'largo' && (
        <>
          <p className={styles.why}>{text.outlineIntro}</p>
          {price.error !== null && (
            <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
          )}
          <AiAction
            label={text.proposeOutline}
            estimate={estimate}
            failure={ai.failureFor('escaleta')}
            busy={ai.working === 'escaleta'}
            disabled={!valid || ai.working !== null}
            onRun={() => void propose()}
          />
        </>
      )}
    </>
  )
}
