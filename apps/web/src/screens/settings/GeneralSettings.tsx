import { generalSettingsSchema, updateInfoSchema, type FieldCode } from '@ytcreator/core/api'
import { Button, Disclosure, ErrorMessage, Switch, TextField, format, useToast } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { errorText } from '../../shell/errorText.ts'
import { es } from '../../strings/es.ts'
import styles from './settings.module.css'

// A timeout the creator typed, as text: '' clears the override (back to the app's own default).
function toText(seconds: number | null): string {
  return seconds === null ? '' : String(seconds)
}

// FR-031, R20, R21: the version notice toggle, the installed version, and the AI timeout override.
export function GeneralSettings() {
  const [version, setVersion] = useState<string | null>(null)
  const [updatesEnabled, setUpdatesEnabled] = useState<boolean | null>(null)
  const [timeoutText, setTimeoutText] = useState('')
  const [timeoutError, setTimeoutError] = useState<FieldCode | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    setLoadError(null)
    try {
      const [update, general] = await Promise.all([
        apiClient.get('/api/updates', updateInfoSchema),
        apiClient.get('/api/settings/general', generalSettingsSchema),
      ])
      setVersion(update.current)
      setUpdatesEnabled(general.updateCheckEnabled)
      setTimeoutText(toText(general.aiTimeoutSeconds))
    } catch (caught) {
      setLoadError(errorText(caught))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggleUpdates = async (checked: boolean) => {
    setUpdatesEnabled(checked)
    setSaveError(null)
    try {
      await apiClient.patch('/api/settings/general', { updateCheckEnabled: checked }, generalSettingsSchema)
    } catch (caught) {
      setUpdatesEnabled(!checked)
      setSaveError(errorText(caught))
    }
  }

  const saveTimeout = async () => {
    setTimeoutError(null)
    setSaveError(null)
    const trimmed = timeoutText.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isInteger(value) || value < 10 || value > 300)) {
      setTimeoutError('no_valido')
      return
    }
    setSaving(true)
    try {
      const general = await apiClient.patch('/api/settings/general', { aiTimeoutSeconds: value }, generalSettingsSchema)
      setTimeoutText(toText(general.aiTimeoutSeconds))
      toast({ title: es.generalSettings.saved, tone: 'success' })
    } catch (caught) {
      const field = caught instanceof ApiClientError ? caught.body?.fields?.aiTimeoutSeconds : undefined
      if (field) setTimeoutError(field)
      else setSaveError(errorText(caught))
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return <ErrorMessage live title={loadError} action={{ label: es.app.retry, onClick: () => void load() }} />
  }
  if (updatesEnabled === null || version === null) return <p role="status">{es.app.loading}</p>

  return (
    <div className={styles.stack}>
      <p className={styles.text}>{format(es.generalSettings.version, { version })}</p>
      <Switch
        label={es.generalSettings.updates}
        description={es.generalSettings.updatesHelp}
        checked={updatesEnabled}
        onCheckedChange={(checked) => void toggleUpdates(checked)}
      />
      <Disclosure summary={es.generalSettings.expert}>
        <TextField
          label={es.generalSettings.timeout}
          description={`${es.generalSettings.timeoutHelp} (${es.generalSettings.seconds})`}
          error={timeoutError ? es.field[timeoutError] : undefined}
          inputMode="numeric"
          autoComplete="off"
          value={timeoutText}
          onChange={(event) => {
            setTimeoutText(event.target.value)
            setTimeoutError(null)
          }}
        />
        <div>
          <Button variant="secondary" loading={saving} onClick={() => void saveTimeout()}>
            {es.generalSettings.save}
          </Button>
        </div>
      </Disclosure>
      {saveError && (
        <ErrorMessage live title={saveError} action={{ label: es.app.retry, onClick: () => setSaveError(null) }} />
      )}
    </div>
  )
}
