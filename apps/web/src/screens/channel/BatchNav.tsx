import type { ProposalView } from '@ytcreator/core/api'
import { Button, ErrorMessage } from '@ytcreator/ui'
import { useState } from 'react'
import { channelApi } from '../../api/client.ts'
import { errorText } from '../../shell/errorText.ts'
import { channelEs } from '../../strings/channel.es.ts'
import { es } from '../../strings/es.ts'
import styles from './channel.module.css'

const text = channelEs.proposal

export interface BatchNavProps {
  readonly proposal: ProposalView
  readonly reload: () => Promise<unknown>
  readonly busy?: boolean
  /** A step that shows one proposal at a time, not a batch («Volver a la anterior»). */
  readonly single?: boolean
}

// Every batch that was paid for can be gone back to and come back from: going back loses nothing (P3).
export function BatchNav({ proposal, reload, busy = false, single = false }: BatchNavProps) {
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const newerId = proposal.newerId ?? null
  if (!proposal.parentId && !newerId) return null

  const move = (to: (id: string) => Promise<unknown>) => {
    setMoving(true)
    setError(null)
    to(proposal.id)
      .then(reload)
      .catch(setError)
      .finally(() => setMoving(false))
  }

  return (
    <>
      {error !== null && (
        <ErrorMessage
          live
          title={errorText(error)}
          action={{
            label: es.app.retry,
            onClick: () => {
              setError(null)
              void reload()
            },
          }}
        />
      )}
      <div className={styles.actions}>
        {proposal.parentId && (
          <Button disabled={busy || moving} onClick={() => move(channelApi.back)}>
            {single ? text.previousOne : text.previousBatch}
          </Button>
        )}
        {newerId && (
          <Button disabled={busy || moving} onClick={() => move(channelApi.forward)}>
            {single ? text.newerOne : text.newerBatch}
          </Button>
        )}
      </div>
    </>
  )
}
