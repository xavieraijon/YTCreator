import { DEFAULT_SCRIPT_SETTINGS, SCRIPT_LIMITS, type ScriptSettings } from '@ytcreator/core'
import { Button, Disclosure, ErrorMessage, format, RadioGroup, TextArea, TextField } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { channelApi, scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = scriptEs.voice
const draft = scriptEs.draft
const { min, max } = SCRIPT_LIMITS.wordsPerMinute

// How the channel talks: once per channel, and only the scripts written from now on use it (US2, scenario 7).
export function VoiceSettings() {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [voice, setVoice] = useState<ScriptSettings>(DEFAULT_SCRIPT_SETTINGS)
  const [pace, setPace] = useState(String(DEFAULT_SCRIPT_SETTINGS.wordsPerMinute))
  const [error, setError] = useState<unknown>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const current = await channelApi.current({ signal })
      if (!current.channel || !current.profile) {
        navigate({ page: 'channelStart' })
        return
      }
      const loaded = await scriptsApi.settings(current.channel.id, { signal })
      setVoice(loaded)
      setPace(String(loaded.wordsPerMinute))
      setChannelId(current.channel.id)
    } catch (cause) {
      if (!signal?.aborted) setError(cause)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const change = (fields: Partial<ScriptSettings>) => {
    setVoice((current) => ({ ...current, ...fields }))
    setSaved(false)
  }

  const words = Number(pace)
  const validPace = Number.isInteger(words) && words >= min && words <= max

  const save = async () => {
    if (!channelId || !validPace) return
    setSaving(true)
    setSaveError(null)
    try {
      const { address, register, sample } = voice
      await scriptsApi.saveSettings(channelId, { address, register, sample, wordsPerMinute: words })
      setSaved(true)
    } catch (cause) {
      setSaveError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      )}
      {channelId === null ? (
        error === null && <p role="status">{es.app.loading}</p>
      ) : (
        <form
          className={styles.options}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <RadioGroup
            label={text.address}
            value={voice.address}
            onValueChange={(address) => change({ address: address as ScriptSettings['address'] })}
            options={[
              { value: 'tu', label: draft.address.tu },
              { value: 'usted', label: draft.address.usted },
            ]}
          />
          <RadioGroup
            label={text.register}
            value={voice.register}
            onValueChange={(register) => change({ register: register as ScriptSettings['register'] })}
            options={[
              { value: 'cercano', label: draft.register.cercano },
              { value: 'sobrio', label: draft.register.sobrio },
              { value: 'energico', label: draft.register.energico },
            ]}
          />
          <TextArea
            label={text.sample}
            description={text.sampleHelp}
            optional
            value={voice.sample}
            rows={6}
            maxLength={SCRIPT_LIMITS.sample}
            onChange={(event) => change({ sample: event.target.value })}
          />
          <Disclosure summary={text.more}>
            <TextField
              label={text.pace}
              description={text.paceHelp}
              type="number"
              inputMode="numeric"
              value={pace}
              min={min}
              max={max}
              error={validPace ? undefined : format(text.paceRange, { min: String(min), max: String(max) })}
              onChange={(event) => {
                setPace(event.target.value)
                setSaved(false)
              }}
            />
          </Disclosure>
          {/* Trying again saves: reloading here would throw away what was just written. */}
          {saveError !== null && (
            <ErrorMessage
              live
              title={errorText(saveError)}
              action={{ label: es.app.retry, onClick: () => void save() }}
            />
          )}
          <p role="status">{saved ? text.saved : ''}</p>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={saving} disabled={!validPace}>
              {text.save}
            </Button>
          </div>
        </form>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'scriptList' })}>
          {scriptEs.screen.backToList}
        </Button>
      </div>
    </Screen>
  )
}
