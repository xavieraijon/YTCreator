import type { PackageWarning } from '@ytcreator/core'
import type { PackageView } from '@ytcreator/core/api'
import { AiWorking, Button, ErrorMessage, Stepper } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, packagesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { CoverStep } from './CoverStep.tsx'
import { usePackageAi } from './usePackageAi.ts'

const text = publishEs.screen
// The texts that say the same as in the script (005): a job that failed, a price that moved, another tab.
const shared = scriptEs.screen

export type PackageScreenStep = 'portada' | 'textos' | 'revisar'
export const PACKAGE_SCREEN_STEPS: readonly PackageScreenStep[] = ['portada', 'textos', 'revisar']

// Where the package was left (contracts/ui-screens.md).
export function stepFor(pkg: PackageView): PackageScreenStep {
  switch (pkg.status) {
    case 'sin_empezar':
    case 'portada_borrador':
      return 'portada'
    case 'portada_aprobada':
    case 'textos_borrador':
      return 'textos'
    case 'textos_aprobados':
    case 'aprobado':
      return 'revisar'
  }
}

const labelOf = (pkg: PackageView, step: PackageScreenStep) =>
  step === 'portada' && pkg.format === 'short' ? text.steps.portadaShort : text.steps[step]

// The warnings that are fixed in the script (005).
const SCRIPT_WARNINGS: readonly PackageWarning[] = ['guion_cambiado', 'guion_sin_aprobar', 'pendientes_en_guion']

const isConflict = (error: unknown) => error instanceof ApiClientError && error.body?.code === 'version_cambiada'

// The package of one video: title and thumbnail, description, and review and copy.
export function PackageScreen({ id }: { readonly id: string }) {
  const [pkg, setPkg] = useState<PackageView | null>(null)
  const [step, setStep] = useState<PackageScreenStep | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const loaded = await packagesApi.get(id, { signal })
        setPkg(loaded)
        setStep((current) => current ?? stepFor(loaded))
        setError(null)
        setLoadFailed(false)
      } catch (cause) {
        if (signal?.aborted) return
        setError(cause)
        setLoadFailed(true)
      }
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const onFinished = useCallback(() => void load(), [load])
  const ai = usePackageAi(pkg, onFinished, setError)
  const { dismiss } = ai
  const onChange = useCallback(
    (changed: PackageView) => {
      setPkg(changed)
      setError(null)
      dismiss()
    },
    [dismiss],
  )

  if (!pkg || !step) {
    return (
      <Screen title={publishEs.list.title}>
        {loadFailed ? (
          <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
        ) : (
          <p role="status">{text.loading}</p>
        )}
      </Screen>
    )
  }

  const reached = PACKAGE_SCREEN_STEPS.indexOf(stepFor(pkg))
  return (
    <Screen
      title={pkg.idea.title}
      before={
        <Stepper
          steps={PACKAGE_SCREEN_STEPS.map((one) => ({ id: one, label: labelOf(pkg, one) }))}
          // Where the package has got to, not the step on screen (as in the script).
          current={reached + 1}
          aria-label={text.progress}
        />
      }
    >
      <nav aria-label={text.navigation} className={styles.actions}>
        {PACKAGE_SCREEN_STEPS.filter((_, index) => index <= reached).map((one) => (
          <Button
            key={one}
            variant="ghost"
            size="sm"
            aria-current={one === step ? 'step' : undefined}
            onClick={() => setStep(one)}
          >
            {labelOf(pkg, one)}
          </Button>
        ))}
      </nav>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          description={isConflict(error) ? shared.reloadNote : undefined}
          action={{ label: shared.reload, onClick: () => void load() }}
        />
      )}
      {ai.priceChanged && (
        <p role="status" className={styles.notice}>
          {shared.priceChanged}
        </p>
      )}
      {ai.otherFailure && (
        <ErrorMessage live title={shared.jobFailed} action={{ label: shared.understood, onClick: ai.dismiss }} />
      )}
      {pkg.warnings.length > 0 && (
        <ul className={styles.options} aria-label={text.warningsLabel}>
          {pkg.warnings.map((warning) => (
            <li key={warning} className={styles.notice}>
              {text.warnings[warning]}{' '}
              {SCRIPT_WARNINGS.includes(warning) && (
                <Button variant="secondary" size="sm" onClick={() => navigate({ page: 'script', id: pkg.scriptId })}>
                  {text.toScript}
                </Button>
              )}
              {warning === 'titulo_cambiado' && step !== 'portada' && (
                <Button variant="secondary" size="sm" onClick={() => setStep('portada')}>
                  {text.toThumbnails}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ai.working && <AiWorking variant="panel" label={publishEs.uses[ai.working]} />}
      {step === 'portada' && (
        <CoverStep pkg={pkg} ai={ai} onChange={onChange} onError={setError} onNext={() => setStep('textos')} />
      )}
      {step === 'textos' && (
        <>
          <h2>{labelOf(pkg, step)}</h2>
          <p className={styles.why}>{text.why.textos}</p>
          <p className={styles.notice}>{text.textsLater}</p>
        </>
      )}
      {step === 'revisar' && (
        <>
          <h2>{labelOf(pkg, step)}</h2>
          <p className={styles.why}>{text.why.revisar}</p>
          <p className={styles.notice}>{text.reviewLater}</p>
        </>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'packageList' })}>
          {text.back}
        </Button>
      </div>
    </Screen>
  )
}
