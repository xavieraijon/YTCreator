import type { IdeaVerdict, ScriptWarning } from '@ytcreator/core'
import type { ScriptView } from '@ytcreator/core/api'
import { Button, DataSource, Dialog, Semaphore } from '@ytcreator/ui'
import { useState } from 'react'
import { navigate } from '../../../router.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import { scriptEs } from '../../../strings/script.es.ts'
import styles from '../channel.module.css'
import { VERDICT_STATE } from '../ideas/IdeaMeasure.tsx'
import { AiAction } from '../Proposal.tsx'
import type { ScriptStep } from './ScriptScreen.tsx'
import { type ScriptAi, useEstimate } from './useScriptAi.ts'

const text = scriptEs.warnings
const RISKY: readonly IdeaVerdict[] = ['quemado', 'competido']

// Nothing here stops anything: it says what moved since this was written, where to go, and what redoing it costs
// (data-model.md, «Avisos»; spec, Edge Cases).
export function ScriptWarnings({
  script,
  ai,
  onStep,
}: {
  readonly script: ScriptView
  readonly ai: ScriptAi
  readonly onStep: (step: ScriptStep) => void
}) {
  const { verdict, verdictAt } = script.idea
  const risky = verdict !== null && RISKY.includes(verdict)
  const isShort = script.format === 'short'
  const draftUse = isShort ? ('guion_short' as const) : ('guion' as const)
  const redoUse = script.draft ? draftUse : ('escaleta' as const)
  const outlineApproved = script.outline !== null && script.outlineApprovedVersion === script.outline.version
  // Writing the Short again takes the moment as the long script says it now, which clears `origen_cambiado` too,
  // unless that moment is gone (decision 44).
  const moved = script.warnings.some(
    (warning) => warning !== 'origen_cambiado' || script.links.parent?.momentGone === false,
  )
  const canRedo = moved && (isShort ? script.draft !== null : script.draft ? outlineApproved : script.outline !== null)
  const price = useEstimate(script, redoUse, canRedo)
  // Redoing replaces all of it, hand-written words included: asked first (novice audit, round 4, decision 52).
  const [confirming, setConfirming] = useState(false)

  if (script.warnings.length === 0 && !risky) return null

  const actions: Record<ScriptWarning, { readonly label: string; readonly run: () => void } | null> = {
    idea_cambiada: { label: text.toBank, run: () => navigate({ page: 'ideaBank' }) },
    perfil_cambiado: { label: text.toProfile, run: () => navigate({ page: 'channelStart' }) },
    hechos_cambiados: { label: text.toFacts, run: () => onStep('hechos') },
    escaleta_cambiada: { label: text.toOutline, run: () => onStep('escaleta') },
    origen_cambiado: script.links.parent
      ? { label: text.toSource, run: () => navigate({ page: 'script', id: script.links.parent!.id }) }
      : null,
  }

  return (
    <section aria-label={text.title} className={styles.options}>
      {risky && (
        <p>
          <Semaphore state={VERDICT_STATE[verdict]}>{ideasEs.measure.verdict[verdict]}</Semaphore> {text.verdict}{' '}
          {verdictAt && <DataSource kind="youtube" date={verdictAt} />}
        </p>
      )}
      {script.warnings.map((warning) => {
        const action = actions[warning]
        return (
          <p key={warning} className={styles.notice}>
            {text.kinds[warning]}{' '}
            {action && (
              <Button variant="ghost" size="sm" onClick={action.run}>
                {action.label}
              </Button>
            )}
          </p>
        )
      })}
      {canRedo && (
        <>
          {script.status === 'guion_aprobado' && <p className={styles.notice}>{text.redoDraftNote}</p>}
          <AiAction
            label={script.draft ? text.redoDraft : text.redoOutline}
            primary={false}
            estimate={price.estimate}
            busy={ai.working === redoUse}
            disabled={ai.working !== null}
            onRun={() => setConfirming(true)}
          />
          <Dialog
            open={confirming}
            onOpenChange={setConfirming}
            title={script.draft ? text.redoDraftTitle : text.redoOutlineTitle}
            description={script.status === 'guion_aprobado' ? `${text.redoBody} ${text.redoDraftNote}` : text.redoBody}
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {text.cancel}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirming(false)
                    void ai.run(redoUse, price)
                  }}
                >
                  {script.draft ? text.redoDraft : text.redoOutline}
                </Button>
              </>
            }
          />
        </>
      )}
    </section>
  )
}
