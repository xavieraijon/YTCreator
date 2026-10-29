import type { AiFailure } from '@ytcreator/core'
import { Button, ErrorMessage, format } from '@ytcreator/ui'
import { links, openExternal } from '../links.ts'
import type { FailureAction, FailureActionId } from '../strings/failures.es.ts'
import styles from './AiFailureMessage.module.css'
import { failureText, formatDate } from './statusText.ts'

// The actions that are only a page of Anthropic: the message opens them itself.
const EXTERNAL: Partial<Record<FailureActionId, string>> = {
  conseguir_clave: links.anthropicKeys,
  abrir_consola: links.anthropicConsole,
  anadir_saldo: links.anthropicBilling,
}

export interface AiFailureMessageProps {
  readonly failure: AiFailure
  /** The rest of the actions: the screen decides what each one does. */
  readonly onAction: (id: FailureActionId) => void
  /** Actions that make no sense on this screen; the first one left is the main one. */
  readonly hide?: readonly FailureActionId[]
}

// What happened, what to do and the button to do it (FR-027). Never a blind «Reintentar».
export function AiFailureMessage({ failure, onAction, hide = [] }: AiFailureMessageProps) {
  const text = failureText(failure)
  const what =
    failure.resetsAt && text.whatUntil ? format(text.whatUntil, { fecha: formatDate(failure.resetsAt) }) : text.what
  const run = (action: FailureAction) => {
    const url = EXTERNAL[action.id]
    if (url) openExternal(url)
    else onAction(action.id)
  }
  const actions = text.actions.filter((action) => !hide.includes(action.id))
  const [main, ...others] = actions.length ? actions : [{ id: 'comprobar', label: 'Comprobar ahora' } as const]

  return (
    <div className={styles.failure}>
      <ErrorMessage
        live
        title={what}
        description={text.todo}
        action={{ label: main.label, onClick: () => run(main) }}
      />
      {others.length > 0 && (
        <div className={styles.others}>
          {others.map((action) => (
            <Button key={action.id} variant="ghost" onClick={() => run(action)}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
