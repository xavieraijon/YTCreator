import type { ConnectionKind } from '@ytcreator/core'
import { aiOverviewSchema } from '@ytcreator/core/api'
import { Button } from '@ytcreator/ui'
import { useState } from 'react'
import { reloadAi } from '../../ai/useAiOverview.ts'
import { apiClient, ApiClientError } from '../../api/client.ts'
import { navigate } from '../../router.ts'
import { errorText } from '../../shell/errorText.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import { ConnectApiKey } from '../onboarding/ConnectApiKey.tsx'
import { ConnectSubscription } from '../onboarding/ConnectSubscription.tsx'
import styles from '../onboarding/onboarding.module.css'
import { LimitsForm, useLimitsForm } from './LimitsForm.tsx'

const toSettings = () => navigate({ page: 'aiSettings' })

// Pay per use is never active without limits (FR-021): they are asked for here before it is used.
function LimitsStep({ onSaved, onBack }: { onSaved: () => void; onBack: () => void }) {
  const form = useLimitsForm()
  const save = async () => {
    if (await form.save()) onSaved()
  }
  return (
    <Screen title={es.aiSettings.limits}>
      <p className={styles.text}>{es.guard.sin_limites}</p>
      <LimitsForm form={form} onSubmit={() => void save()} />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onBack}>
          {es.wizard.back}
        </Button>
        <Button className={styles.primary} variant="primary" loading={form.saving} onClick={() => void save()}>
          {es.limits.save}
        </Button>
      </div>
    </Screen>
  )
}

// /ajustes/ia/cambiar/:kind: the wizard's connection screen, ending in «Usar esta opción»; onboarding is not touched.
export function ChangeAi({ kind }: { kind: ConnectionKind }) {
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsLimits, setNeedsLimits] = useState(false)

  const activate = async () => {
    setError(null)
    setActivating(true)
    try {
      await apiClient.post('/api/ai/active', { kind }, aiOverviewSchema)
      void reloadAi()
      toSettings()
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.body?.guard === 'sin_limites') setNeedsLimits(true)
      else setError(errorText(caught))
    } finally {
      setActivating(false)
    }
  }

  if (needsLimits) {
    const saved = () => {
      setNeedsLimits(false)
      void activate()
    }
    return <LimitsStep onSaved={saved} onBack={() => setNeedsLimits(false)} />
  }

  const outside = {
    finish: { label: es.aiSettings.useThis, onClick: () => void activate(), loading: activating },
    back: toSettings,
    error,
  }
  return kind === 'pago_por_uso' ? (
    <ConnectApiKey chosenKind={kind} outside={outside} />
  ) : (
    <ConnectSubscription chosenKind={kind} outside={outside} />
  )
}
