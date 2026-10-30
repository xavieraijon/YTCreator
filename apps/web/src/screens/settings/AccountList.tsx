import { MAX_ACCOUNTS, type AiFailure } from '@ytcreator/core'
import { accountViewSchema, loginStartSchema, type AccountView } from '@ytcreator/core/api'
import { Button, Card, Dialog, ErrorMessage, format, TextField } from '@ytcreator/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reloadAi } from '../../ai/useAiOverview.ts'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { openPendingTab } from '../../links.ts'
import { AiFailureMessage } from '../../shell/AiFailureMessage.tsx'
import { AiWorkStatus, useAiWork } from '../../shell/AiWork.tsx'
import { errorText, failureOf, wasCancelled } from '../../shell/errorText.ts'
import { StatusLine } from '../../shell/StatusLine.tsx'
import { es } from '../../strings/es.ts'
import type { FailureActionId } from '../../strings/failures.es.ts'
import { LoginCodeForm } from '../onboarding/LoginCodeForm.tsx'
import styles from './settings.module.css'

export const ADD_ACCOUNT_ID = 'anadir-cuenta'

// A login in progress: to renew an account (`accountId`) or to add a new one (null).
interface Login {
  readonly id: string
  readonly url: string
  readonly accountId: string | null
}

function AccountRow({
  account,
  first,
  last,
  onMove,
  onLogin,
  login,
}: {
  account: AccountView
  first: boolean
  last: boolean
  onMove: (step: -1 | 1) => void
  onLogin: () => void
  login: ReactNode
}) {
  const [label, setLabel] = useState(account.label)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'check' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setLabel(account.label), [account.label])

  const rename = async () => {
    if (label.trim() === account.label) return
    setLabelError(null)
    try {
      await apiClient.patch(`/api/ai/subscription/accounts/${account.id}`, { label }, accountViewSchema)
      void reloadAi()
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 400) setLabelError(es.field.longitud_no_valida)
      else setError(errorText(caught))
    }
  }

  const check = async () => {
    setError(null)
    setBusy('check')
    try {
      await apiClient.post(`/api/ai/subscription/accounts/${account.id}/check`, {}, accountViewSchema)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(null)
      void reloadAi()
    }
  }

  const remove = async () => {
    setError(null)
    setBusy('remove')
    try {
      await apiClient.delete(`/api/ai/subscription/accounts/${account.id}`)
      setConfirming(false)
      void reloadAi()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card as="li" className={styles.account}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void rename()
        }}
      >
        <TextField
          label={es.aiSettings.accountName}
          value={label}
          maxLength={40}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => void rename()}
          error={labelError ?? undefined}
        />
      </form>
      <StatusLine view={account} />
      <div className={styles.row}>
        <Button variant="secondary" loading={busy === 'check'} onClick={() => void check()}>
          {es.aiSettings.check}
        </Button>
        {account.status === 'sin_sesion' && (
          <Button variant="secondary" onClick={onLogin}>
            {es.aiSettings.reconnect}
          </Button>
        )}
        {/* With a single account there is no order to change. */}
        {!(first && last) && (
          <>
            <Button variant="ghost" disabled={first} onClick={() => onMove(-1)}>
              {es.aiSettings.moveUp}
            </Button>
            <Button variant="ghost" disabled={last} onClick={() => onMove(1)}>
              {es.aiSettings.moveDown}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          {es.aiSettings.remove}
        </Button>
      </div>
      {login}
      {error && <ErrorMessage live title={error} action={{ label: es.app.retry, onClick: () => setError(null) }} />}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        size="sm"
        title={format(es.aiSettings.removeTitle, { nombre: account.label })}
        description={es.aiSettings.removeBody}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {es.aiSettings.cancel}
            </Button>
            <Button variant="danger" loading={busy === 'remove'} onClick={() => void remove()}>
              {es.aiSettings.remove}
            </Button>
          </>
        }
      />
    </Card>
  )
}

