import { CONNECTION_KINDS, type AiFailure, type ConnectionKind } from '@ytcreator/core'
import { aiOverviewSchema, checkConnectionResponseSchema, repairStateSchema } from '@ytcreator/core/api'
import { Button, Card, Dialog, ErrorMessage, format, ProgressBar, useToast } from '@ytcreator/ui'
import { useEffect, useState } from 'react'
import { kindLabel } from '../../ai/kindLabel.ts'
import { reloadAi, useAiOverview } from '../../ai/useAiOverview.ts'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { navigate } from '../../router.ts'
import { AiFailureMessage } from '../../shell/AiFailureMessage.tsx'
import { AiWorkStatus, useAiWork } from '../../shell/AiWork.tsx'
import { errorText, wasCancelled } from '../../shell/errorText.ts'
import { StatusLine } from '../../shell/StatusLine.tsx'
import { timeAgo } from '../../shell/statusText.ts'
import { es } from '../../strings/es.ts'
import type { FailureActionId } from '../../strings/failures.es.ts'
import { AccountList, ADD_ACCOUNT_ID } from './AccountList.tsx'
import { LimitsForm, useLimitsForm } from './LimitsForm.tsx'
import styles from './settings.module.css'

const NOT_INSTALLED: AiFailure = { kind: 'no_disponible', reason: 'programa_no_instalado' }
const OTHERS_ID = 'otras-opciones'
const REPAIR_POLL_MS = 2000

const focusById = (id: string) => document.getElementById(id)?.focus()

function LimitsSection() {
  const form = useLimitsForm()
  const { toast } = useToast()
  const save = async () => {
    if (await form.save()) toast({ title: es.limits.saved, tone: 'success' })
  }
  return (
    <section className={styles.section} aria-labelledby="limites">
      <h2 id="limites">{es.aiSettings.limits}</h2>
      <LimitsForm form={form} onSubmit={() => void save()} />
      <div>
        <Button variant="secondary" loading={form.saving} onClick={() => void save()}>
          {es.limits.save}
        </Button>
      </div>
    </section>
  )
}

