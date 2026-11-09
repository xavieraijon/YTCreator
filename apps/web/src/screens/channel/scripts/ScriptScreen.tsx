import type { ScriptView } from '@ytcreator/core/api'
import { Button, ErrorMessage, Stepper } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'

const text = scriptEs.screen

export type ScriptStep = 'hechos' | 'escaleta' | 'guion' | 'revisar'

// A Short goes straight from the facts to the script (contracts/ui-screens.md).
export const stepsOf = (script: ScriptView): readonly ScriptStep[] =>
  script.format === 'short' ? ['hechos', 'guion', 'revisar'] : ['hechos', 'escaleta', 'guion', 'revisar']

// Where the script was left.
export function stepFor(script: ScriptView): ScriptStep {
  switch (script.status) {
    case 'sin_empezar':
      return 'hechos'
    case 'escaleta_borrador':
    case 'escaleta_aprobada':
      return 'escaleta'
    case 'guion_borrador':
      return 'guion'
    case 'guion_aprobado':
      return 'revisar'
  }
}

export function ScriptScreen({ id }: { readonly id: string }) {
  const [script, setScript] = useState<ScriptView | null>(null)
  const [step, setStep] = useState<ScriptStep | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      try {
        const loaded = await scriptsApi.get(id, { signal })
        setScript(loaded)
        setStep((current) => current ?? stepFor(loaded))
      } catch (cause) {
        if (!signal?.aborted) setError(cause)
      }
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (error !== null) {
    return (
      <Screen title={scriptEs.list.title}>
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      </Screen>
    )
  }
  if (!script || !step) {
    return (
      <Screen title={scriptEs.list.title}>
        <p role="status">{text.loading}</p>
      </Screen>
    )
  }

  const steps = stepsOf(script)
  return (
    <Screen
      title={script.idea.title}
      before={
        <Stepper
          steps={steps.map((id) => ({ id, label: text.steps[id] }))}
          current={steps.indexOf(step) + 1}
          aria-label={text.progress}
        />
      }
    >
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'scriptList' })}>
          {text.backToList}
        </Button>
      </div>
    </Screen>
  )
}
