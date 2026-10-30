import { MAX_ACCOUNTS, type AiFailure, type ConnectionKind } from '@ytcreator/core'
import { accountViewSchema, loginStartSchema, repairStateSchema } from '@ytcreator/core/api'
import { Button, Card, ErrorMessage, format } from '@ytcreator/ui'
import { useEffect, useRef, useState } from 'react'
import { reloadAi, useAiOverview } from '../../ai/useAiOverview.ts'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { openPendingTab } from '../../links.ts'
import { AiFailureMessage } from '../../shell/AiFailureMessage.tsx'
import { AiWorkStatus, useAiWork } from '../../shell/AiWork.tsx'
import { errorText, failureOf, wasCancelled } from '../../shell/errorText.ts'
import { StatusLine } from '../../shell/StatusLine.tsx'
import { statusText } from '../../shell/statusText.ts'
import { es } from '../../strings/es.ts'
import type { FailureActionId } from '../../strings/failures.es.ts'
import styles from './onboarding.module.css'
import { ConnectShell, type OutsideWizard } from './ConnectShell.tsx'
import { LoginCodeForm } from './LoginCodeForm.tsx'
import { useWizardStep } from './WizardShell.tsx'

interface Login {
  readonly id: string
  readonly url: string
}

const NOT_INSTALLED: AiFailure = { kind: 'no_disponible', reason: 'programa_no_instalado' }

