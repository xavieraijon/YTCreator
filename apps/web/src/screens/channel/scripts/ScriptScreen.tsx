import type { ScriptUse } from '@ytcreator/core'
import type { ScriptView } from '@ytcreator/core/api'
import { AiWorking, Button, ErrorMessage, Stepper } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, scriptsApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { DraftStep } from './DraftStep.tsx'
import { FactsStep } from './FactsStep.tsx'
import { History } from './History.tsx'
import { OutlineStep } from './OutlineStep.tsx'
import { ReviewStep } from './ReviewStep.tsx'
import { ScriptWarnings } from './ScriptWarnings.tsx'
import { useScriptAi } from './useScriptAi.ts'

const text = scriptEs.screen

export type ScriptStep = 'hechos' | 'escaleta' | 'guion' | 'revisar'

const KIND_OF = { hechos: 'hechos', escaleta: 'escaleta', guion: 'guion', revisar: 'guion' } as const

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

// A step opens once there is something in it.
export function isReachable(script: ScriptView, step: ScriptStep): boolean {
  switch (step) {
    case 'hechos':
      return true
    case 'escaleta':
      return script.outline !== null
    case 'guion':
      return script.draft !== null
    case 'revisar':
      return script.draft !== null
  }
}

const isConflict = (error: unknown) => error instanceof ApiClientError && error.body?.code === 'version_cambiada'

export function ScriptScreen({ id }: { readonly id: string }) {
  const [script, setScript] = useState<ScriptView | null>(null)
  const [step, setStep] = useState<ScriptStep | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [targetBlock, setTargetBlock] = useState<string | null>(null)
  const [editingBlock, setEditingBlock] = useState(false)
  const [nothingFound, setNothingFound] = useState(false)
  const shown = useRef(script)
  shown.current = script

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const loaded = await scriptsApi.get(id, { signal })
        setScript(loaded)
        setStep((current) => current ?? stepFor(loaded))
        setLoadFailed(false)
        setError(null)
        return loaded
      } catch (cause) {
        if (signal?.aborted) return undefined
        setError(cause)
        setLoadFailed(true)
        return undefined
      }
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const onFinished = useCallback(
    (op: string, ok: boolean) => {
      // A failure stays where it can be retried, and the step opens with what it has to show.
      const factsBefore = shown.current?.facts?.version ?? 0
      void load().then((loaded) => {
        // A search that found nothing reliable leaves the list as it was, and that has to be said (spec, Edge Cases).
        setNothingFound(
          ok && op === 'investigacion' && loaded !== undefined && (loaded.facts?.version ?? 0) === factsBefore,
        )
        if (ok && op === 'escaleta') setStep('escaleta')
        if (ok && (op === 'guion' || op === 'guion_short')) setStep('guion')
      })
    },
    [load],
  )
  const ai = useScriptAi(script, onFinished, setError)
  const { dismiss } = ai
  const onChange = useCallback(
    (changed: ScriptView) => {
      setScript(changed)
      setError(null)
      setNothingFound(false)
      dismiss()
    },
    [dismiss],
  )

  if (!script || !step) {
    return (
      <Screen title={scriptEs.list.title}>
        {loadFailed ? (
          <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
        ) : (
          <p role="status">{text.loading}</p>
        )}
      </Screen>
    )
  }

  const steps = stepsOf(script)
  return (
    <Screen
      title={script.idea.title}
      before={
        <Stepper
          steps={steps.map((one) => ({ id: one, label: text.steps[one] }))}
          current={steps.indexOf(step) + 1}
          aria-label={text.progress}
        />
      }
    >
      <nav aria-label={text.navigation} className={styles.actions}>
        {steps
          .filter((one) => isReachable(script, one))
          .map((one) => (
            <Button
              key={one}
              variant="ghost"
              size="sm"
              aria-current={one === step ? 'step' : undefined}
              disabled={editingBlock && one !== step}
              onClick={() => setStep(one)}
            >
              {text.steps[one]}
            </Button>
          ))}
      </nav>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          description={isConflict(error) ? text.reloadNote : undefined}
          action={{ label: text.reload, onClick: () => void load() }}
        />
      )}
      {ai.priceChanged && (
        <p role="status" className={styles.notice}>
          {text.priceChanged}
        </p>
      )}
      {ai.otherFailure && (
        <ErrorMessage live title={text.jobFailed} action={{ label: text.understood, onClick: ai.dismiss }} />
      )}
      {ai.working && <AiWorking variant="panel" label={scriptEs.uses[ai.working as ScriptUse]} />}
      <ScriptWarnings script={script} ai={ai} onStep={setStep} />
      {step === 'hechos' && (
        <FactsStep
          script={script}
          ai={ai}
          nothingFound={nothingFound}
          onChange={onChange}
          onError={setError}
          onToDraft={() => setStep('guion')}
        />
      )}
      {step === 'escaleta' && (
        <OutlineStep
          script={script}
          ai={ai}
          onChange={onChange}
          onError={setError}
          onToFacts={() => setStep('hechos')}
          onToDraft={() => setStep('guion')}
          onEditing={setEditingBlock}
        />
      )}
      {step === 'guion' && (
        <DraftStep
          script={script}
          ai={ai}
          onChange={onChange}
          onError={setError}
          onToOutline={() => setStep('escaleta')}
          onToReview={() => setStep('revisar')}
          targetBlock={targetBlock}
          onTargetReached={() => setTargetBlock(null)}
          onEditing={setEditingBlock}
        />
      )}
      {step === 'revisar' && (
        <ReviewStep
          script={script}
          onChange={onChange}
          onError={setError}
          busy={ai.working !== null}
          onToBlock={(blockId) => {
            setTargetBlock(blockId)
            setStep('guion')
          }}
          onToDraft={() => setStep('guion')}
        />
      )}
      <History
        key={KIND_OF[step]}
        script={script}
        kind={KIND_OF[step]}
        busy={editingBlock || ai.working !== null}
        onChange={onChange}
        onError={setError}
      />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'scriptList' })}>
          {text.backToList}
        </Button>
      </div>
    </Screen>
  )
}
