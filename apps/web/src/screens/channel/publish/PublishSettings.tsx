import { PUBLISH_LIMITS } from '@ytcreator/core'
import type { PublishSettingsView } from '@ytcreator/core/api'
import { Button, ErrorMessage, format, Select, TextArea } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { channelApi, packagesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import styles from '../channel.module.css'

const text = publishEs.settings
// Radix gives no option an empty value: «Sin elegir» is this one, and it is saved as `null`.
const NONE = 'sin_elegir'

// «Ajustes de publicación»: the fixed part of every description and the category (contracts/ui-screens.md).
export function PublishSettings() {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [settings, setSettings] = useState<PublishSettingsView | null>(null)
  const [fixedText, setFixedText] = useState('')
  const [category, setCategory] = useState(NONE)
  const [error, setError] = useState<unknown>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const show = (view: PublishSettingsView) => {
    setSettings(view)
    setFixedText(view.fixedText)
    setCategory(view.category ?? NONE)
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    setLoadFailed(false)
    try {
      const current = await channelApi.current({ signal })
      if (!current.channel || !current.profile) {
        navigate({ page: 'channelStart' })
        return
      }
      setChannelId(current.channel.id)
      show(await packagesApi.settings(current.channel.id, { signal }))
    } catch (cause) {
      if (signal?.aborted) return
      setError(cause)
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const save = async () => {
    if (!channelId) return
    setSaving(true)
    setDone(false)
    try {
      show(await packagesApi.saveSettings(channelId, { fixedText, category: category === NONE ? null : category }))
      setError(null)
      setDone(true)
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <Screen title={text.title}>
        {loadFailed ? (
          <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
        ) : (
          <p role="status">{text.loading}</p>
        )}
      </Screen>
    )
  }

  const changed = fixedText !== settings.fixedText || category !== (settings.category ?? NONE)
  const options = [
    { value: NONE, label: text.none },
    ...settings.categories.map((one) => ({
      value: one,
      label: one === settings.suggestedCategory ? format(text.suggested, { categoria: one }) : one,
    })),
  ]

  return (
    <Screen title={text.title}>
      <p className={styles.why}>{text.why}</p>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void save() }} />
      )}
      <div className={styles.form}>
        <TextArea
          label={text.fixed}
          description={format(text.fixedHintWithChars, { n: fixedText.length, max: PUBLISH_LIMITS.fixedText })}
          value={fixedText}
          maxLength={PUBLISH_LIMITS.fixedText}
          onChange={(event) => {
            setFixedText(event.target.value)
            setDone(false)
          }}
        />
        {settings.isDefault && settings.hasHandle && <p>{text.fixedDefault}</p>}
        {!settings.hasHandle && (
          <>
            <p className={styles.notice}>{text.noHandle}</p>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => navigate({ page: 'channelStart' })}>
                {text.toChannel}
              </Button>
            </div>
          </>
        )}
        <Select
          label={text.category}
          description={text.categoryHint}
          options={options}
          value={category}
          onValueChange={(value) => {
            setCategory(value)
            setDone(false)
          }}
        />
        <p className={styles.notice}>{text.notice}</p>
        <div className={styles.actions}>
          <Button variant="primary" loading={saving} disabled={saving || !changed} onClick={() => void save()}>
            {text.save}
          </Button>
          <Button variant="ghost" onClick={() => navigate({ page: 'packageList' })}>
            {text.back}
          </Button>
        </div>
        {done && <p role="status">{text.saved}</p>}
      </div>
    </Screen>
  )
}