// FR-014..FR-016: the creator signs in on Claude's page and pastes the code back; never a password here.
export function ConnectSubscription({
  chosenKind,
  outside,
}: {
  chosenKind: ConnectionKind | null
  outside?: OutsideWizard
}) {
  const overview = useAiOverview()
  const accounts = overview?.accounts ?? []
  const [adding, setAdding] = useState(false)
  const [login, setLogin] = useState<Login | null>(null)
  const [code, setCode] = useState('')
  const [starting, setStarting] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [failure, setFailure] = useState<AiFailure | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { work, run, cancel } = useAiWork()
  const step = useWizardStep()

  // A login left half-way is cancelled on the server, so its code stops working.
  const openLogin = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (openLogin.current)
        void apiClient.delete(`/api/ai/subscription/login/${openLogin.current}`).catch(() => undefined)
    },
    [],
  )

  const clearMessages = () => {
    setFailure(null)
    setDuplicate(false)
    setError(null)
  }

  const show = (caught: unknown) => {
    const aiFailure = failureOf(caught)
    if (aiFailure) setFailure(aiFailure)
    else if (caught instanceof ApiClientError && caught.body?.code === 'conflicto') {
      // Back to the list: the account is already there.
      setDuplicate(true)
      setAdding(false)
    } else setError(errorText(caught))
  }

  const openPage = async () => {
    clearMessages()
    setStarting(true)
    const tab = openPendingTab()
    try {
      const started = await apiClient.post('/api/ai/subscription/login', {}, loginStartSchema)
      openLogin.current = started.loginId
      setLogin({ id: started.loginId, url: started.url })
      setCode('')
      tab.go(started.url)
    } catch (caught) {
      tab.close()
      show(caught)
    } finally {
      setStarting(false)
    }
  }

  const connect = async () => {
    if (!login) return
    clearMessages()
    try {
      await run(es.connectSubscription.connecting, (signal) =>
        apiClient.post(`/api/ai/subscription/login/${login.id}/complete`, { code }, accountViewSchema, { signal }),
      )
      openLogin.current = null
      setLogin(null)
      setAdding(false)
      void reloadAi()
    } catch (caught) {
      if (wasCancelled(caught)) return
      // The server has closed this login whatever happened: a new code needs a new link.
      openLogin.current = null
      setLogin(null)
      show(caught)
    }
  }

  const repair = async () => {
    clearMessages()
    setRepairing(true)
    try {
      await apiClient.post('/api/ai/repair-claude-code', {}, repairStateSchema)
      void reloadAi()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setRepairing(false)
    }
  }

  const back = () => (outside ? outside.back() : void step.send('volver'))

  const onFailureAction = (id: FailureActionId) => {
    if (id === 'pedir_enlace' || id === 'volver_a_conectar' || id === 'anadir_cuenta') void openPage()
    else if (id === 'elegir_otra_opcion' || id === 'cambiar_de_opcion') back()
    else if (id === 'reparar') void repair()
    else if (id === 'comprobar') void reloadAi()
  }

  const installed = overview?.claudeCode.installed ?? true
  const showAccounts = accounts.length > 0 && !adding && !login
  const anyConnected = accounts.some((a) => a.status === 'conectada')
  const firstFailing = accounts.find((a) => a.status !== 'conectada' && a.status !== 'sin_comprobar' && a.reason)

  const primary = !installed
    ? undefined
    : login
      ? { label: es.connectSubscription.connect, onClick: () => void connect(), loading: !!work }
      : showAccounts
        ? anyConnected
          ? (outside?.finish ?? {
              label: es.connectSubscription.continue,
              onClick: () => void step.send('continuar'),
              loading: !!step.pending,
            })
          : undefined
        : failure
          ? undefined
          : { label: es.connectSubscription.openPage, onClick: () => void openPage(), loading: starting }

  return (
    <ConnectShell
      title={es.connectSubscription.title}
      chosenKind={chosenKind}
      outside={outside}
      stepError={step.error}
      primary={primary}
    >
      <p className={styles.text}>{es.connectSubscription.why}</p>

      {!installed ? (
        <>
          <AiFailureMessage failure={NOT_INSTALLED} onAction={onFailureAction} />
          {repairing && <p role="status">{es.connectSubscription.repairing}</p>}
        </>
      ) : showAccounts ? (
        <>
          <ul className={styles.accounts}>
            {accounts.map((account) => (
              <li key={account.id}>
                <Card>
                  <StatusLine
                    view={account}
                    text={format(es.connectSubscription.account, {
                      nombre: account.label,
                      estado: statusText(account),
                    })}
                  />
                </Card>
              </li>
            ))}
          </ul>
          {duplicate ? null : accounts.length < MAX_ACCOUNTS ? (
            <div className={styles.stack}>
              <div>
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  {es.connectSubscription.addAccount}
                </Button>
              </div>
              <p className={styles.text}>{es.connectSubscription.addAccountWhy}</p>
            </div>
          ) : (
            <p className={styles.text}>{es.guard.maximo_de_cuentas}</p>
          )}
          <p className={styles.text}>{es.connectSubscription.sameAccountNote}</p>
          {!anyConnected && firstFailing?.reason && (
            <AiFailureMessage
              failure={
                { kind: firstFailing.status, reason: firstFailing.reason, resetsAt: firstFailing.resetsAt } as AiFailure
              }
              onAction={onFailureAction}
              hide={['anadir_cuenta']}
            />
          )}
        </>
      ) : login ? (
        <LoginCodeForm
          url={login.url}
          code={code}
          onCodeChange={setCode}
          onSubmit={() => void connect()}
          onNewLink={() => void openPage()}
          starting={starting}
        />
      ) : (
        <ol className={styles.steps}>
          <li>{es.connectSubscription.steps.open}</li>
          <li>{es.connectSubscription.steps.approve}</li>
          <li>{es.connectSubscription.steps.copy}</li>
        </ol>
      )}

      <AiWorkStatus work={work} onCancel={cancel} />
      {failure && <AiFailureMessage failure={failure} onAction={onFailureAction} />}
      {duplicate && (
        <ErrorMessage
          live
          title={es.connectSubscription.duplicate}
          action={{ label: es.connectSubscription.addAccount, onClick: () => void openPage() }}
        />
      )}
      {error && <ErrorMessage live title={error} action={{ label: es.app.retry, onClick: clearMessages }} />}
    </ConnectShell>
  )
}
