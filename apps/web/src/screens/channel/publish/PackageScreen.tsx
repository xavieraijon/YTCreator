import type { PackageView } from '@ytcreator/core/api'
import { Button, ErrorMessage, Stepper } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { packagesApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import styles from '../channel.module.css'

const text = publishEs.screen

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

// The package of one video: title and thumbnail, description, and review and copy.
export function PackageScreen({ id }: { readonly id: string }) {
  const [pkg, setPkg] = useState<PackageView | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setPkg(await packagesApi.get(id, { signal }))
        setError(null)
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

  if (!pkg) {
    return (
      <Screen title={publishEs.list.title}>
        {error !== null ? (
          <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
        ) : (
          <p role="status">{es.app.loading}</p>
        )}
      </Screen>
    )
  }

  const step = stepFor(pkg)
  return (
    <Screen
      title={pkg.idea.title}
      before={
        <Stepper
          steps={PACKAGE_SCREEN_STEPS.map((one) => ({ id: one, label: labelOf(pkg, one) }))}
          current={PACKAGE_SCREEN_STEPS.indexOf(step) + 1}
          aria-label={text.progress}
        />
      }
    >
      <h2>{labelOf(pkg, step)}</h2>
      <p className={styles.why}>{text.why[step]}</p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'packageList' })}>
          {text.back}
        </Button>
      </div>
    </Screen>
  )
}
