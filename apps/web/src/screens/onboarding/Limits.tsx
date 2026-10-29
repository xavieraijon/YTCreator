import type { ConnectionKind } from '@ytcreator/core'
import { es } from '../../strings/es.ts'
import { WizardShell } from './WizardShell.tsx'

// The spending limits arrive with US3; until then the step only lets the creator go back or postpone.
export function Limits({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  return <WizardShell step="limites" title={es.limits.title} chosenKind={chosenKind} />
}
