import type { IdeaBankView } from '@ytcreator/core/api'
import { Button, ErrorMessage } from '@ytcreator/ui'
import { useCallback, useEffect, useState } from 'react'
import { ApiClientError, channelApi, ideasApi } from '../../../api/client.ts'
import { navigate } from '../../../router.ts'
import { errorText } from '../../../shell/errorText.ts'
import { Screen } from '../../../shell/Screen.tsx'
import { es } from '../../../strings/es.ts'
import { ideasEs } from '../../../strings/ideas.es.ts'
import styles from '../channel.module.css'

const text = ideasEs.bank

// A channel without its profile: the ideas are written for it (US1 AS5).
const isWithoutProfile = (error: unknown) =>
  error instanceof ApiClientError && error.body?.fields?.['profile'] === 'sin_perfil'

export type IdeaBankState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'noProfile' }
  | { readonly kind: 'ready'; readonly channelId: string; readonly bank: IdeaBankView }

// What the bank shows for each state, without the requests (tested on its own).
export function IdeaBankContent({ state }: { readonly state: IdeaBankState }) {
  if (state.kind === 'noProfile') {
    return (
      <div className={styles.option}>
        <p>{text.noProfile}</p>
        <Button variant="primary" onClick={() => navigate({ page: 'channelStart' })}>
          {text.goToProfile}
        </Button>
      </div>
    )
  }
  if (state.kind === 'loading') return <p className={styles.why}>{es.app.loading}</p>
  return (
    <>
      <p className={styles.why}>{text.why}</p>
      {state.bank.ideas.length === 0 && <p>{text.empty}</p>}
    </>
  )
}

// /canal/ideas (contracts/ui-screens.md, «Banco»).
export function IdeaBank() {
  const [state, setState] = useState<IdeaBankState>({ kind: 'loading' })
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const current = await channelApi.current()
      if (!current.channel || !current.profile) {
        setState({ kind: 'noProfile' })
        return
      }
      const bank = await ideasApi.list(current.channel.id)
      setState({ kind: 'ready', channelId: current.channel.id, bank })
    } catch (caught) {
      if (isWithoutProfile(caught)) setState({ kind: 'noProfile' })
      else setError(caught)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen title={text.title}>
      {error !== null && (
        <ErrorMessage live title={errorText(error)} action={{ label: es.app.retry, onClick: () => void load() }} />
      )}
      {(state.kind !== 'loading' || error === null) && <IdeaBankContent state={state} />}
    </Screen>
  )
}
