import type { PackagePart } from '@ytcreator/core'
import type { PackageView } from '@ytcreator/core/api'
import { Disclosure, ErrorMessage, format, TextArea } from '@ytcreator/ui'
import { PUBLISH_LIMITS } from '@ytcreator/core'
import { useState } from 'react'
import { errorText } from '../../../shell/errorText.ts'
import { es } from '../../../strings/es.ts'
import { publishEs } from '../../../strings/publish.es.ts'
import styles from '../channel.module.css'
import { AiAction } from '../Proposal.tsx'
import { type PackageAi, type PackageOp, partOp, usePackageEstimate } from './usePackageAi.ts'

const text = publishEs.texts

export interface AskAgainProps {
  readonly pkg: PackageView
  readonly ai: PackageAi
  readonly part: PackagePart
  readonly disabled: boolean
  readonly onAsk: (op: PackageOp, price: ReturnType<typeof usePackageEstimate>, instructions: string) => void
}

// «Pedir de nuevo · {coste}» for one part, with what to change: only that part is written again (SC-005).
export function AskAgain({ pkg, ai, part, disabled, onAsk }: AskAgainProps) {
  const op = partOp(part)
  const failure = ai.failureFor(op)
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const shown = open || failure !== null
  const price = usePackageEstimate(pkg, op, shown && !disabled)
  const label = format(text.askAgain, { parte: publishEs.parts[part] })
  return (
    <Disclosure summary={label} open={shown} onOpenChange={setOpen}>
      <p className={styles.why}>{text.askAgainHint}</p>
      {price.error !== null && (
        <ErrorMessage live title={errorText(price.error)} action={{ label: es.app.retry, onClick: price.retry }} />
      )}
      <TextArea
        label={format(text.instructionsFor, { parte: publishEs.parts[part] })}
        description={publishEs.cover.instructionsHint}
        value={instructions}
        maxLength={PUBLISH_LIMITS.instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <AiAction
        label={label}
        estimate={price.estimate}
        failure={failure}
        busy={ai.working === op}
        primary={false}
        disabled={disabled}
        onRun={() => onAsk(op, price, instructions)}
      />
    </Disclosure>
  )
}
