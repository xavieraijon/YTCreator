import { type YouTubeSettings, type YouTubeSourceSetting, YOUTUBE_SOURCE_SETTINGS } from '@ytcreator/core/api'
import { Button, Dialog, Disclosure, ErrorMessage, format, RadioGroup, TextField, useToast } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, youtubeSettingsApi } from '../../api/client.ts'
import { errorText } from '../../shell/errorText.ts'
import { useJob } from '../../shell/useJob.ts'
import { es } from '../../strings/es.ts'
import styles from './settings.module.css'

const text = es.youtubeSettings
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value)

export interface YouTubeSettingsViewProps {
  readonly settings: YouTubeSettings
  readonly updating: boolean
  readonly savingSource?: boolean
  readonly savingKey?: boolean
  readonly keyError?: string | null
  /** Changes after each saved or removed key: the field is emptied, and «Modo experto» stays as it was. */
  readonly cleared?: number
  readonly onSource: (source: YouTubeSourceSetting) => void
  readonly onSaveKey: (apiKey: string) => void
  readonly onRemoveKey: () => void
  readonly onUpdateReader: () => void
}

// Ajustes → YouTube (contracts/ui-screens.md): the source, the reader, and the optional key in «Modo experto», which
// only ever shows its hint (FR-033).
export function YouTubeSettingsView({
  settings,
  updating,
  savingSource = false,
  savingKey = false,
  keyError = null,
  cleared = 0,
  onSource,
  onSaveKey,
  onRemoveKey,
  onUpdateReader,
}: YouTubeSettingsViewProps) {
  const [source, setSource] = useState<YouTubeSourceSetting>(settings.source)
  const [key, setKey] = useState('')
  useEffect(() => setKey(''), [cleared])
  const { apiKey, quota } = settings
  const usableKey = apiKey.set && !apiKey.rejected

  return (
    <div className={styles.stack}>
      <p className={styles.text}>{text.why}</p>
      <p>
        {settings.effectiveSource !== 'data_api' && !settings.ytdlpVersion
          ? text.inUseNoReader
          : text.inUse[settings.effectiveSource]}
      </p>

      <section className={styles.section}>
        <RadioGroup
          label={text.source}
          value={source}
          onValueChange={(value) => setSource(value as YouTubeSourceSetting)}
          options={YOUTUBE_SOURCE_SETTINGS.map((value) => ({
            value,
            label: text.sourceOptions[value],
            description: value === 'data_api' && !usableKey ? text.sourceNeedsKey : text.sourceHelp[value],
            disabled: value === 'data_api' && !usableKey && settings.source !== 'data_api',
          }))}
        />
        <div>
          <Button variant="primary" loading={savingSource} onClick={() => onSource(source)}>
            {text.save}
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{text.reader}</h2>
        <p className={styles.text}>{text.updateWhy}</p>
        <p role="status">
          {settings.ytdlpVersion ? format(text.readerVersion, { version: settings.ytdlpVersion }) : text.noReader}
        </p>
        <div>
          <Button loading={updating} onClick={onUpdateReader}>
            {updating ? text.updating : text.updateReader}
          </Button>
        </div>
      </section>

      {/* FR-030: the warning is seen without opening «Modo experto». */}
      {quota?.nearLimit && (
        <p className={styles.notice} role="status">
          {text.quotaNear}
        </p>
      )}

      <Disclosure summary={text.expert} defaultOpen={apiKey.rejected}>
        <p className={styles.text}>{text.keyWhy}</p>
        {apiKey.set && apiKey.hint && <p>{format(text.keySaved, { pista: apiKey.hint })}</p>}
        {apiKey.rejected && (
          <p className={styles.notice} role="status">
            {text.keyRejected}
          </p>
        )}
        {quota && <p>{format(text.quota, { usadas: number(quota.used), limite: number(quota.limit) })}</p>}
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault()
            if (key.trim() !== '') onSaveKey(key)
          }}
        >
          <TextField
            label={text.keyLabel}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            error={keyError ?? undefined}
            onChange={(event) => setKey(event.target.value)}
          />
          <div className={styles.row}>
            <Button type="submit" loading={savingKey} disabled={key.trim() === ''}>
              {text.saveKey}
            </Button>
            {apiKey.set && (
              <Button variant="ghost" onClick={onRemoveKey}>
                {text.removeKey}
              </Button>
            )}
          </div>
        </form>
      </Disclosure>
    </div>
  )
}