// FR-008: the subscription accounts in the order they are used; the first one with quota does the work.
export function AccountList({ accounts }: { accounts: readonly AccountView[] }) {
  const [login, setLogin] = useState<Login | null>(null)
  const [code, setCode] = useState('')
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<AiFailure | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { work, run, cancel } = useAiWork()

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
    setError(null)
  }

  const show = (caught: unknown) => {
    const aiFailure = failureOf(caught)
    if (aiFailure) setFailure(aiFailure)
    else if (caught instanceof ApiClientError && caught.body?.code === 'conflicto')
      setError(es.aiSettings.accessInOtherRow)
    else setError(errorText(caught))
  }

  const startLogin = async (accountId: string | null) => {
    clearMessages()
    setStarting(true)
    const tab = openPendingTab()
    try {
      const path = accountId ? `/api/ai/subscription/accounts/${accountId}/login` : '/api/ai/subscription/login'
      const started = await apiClient.post(path, {}, loginStartSchema)
      if (openLogin.current && openLogin.current !== started.loginId)
        void apiClient.delete(`/api/ai/subscription/login/${openLogin.current}`).catch(() => undefined)
      openLogin.current = started.loginId
      setLogin({ id: started.loginId, url: started.url, accountId })
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
      void reloadAi()
    } catch (caught) {
      if (wasCancelled(caught)) return
      show(caught)
    }
    // The server has closed this login whatever happened: a new code needs a new link.
    openLogin.current = null
    setLogin(null)
  }

  const move = async (index: number, step: -1 | 1) => {
    const ids = accounts.map((a) => a.id)
    const other = index + step
    ;[ids[index], ids[other]] = [ids[other]!, ids[index]!]
    setError(null)
    try {
      await apiClient.patch('/api/ai/subscription/accounts/order', { ids }, accountViewSchema.array())
    } catch (caught) {
      setError(errorText(caught))
    }
    void reloadAi()
  }

  const onFailureAction = (id: FailureActionId) => {
    if (id === 'pedir_enlace' || id === 'volver_a_conectar') void startLogin(login?.accountId ?? null)
    else void reloadAi()
  }

  const loginForm = (forId: string | null) =>
    login && login.accountId === forId ? (
      <div className={styles.stack}>
        {forId && <p className={styles.text}>{es.aiSettings.reconnectNote}</p>}
        <LoginCodeForm
          url={login.url}
          code={code}
          onCodeChange={setCode}
          onSubmit={() => void connect()}
          onNewLink={() => void startLogin(forId)}
          starting={starting}
        />
        <div>
          <Button variant="primary" loading={!!work} onClick={() => void connect()}>
            {es.connectSubscription.connect}
          </Button>
        </div>
      </div>
    ) : null

  return (
    <div className={styles.stack}>
      <ul className={styles.accounts}>
        {accounts.map((account, index) => (
          <AccountRow
            key={account.id}
            account={account}
            first={index === 0}
            last={index === accounts.length - 1}
            onMove={(step) => void move(index, step)}
            onLogin={() => void startLogin(account.id)}
            login={loginForm(account.id)}
          />
        ))}
      </ul>
      {loginForm(null)}
      <AiWorkStatus work={work} onCancel={cancel} />
      {failure && <AiFailureMessage failure={failure} onAction={onFailureAction} hide={['anadir_cuenta']} />}
      {error && <ErrorMessage live title={error} action={{ label: es.app.retry, onClick: clearMessages }} />}
      {accounts.length < MAX_ACCOUNTS ? (
        !(login && login.accountId === null) && (
          <div>
            <Button id={ADD_ACCOUNT_ID} variant="secondary" loading={starting} onClick={() => void startLogin(null)}>
              {es.aiSettings.addAccount}
            </Button>
          </div>
        )
      ) : (
        <p className={styles.text}>{es.aiSettings.maxAccounts}</p>
      )}
      <p className={styles.text}>{es.connectSubscription.sameAccountNote}</p>
    </div>
  )
}
