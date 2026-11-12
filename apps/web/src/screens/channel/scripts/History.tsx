import { type ComparableField, type FactLabel, type ItemComparison, type ScriptKind, splitMarks } from '@ytcreator/core'
import type { ScriptVersionDetail, ScriptVersionSummary, ScriptView } from '@ytcreator/core/api'
import { Badge, Button, Card, DataSource, Dialog, Disclosure, ErrorMessage, format } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { errorText } from '../../../shell/errorText.ts'
import { formatDate } from '../../../shell/statusText.ts'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { clock } from './OutlineStep.tsx'

const text = scriptEs.history

const nameOf = ({ title, type }: ItemComparison) => title || (type ? scriptEs.outline.types[type] : text.fact)

function valueOf({ field, value }: ComparableField): string {
  if (value === '') return text.empty
  if (field === 'seconds') return clock(Number(value))
  if (field === 'label') return text.labels[value as FactLabel]
  return value
}

function Field({ field }: { readonly field: ComparableField }) {
  return (
    <p>
      <strong>{text.fields[field.field]}</strong>{' '}
      {field.claims
        ? splitMarks(field.value, field.claims).map((part, index) =>
            part.claimId ? (
              <mark key={index} className={styles.claim}>
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )
        : valueOf(field)}
    </p>
  )
}

function Fields({ label, fields }: { readonly label?: string; readonly fields: readonly ComparableField[] | null }) {
  if (!fields) return null
  return (
    <>
      {label && <p className={styles.notice}>{label}</p>}
      {fields.map((field) => (
        <Field key={field.field} field={field} />
      ))}
    </>
  )
}

function Comparison({ detail, kind }: { readonly detail: ScriptVersionDetail; readonly kind: ScriptKind }) {
  const { changes, orderChanged } = detail
  const nothing = !orderChanged && changes.every((one) => one.change === 'igual')
  return (
    <>
      {nothing && <p>{text.noChanges}</p>}
      {orderChanged && <p className={styles.notice}>{text.otherOrder}</p>}
      {kind !== 'hechos' && <DataSource kind="ia" />}
      <ul className={styles.options}>
        {changes.map((one) => (
          <Card as="li" key={one.id}>
            <h3>
              <Badge>{text.changes[one.change]}</Badge> {nameOf(one)}
            </h3>
            {one.change === 'cambiado' ? (
              <>
                <Fields label={text.then} fields={one.before} />
                <Fields label={text.now} fields={one.after} />
              </>
            ) : (
              <Fields fields={one.change === 'quitado' ? one.before : one.after} />
            )}
          </Card>
        ))}
      </ul>
    </>
  )
}

export interface HistoryProps {
  readonly script: ScriptView
  readonly kind: ScriptKind
  /** Something is being written or generated: going back would step on it. */
  readonly busy: boolean
  readonly onChange: (script: ScriptView) => void
  readonly onError: (cause: unknown) => void
}

const currentOf = (script: ScriptView, kind: ScriptKind) =>
  (kind === 'hechos' ? script.facts : kind === 'escaleta' ? script.outline : script.draft)?.version ?? null

// Every version stays: going back to one copies it as the newest (FR-020, SC-007).
export function History({ script, kind, busy, onChange, onError }: HistoryProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<readonly ScriptVersionSummary[] | null>(null)
  const [failed, setFailed] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<ScriptVersionDetail | null>(null)
  const [asking, setAsking] = useState(false)
  // The version it came from and the one that made: the note goes once something else is written.
  const [restored, setRestored] = useState<{ from: number; at: number } | null>(null)
  const [seeing, setSeeing] = useState<number | null>(null)
  const backTo = useRef<number | null>(null)
  const comparison = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const note = useRef<HTMLParagraphElement>(null)
  const { id } = script
  const current = currentOf(script, kind)

  useEffect(() => {
    if (!open || current === null) return
    const controller = new AbortController()
    scriptsApi
      .versions(id, kind, { signal: controller.signal })
      .then((got) => {
        setVersions(got)
        setFailed(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailed(cause)
      })
    return () => controller.abort()
  }, [open, id, kind, current, attempt])

  // What was compared was the version that used to be the current one.
  useEffect(() => setSelected(null), [current])

  // The button that had the focus has gone.
  useEffect(() => {
    if (restored !== null) note.current?.focus()
  }, [restored])

  useEffect(() => {
    if (selected) comparison.current?.focus()
    else if (backTo.current !== null) {
      document.querySelector<HTMLElement>(`[data-version-see="${backTo.current}"]`)?.focus()
      backTo.current = null
    }
  }, [selected])

  if (current === null) return null

  const see = async (version: number) => {
    setRestored(null)
    setSeeing(version)
    try {
      setSelected(await scriptsApi.version(id, kind, version))
    } catch (cause) {
      onError(cause)
    } finally {
      setSeeing(null)
    }
  }

  const close = () => {
    backTo.current = selected?.version.version ?? null
    setSelected(null)
  }

  const restore = async () => {
    if (!selected) return
    setAsking(false)
    setSaving(true)
    try {
      const from = selected.version.version
      const view = await scriptsApi.restore(id, kind, from, { baseVersion: current })
      onChange(view)
      setSelected(null)
      setRestored({ from, at: currentOf(view, kind) ?? current })
    } catch (cause) {
      onError(cause)
    } finally {
      setSaving(false)
    }
  }

  const approved = kind === 'guion' && script.status === 'guion_aprobado'

  return (
    <Disclosure summary={text.title} open={open} onOpenChange={setOpen}>
      {failed !== null && (
        <ErrorMessage
          live
          title={errorText(failed)}
          action={{ label: es.app.retry, onClick: () => setAttempt((n) => n + 1) }}
        />
      )}
      {versions === null && failed === null && <p role="status">{es.app.loading}</p>}
      {restored !== null && restored.at === current && (
        <p role="status" tabIndex={-1} ref={note}>
          {format(text.restored, { n: restored.from })}
        </p>
      )}
      {versions !== null && (
        <ul className={styles.options}>
          {versions.map((version) => {
            const isCurrent = version.version === current
            const isSelected = selected?.version.version === version.version
            return (
              <li key={version.version}>
                <p>
                  {format(version.restoredFrom === null ? text.line : text.lineFrom, {
                    version: format(text.version, { n: version.version }),
                    origen: text.origins[version.origin],
                    fecha: formatDate(version.createdAt),
                    copia: version.restoredFrom === null ? '' : format(text.from, { n: version.restoredFrom }),
                  })}{' '}
                  {isCurrent && <Badge>{text.current}</Badge>}
                </p>
                {!isCurrent && !isSelected && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={format(text.seeNamed, { n: version.version })}
                    data-version-see={version.version}
                    loading={seeing === version.version}
                    disabled={seeing !== null}
                    onClick={() => void see(version.version)}
                  >
                    {text.see}
                  </Button>
                )}
                {isSelected && selected && (
                  <div
                    ref={comparison}
                    role="group"
                    tabIndex={-1}
                    aria-label={format(text.comparison, { n: version.version })}
                  >
                    <Comparison detail={selected} kind={kind} />
                    <div className={styles.actions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={saving}
                        disabled={busy}
                        onClick={() => (approved ? setAsking(true) : void restore())}
                      >
                        {text.restore}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={close}>
                        {text.close}
                      </Button>
                    </div>
                    {busy && <p className={styles.notice}>{text.busy}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={scriptEs.draft.unapproveTitle}
        description={text.unapproveBody}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {scriptEs.draft.cancel}
            </Button>
            <Button variant="primary" onClick={() => void restore()}>
              {text.restore}
            </Button>
          </>
        }
      />
    </Disclosure>
  )
}