export function YouTubeSettingsScreen() {
  const [settings, setSettings] = useState<YouTubeSettings | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [savingSource, setSavingSource] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  // Bumped after each saved or removed key, so the field never keeps what was typed.
  const [cleared, setCleared] = useState(0)
  const job = useJob(jobId)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setSettings(await youtubeSettingsApi.get())
    } catch (caught) {
      setLoadError(caught)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The reader is updated in the background; once it ends, the version shown follows.
  useEffect(() => {
    if (!job || job.status === 'en_curso') return
    setJobId(null)
    if (job.status === 'hecho') toast({ title: text.updated, tone: 'success' })
    else toast({ title: text.updateFailed, tone: 'danger' })
    void load()
  }, [job, load, toast])

  const saveSource = async (source: YouTubeSourceSetting) => {
    setSavingSource(true)
    setSaveError(null)
    try {
      setSettings(await youtubeSettingsApi.source(source))
      toast({ title: text.saved, tone: 'success' })
    } catch (caught) {
      setSaveError(caught)
    } finally {
      setSavingSource(false)
    }
  }

  const saveKey = async (apiKey: string) => {
    setSavingKey(true)
    setKeyError(null)
    setSaveError(null)
    try {
      setSettings(await youtubeSettingsApi.saveKey(apiKey))
      setCleared((n) => n + 1)
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.body?.fields?.['apiKey']) setKeyError(text.keyInvalid)
      // YouTube did not answer: the key is neither good nor bad yet, and the field keeps it to try again.
      else if (caught instanceof ApiClientError && caught.body?.youtubeFailure) setKeyError(text.keyUnchecked)
      else setSaveError(caught)
    } finally {
      setSavingKey(false)
    }
  }

  const removeKey = async () => {
    setRemoving(true)
    setSaveError(null)
    try {
      await youtubeSettingsApi.removeKey()
      setConfirmRemove(false)
      setCleared((n) => n + 1)
      await load()
    } catch (caught) {
      setSaveError(caught)
    } finally {
      setRemoving(false)
    }
  }

  const updateReader = async () => {
    setSaveError(null)
    try {
      setJobId((await youtubeSettingsApi.updateReader()).jobId)
    } catch (caught) {
      setSaveError(caught)
    }
  }

  if (loadError !== null) {
    return (
      <ErrorMessage live title={errorText(loadError)} action={{ label: es.app.retry, onClick: () => void load() }} />
    )
  }
  if (!settings) return <p role="status">{es.app.loading}</p>

  return (
    <>
      {saveError !== null && (
        <ErrorMessage
          live
          title={errorText(saveError)}
          action={{ label: es.app.retry, onClick: () => setSaveError(null) }}
        />
      )}
      <YouTubeSettingsView
        cleared={cleared}
        settings={settings}
        updating={jobId !== null}
        savingSource={savingSource}
        savingKey={savingKey}
        keyError={keyError}
        onSource={(source) => void saveSource(source)}
        onSaveKey={(apiKey) => void saveKey(apiKey)}
        onRemoveKey={() => setConfirmRemove(true)}
        onUpdateReader={() => void updateReader()}
      />
      <Dialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        size="sm"
        title={text.removeKeyTitle}
        description={text.removeKeyBody}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              {text.cancel}
            </Button>
            <Button variant="danger" loading={removing} onClick={() => void removeKey()}>
              {text.remove}
            </Button>
          </>
        }
      />
    </>
  )
}
