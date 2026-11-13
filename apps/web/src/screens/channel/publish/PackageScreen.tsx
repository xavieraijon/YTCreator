import type { PackageKind, PackageWarning } from '@ytcreator/core'
import type { PackageView } from '@ytcreator/core/api'
import { AiWorking, Button, Dialog, ErrorMessage, format, Stepper } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, packagesApi } from '../../../api/client.ts'
import { navigate, useLeaveGuard } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { pieceAnchor } from './anchors.ts'
import { CoverStep } from './CoverStep.tsx'
import { DescriptionStep } from './DescriptionStep.tsx'
import { ReviewCopyStep } from './ReviewCopyStep.tsx'
import { type PackageOp, usePackageAi } from './usePackageAi.ts'

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
// Fixed in the script: the warning takes the creator there (the sources too, decision 110).
const SCRIPT_WARNINGS: readonly PackageWarning[] = [
  'guion_cambiado',
  'guion_sin_aprobar',
  'pendientes_en_guion',
  'sin_fuentes',
]

// What the AI is doing, said for people: a part asked for again says which one.
const workingLabel = (op: PackageOp) => {
  const [use, part] = op.split(':') as [keyof typeof publishEs.uses, keyof typeof publishEs.parts | undefined]
  return part ? format(publishEs.uses.parte_paquete, { parte: publishEs.parts[part] }) : publishEs.uses[use]
}

const isConflict = (error: unknown) => error instanceof ApiClientError && error.body?.code === 'version_cambiada'

// The package of one video: title and thumbnail, description, and review and copy.
export function PackageScreen({ id }: { readonly id: string }) {
  const [pkg, setPkg] = useState<PackageView | null>(null)
  const [step, setStep] = useState<PackageScreenStep | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // Where the creator wanted to go from an approved package, until they say to go on (FR-015, scenario 4).
  const [leaving, setLeaving] = useState<PackageScreenStep | null>(null)
  // Something written in a step and not saved yet: going to another step or leaving asks first (novice audit 006, G1).
  const [dirty, setDirty] = useState(false)
  // The package's own warnings, at the top: «Revisar los avisos» takes the creator there first (decision 103).
  const warningsList = useRef<HTMLUListElement>(null)
  // A new step starts at its top, where its warnings and its heading are; not where the last one was left (decision
  // 107). From «Corregirlo», at the piece to fix instead (decision 109).
  const shownStep = useRef<PackageScreenStep | null>(null)
  const toPiece = useRef<PackageKind | null>(null)
  useLeaveGuard(dirty ? text.leaveUnsaved : null)

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

  useEffect(() => {
    // Only on going to another step: the first one shown opens as the page does.
    if (step !== null && shownStep.current !== null && shownStep.current !== step) {
      const piece = toPiece.current ? document.getElementById(pieceAnchor(toPiece.current)) : null
      if (piece) {
        piece.scrollIntoView({ block: 'center' })
        piece.focus()
      } else window.scrollTo({ top: 0 })
    }
    toPiece.current = null
    shownStep.current = step
  }, [step])

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

  // In an approved package, going where things change asks first: changing anything takes it back to draft.
  const goTo = (next: PackageScreenStep, piece: PackageKind | null = null) => {
    if (next !== step && dirty && !window.confirm(text.leaveUnsaved)) return
    toPiece.current = piece
    if (pkg.status === 'aprobado' && step === 'revisar' && next !== 'revisar') setLeaving(next)
    else setStep(next)
  }

  const reached = PACKAGE_SCREEN_STEPS.indexOf(stepFor(pkg))
  // Which pieces were made for another main title, so that the warning leads to them (R16).
  const titles = pkg.pieces.titulos?.content
  const mainText = titles?.candidates.find((one) => one.id === titles.main)?.text ?? null
  const stale = (piece: { mainTitle: string | null } | null) =>
    piece !== null && piece.mainTitle !== null && piece.mainTitle !== mainText
  const staleCover = stale(pkg.pieces.miniaturas) || stale(pkg.pieces.portada_short)
  const staleTexts = stale(pkg.pieces.descripcion)
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
            onClick={() => goTo(one)}
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
        <ul ref={warningsList} tabIndex={-1} className={styles.options} aria-label={text.warningsLabel}>
          {pkg.warnings.map((warning) => (
            <li key={warning} className={styles.notice}>
              {text.warnings[warning]}{' '}
              {SCRIPT_WARNINGS.includes(warning) && (
                <Button variant="secondary" size="sm" onClick={() => navigate({ page: 'script', id: pkg.scriptId })}>
                  {text.toScript}
                </Button>
              )}
              {warning === 'titulo_cambiado' && staleCover && step !== 'portada' && (
                <Button variant="secondary" size="sm" onClick={() => goTo('portada')}>
                  {text.toThumbnails}
                </Button>
              )}
              {((warning === 'titulo_cambiado' && staleTexts) || warning === 'parte_fija_cambiada') &&
                step !== 'textos' && (
                  <Button variant="secondary" size="sm" onClick={() => goTo('textos')}>
                    {text.toDescription}
                  </Button>
                )}
            </li>
          ))}
        </ul>
      )}
      {/* Said before any change, not after: editing takes the approved package back to draft (FR-015). */}
      {pkg.status === 'aprobado' && step !== 'revisar' && (
        <p role="status" className={styles.notice}>
          {text.approvedEditing}
        </p>
      )}
      {ai.working && <AiWorking variant="panel" label={workingLabel(ai.working)} />}
      {step === 'portada' && (
        <CoverStep
          pkg={pkg}
          ai={ai}
          onChange={onChange}
          onError={setError}
          onDirty={setDirty}
          onNext={() => goTo('textos')}
        />
      )}
      {step === 'textos' && (
        <DescriptionStep
          pkg={pkg}
          ai={ai}
          onChange={onChange}
          onError={setError}
          onDirty={setDirty}
          onNext={() => goTo('revisar')}
        />
      )}
      {step === 'revisar' && (
        <ReviewCopyStep
          pkg={pkg}
          onChange={onChange}
          onError={setError}
          onToStep={goTo}
          busy={ai.working !== null}
          warningsList={warningsList}
        />
      )}
      <Dialog
        open={leaving !== null}
        onOpenChange={(open) => !open && setLeaving(null)}
        size="sm"
        title={publishEs.unapprove.title}
        description={publishEs.unapprove.body}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                toPiece.current = null
                setLeaving(null)
              }}
            >
              {publishEs.unapprove.stay}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setStep(leaving)
                setLeaving(null)
              }}
            >
              {publishEs.unapprove.go}
            </Button>
          </>
        }
      />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate({ page: 'packageList' })}>
          {text.back}
        </Button>
      </div>
    </Screen>
  )
}
