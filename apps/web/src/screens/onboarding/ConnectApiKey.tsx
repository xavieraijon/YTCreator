import type { AiFailure, ConnectionKind } from '@ytcreator/core'
import { connectionViewSchema } from '@ytcreator/core/api'
import { ErrorMessage, format, IconButton, TextField } from '@ytcreator/ui'
import { Eye, EyeOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { reloadAi, useAiOverview } from '../../ai/useAiOverview.ts'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { links } from '../../links.ts'
import { AiFailureMessage } from '../../shell/AiFailureMessage.tsx'
import { AiWorkStatus, useAiWork } from '../../shell/AiWork.tsx'
import { errorText, failureOf, wasCancelled } from '../../shell/errorText.ts'
import { ExternalLink } from '../../shell/ExternalLink.tsx'
import { es } from '../../strings/es.ts'
import type { FailureActionId } from '../../strings/failures.es.ts'
import styles from './onboarding.module.css'
import { useWizardStep, WizardShell } from './WizardShell.tsx'

// FR-017, FR-019: the key is checked for free before it is kept; afterwards only its last 4 characters come back.
export function ConnectApiKey({ chosenKind }: { chosenKind: ConnectionKind | null }) {
  const overview = useAiOverview()
  const stored = overview?.connections.find((c) => c.kind === 'pago_por_uso' && c.status === 'conectada')
  const [key, setKey] = useState('')
  const [shown, setShown] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failure, setFailure] = useState<AiFailure | null>(null)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const { work, run, cancel } = useAiWork()
  const step = useWizardStep()
  const savedHint = hint ?? stored?.hint ?? null

  const save = async () => {
    setFieldError(null)
    setFailure(null)
    setError(null)
    try {
      const view = await run(es.keyForm.checking, (signal) =>
        apiClient.put('/api/ai/connections/pago_por_uso/credential', { key }, connectionViewSchema, { signal }),
      )
      setKey('')
      setHint(view.hint ?? '')
      void reloadAi()
    } catch (caught) {
      if (wasCancelled(caught)) return
      const code = caught instanceof ApiClientError ? caught.body?.fields?.key : undefined
      const aiFailure = failureOf(caught)
      if (code) setFieldError(es.field[code])
      else if (aiFailure) setFailure(aiFailure)
      else setError(errorText(caught))
    }
  }

  const onFailureAction = (id: FailureActionId) => {
    if (id === 'elegir_otra_opcion' || id === 'cambiar_de_opcion') void step.send('volver')
    else if (id === 'comprobar') void save()
    else field.current?.focus()
  }

  return (
    <WizardShell
      step="conectar"
      title={es.connectApiKey.title}
      chosenKind={chosenKind}
      later
      stepError={step.error}
      primary={
        savedHint !== null
          ? { label: es.keyForm.continue, onClick: () => void step.send('continuar'), loading: !!step.pending }
          : { label: es.keyForm.save, onClick: () => void save(), loading: !!work }
      }
    >
      <p className={styles.text}>{es.connectApiKey.why}</p>
      <div className={styles.links}>
        <ExternalLink className={styles.link} href={links.anthropicKeys}>
          {es.connectApiKey.getKey}
        </ExternalLink>
      </div>
      <p className={styles.text}>
        {es.connectApiKey.balanceNotice}{' '}
        <ExternalLink className={styles.link} href={links.anthropicBilling}>
          {es.connectApiKey.balanceLink}
        </ExternalLink>
      </p>
      {savedHint !== null ? (
        <p role="status">{format(es.keyForm.saved, { pista: savedHint })}</p>
      ) : (
        <form
          className={styles.keyRow}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <TextField
            ref={field}
            label={es.keyForm.label}
            type={shown ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            error={fieldError ?? undefined}
          />
          <IconButton
            type="button"
            variant="ghost"
            icon={shown ? EyeOff : Eye}
            label={shown ? es.keyForm.hide : es.keyForm.show}
            onClick={() => setShown(!shown)}
          />
        </form>
      )}
      <AiWorkStatus work={work} onCancel={cancel} />
      {failure && <AiFailureMessage failure={failure} onAction={onFailureAction} />}
      {error && <ErrorMessage live title={error} action={{ label: es.app.retry, onClick: () => void save() }} />}
    </WizardShell>
  )
}