// FR-007..FR-011: the option in use, the accounts, the saved keys, the other options and the limits.
export function AiSettings() {
  const overview = useAiOverview()
  const { toast } = useToast()
  const { work, run, cancel } = useAiWork()
  const [error, setError] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState(false)
  const [busy, setBusy] = useState<'repair' | 'removeKey' | ConnectionKind | null>(null)

  useEffect(() => {
    void reloadAi()
  }, [])

  // While Claude Code is being installed again, the overview is asked for until it ends.
  const repairing = overview?.claudeCode.repair.state === 'en_curso'
  useEffect(() => {
    if (!repairing) return
    const timer = setInterval(() => void reloadAi(), REPAIR_POLL_MS)
    return () => clearInterval(timer)
  }, [repairing])

  if (!overview) return <p role="status">{es.app.loading}</p>

  const active = overview.connections.find((c) => c.kind === overview.activeKind)
  const accountLabel = (id: string) => overview.accounts.find((a) => a.id === id)?.label ?? ''
  const key = overview.connections.find((c) => c.kind === 'pago_por_uso')
  const others = CONNECTION_KINDS.filter((kind) => kind !== overview.activeKind)
  const failing = active && active.status !== 'conectada' && active.status !== 'sin_comprobar' && active.reason

  // The option that takes over if `removed` is in use and goes away: the other one, if it works and can be used.
  const takesOver = (removed: ConnectionKind): ConnectionKind | null => {
    if (overview.activeKind !== removed) return null
    const other = overview.connections.find((c) => c.kind !== removed)
    if (other?.status !== 'conectada' || (other.kind === 'pago_por_uso' && !overview.hasLimits)) return null
    return other.kind
  }
  const keyFallback = takesOver('pago_por_uso')
  const removeKeyBody = keyFallback
    ? format(es.aiSettings.removeKeyFallbackBody, { opcion: es.choose.options[keyFallback].title })
    : overview.activeKind === 'pago_por_uso'
      ? es.aiSettings.removeKeyInUseBody
      : es.aiSettings.removeKeyBody

  const check = async (kind: ConnectionKind) => {
    setError(null)
    try {
      const result = await run(es.aiSettings.checking, (signal) =>
        apiClient.post(`/api/ai/connections/${kind}/check`, {}, checkConnectionResponseSchema, { signal }),
      )
      const switched = result.switched
      if (switched?.length) {
        toast({
          tone: 'warning',
          title: format(es.aiSettings.switched, {
            anterior: accountLabel(switched[0]!.fromId),
            siguiente: accountLabel(switched[switched.length - 1]!.toId),
          }),
        })
      }
    } catch (caught) {
      if (!wasCancelled(caught)) setError(errorText(caught))
    }
    void reloadAi()
  }

  const repair = async () => {
    setError(null)
    setBusy('repair')
    try {
      await apiClient.post('/api/ai/repair-claude-code', {}, repairStateSchema)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(null)
      void reloadAi()
    }
  }

  const use = async (kind: ConnectionKind) => {
    setError(null)
    setBusy(kind)
    try {
      await apiClient.post('/api/ai/active', { kind }, aiOverviewSchema)
      void reloadAi()
      toast({ tone: 'success', title: format(es.aiSettings.nowUsing, { opcion: es.choose.options[kind].title }) })
    } catch (caught) {
      // Without limits the change goes through its own screen, which asks only for them: the key is already saved.
      if (caught instanceof ApiClientError && caught.body?.guard === 'sin_limites')
        navigate({ page: 'switchAi', kind, limits: true })
      else setError(errorText(caught))
    } finally {
      setBusy(null)
    }
  }

  const removeKey = async () => {
    setError(null)
    setBusy('removeKey')
    try {
      await apiClient.delete('/api/ai/connections/pago_por_uso/credential')
      setConfirmKey(false)
      if (keyFallback)
        toast({
          tone: 'success',
          title: format(es.aiSettings.nowUsing, { opcion: es.choose.options[keyFallback].title }),
        })
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(null)
      void reloadAi()
    }
  }

  const onFailureAction = (id: FailureActionId) => {
    if (id === 'comprobar' && active) void check(active.kind)
    else if (id === 'reparar') void repair()
    else if (id === 'anadir_cuenta') focusById(ADD_ACCOUNT_ID)
    else if (id === 'cambiar_de_opcion' || id === 'elegir_otra_opcion') focusById(OTHERS_ID)
  }

  const showRepair = !overview.claudeCode.installed || repairing

  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby="en-uso">
        <h2 id="en-uso">{es.aiSettings.current}</h2>
        {active ? (
          <Card className={styles.account}>
            <strong>{kindLabel(active.kind)}</strong>
            <StatusLine view={active} />
            <p className={styles.text}>
              {active.lastCheckedAt
                ? format(es.aiSettings.lastCheck, { cuando: timeAgo(active.lastCheckedAt) })
                : es.aiSettings.neverChecked}
            </p>
            <div>
              <Button variant="primary" loading={!!work} onClick={() => void check(active.kind)}>
                {es.aiSettings.checkNow}
              </Button>
            </div>
          </Card>
        ) : (
          <p className={styles.text}>{es.header.noAi}</p>
        )}
        <AiWorkStatus work={work} onCancel={cancel} />
        {failing && !work && (
          <AiFailureMessage
            failure={{ kind: active.status, reason: active.reason, resetsAt: active.resetsAt } as AiFailure}
            onAction={onFailureAction}
            hide={['volver_a_conectar', 'pedir_enlace']}
          />
        )}
        {error && <ErrorMessage live title={error} action={{ label: es.app.retry, onClick: () => setError(null) }} />}
      </section>

      {(overview.accounts.length > 0 || showRepair) && (
        <section className={styles.section} aria-labelledby="cuentas">
          <h2 id="cuentas">{es.aiSettings.accounts}</h2>
          {showRepair &&
            (repairing ? (
              <ProgressBar label={es.connectSubscription.repairing} />
            ) : (
              <AiFailureMessage failure={NOT_INSTALLED} onAction={onFailureAction} />
            ))}
          {busy === 'repair' && <p role="status">{es.connectSubscription.repairing}</p>}
          {overview.accounts.length > 0 && (
            <AccountList
              accounts={overview.accounts}
              inUse={overview.activeKind === 'suscripcion'}
              fallback={takesOver('suscripcion')}
            />
          )}
        </section>
      )}

      {key?.hint && (
        <section className={styles.section} aria-labelledby="claves">
          <h2 id="claves">{es.aiSettings.savedKeys}</h2>
          <Card className={styles.account}>
            <div className={`${styles.row} ${styles.spread}`}>
              <span>
                {kindLabel(key.kind)} · {format(es.aiSettings.savedKey, { pista: key.hint })}
              </span>
              <StatusLine view={key} />
            </div>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => navigate({ page: 'switchAi', kind: 'pago_por_uso' })}>
                {es.aiSettings.replace}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmKey(true)}>
                {es.aiSettings.remove}
              </Button>
            </div>
          </Card>
          <Dialog
            open={confirmKey}
            onOpenChange={setConfirmKey}
            size="sm"
            title={es.aiSettings.removeKeyTitle}
            description={removeKeyBody}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmKey(false)}>
                  {es.aiSettings.cancel}
                </Button>
                <Button variant="danger" loading={busy === 'removeKey'} onClick={() => void removeKey()}>
                  {es.aiSettings.remove}
                </Button>
              </>
            }
          />
        </section>
      )}

      <section className={styles.section} aria-labelledby={OTHERS_ID}>
        <h2 id={OTHERS_ID} tabIndex={-1}>
          {es.aiSettings.others}
        </h2>
        <ul className={styles.accounts}>
          {others.map((kind) => {
            const connection = overview.connections.find((c) => c.kind === kind)
            const ready = connection?.status === 'conectada'
            return (
              <Card as="li" key={kind} className={`${styles.row} ${styles.spread}`}>
                <span className={styles.option}>
                  <strong>{kindLabel(kind)}</strong>
                  {kind === 'suscripcion' && overview.accounts.length === 0 ? (
                    <span className={styles.text}>{es.aiSettings.noAccount}</span>
                  ) : (
                    connection && <StatusLine view={connection} />
                  )}
                </span>
                {ready ? (
                  <Button variant="secondary" loading={busy === kind} onClick={() => void use(kind)}>
                    {es.aiSettings.useThis}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => navigate({ page: 'switchAi', kind })}>
                    {es.aiSettings.configure}
                  </Button>
                )}
              </Card>
            )
          })}
        </ul>
      </section>

      {key && <LimitsSection />}
    </div>
  )
}
