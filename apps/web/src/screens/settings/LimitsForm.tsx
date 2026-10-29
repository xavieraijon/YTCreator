import type { LimitsField } from '@ytcreator/core'
import { limitsViewSchema, type FieldCode, type LimitsBody, type LimitsView } from '@ytcreator/core/api'
import { ErrorMessage, TextField } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { errorText } from '../../shell/errorText.ts'
import { es } from '../../strings/es.ts'
import { formatEuros, parseEuros } from './euros.ts'
import styles from './settings.module.css'

type Texts = Record<LimitsField, string>
type FieldErrors = Partial<Record<LimitsField, FieldCode>>

const FIELDS: readonly { id: LimitsField; label: string; help: string }[] = [
  { id: 'perOperationCents', label: es.limits.perOperation, help: es.limits.perOperationHelp },
  { id: 'dailyCents', label: es.limits.daily, help: es.limits.dailyHelp },
  { id: 'monthlyCents', label: es.limits.monthly, help: es.limits.monthlyHelp },
]

const toTexts = (view: LimitsView): Texts => ({
  perOperationCents: formatEuros(view.perOperationCents),
  dailyCents: formatEuros(view.dailyCents),
  monthlyCents: formatEuros(view.monthlyCents),
})

// The saved limits, or the proposed ones (FR-021); `save` is shared by the wizard and Ajustes (FR-022).
export function useLimitsForm() {
  const [texts, setTexts] = useState<Texts | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const view = await apiClient.get('/api/settings/limits', limitsViewSchema)
      setTexts(toTexts(view))
      setAccepted(view.accepted)
    } catch (caught) {
      setLoadError(errorText(caught))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const change = (field: LimitsField, value: string) => {
    setTexts((current) => (current ? { ...current, [field]: value } : current))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  // A text that is not an amount is caught here; the rules between the three are the server's.
  const save = async (): Promise<boolean> => {
    if (!texts) return false
    setError(null)
    const local: FieldErrors = {}
    const cents: Partial<LimitsBody> = {}
    for (const { id } of FIELDS) {
      const value = parseEuros(texts[id])
      if (value === null) local[id] = 'no_valido'
      else cents[id] = value
    }
    setFieldErrors(local)
    if (Object.keys(local).length > 0) return false

    setSaving(true)
    try {
      const view = await apiClient.put('/api/settings/limits', cents, limitsViewSchema)
      setTexts(toTexts(view))
      setAccepted(view.accepted)
      return true
    } catch (caught) {
      const fields = caught instanceof ApiClientError ? caught.body?.fields : undefined
      if (fields && Object.keys(fields).length > 0) setFieldErrors(fields)
      else setError(errorText(caught))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { texts, accepted, fieldErrors, error, loadError, saving, load, change, save }
}

export type LimitsFormState = ReturnType<typeof useLimitsForm>

export interface LimitsFormProps {
  readonly form: LimitsFormState
  /** Enter in a field: the same as the screen's main action. */
  readonly onSubmit: () => void
}

// Three amounts in euros, with a comma or a point; each error under its own field.
export function LimitsForm({ form, onSubmit }: LimitsFormProps) {
  if (form.loadError) {
    return (
      <ErrorMessage live title={form.loadError} action={{ label: es.app.retry, onClick: () => void form.load() }} />
    )
  }
  if (!form.texts) return <p role="status">{es.app.loading}</p>
  const texts = form.texts

  return (
    <form
      className={styles.limits}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {FIELDS.map(({ id, label, help }) => {
        const code = form.fieldErrors[id]
        return (
          <TextField
            key={id}
            label={`${label} (${es.limits.euros})`}
            description={help}
            error={code ? es.field[code] : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={texts[id]}
            onChange={(event) => form.change(id, event.target.value)}
          />
        )
      })}
      {/* Lets Enter submit the form; the visible action is the screen's own button. */}
      <button type="submit" hidden />
      {form.error && <ErrorMessage live title={form.error} action={{ label: es.app.retry, onClick: onSubmit }} />}
    </form>
  )
}
