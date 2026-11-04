import type { ChannelCurrent } from '@ytcreator/core/api'
import { EmptyState, ErrorMessage, format } from '@ytcreator/ui'
import { Clapperboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAiOverview } from '../../ai/useAiOverview.ts'
import { channelApi } from '../../api/client.ts'
import { navigate } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'

// What the home says about the channel, and the way to its next step (US3 AS5 and AS6).
export function homeChannel(current: ChannelCurrent): { title: string; action: string } {
  if (!current.channel) return { title: es.home.body, action: es.home.createChannel }
  const { channel, journey } = current
  if (journey?.status === 'activo') return { title: es.home.resumeChannel, action: es.home.resume }
  if (channel.nameStatus === 'provisional') return { title: es.home.noNameYet, action: es.home.openChannel }
  return {
    title: channel.displayName ? format(es.home.channelNamed, { nombre: channel.displayName }) : es.home.channelReady,
    action: es.home.openChannel,
  }
}

// The way into the channel: everything about it lives in /canal.
export function Home() {
  const overview = useAiOverview()
  const [current, setCurrent] = useState<ChannelCurrent | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    channelApi
      .current()
      .then(setCurrent)
      .catch(() => setFailed(true))
  }, [])

  // If it cannot be asked, the way in is still there: /canal says what went wrong.
  const shown = current ? homeChannel(current) : failed ? homeChannel({ channel: null }) : null

  return (
    <Screen title={es.home.title}>
      {overview && !overview.activeKind && (
        <ErrorMessage
          title={es.home.noAi}
          action={{ label: es.home.connectAi, onClick: () => navigate({ page: 'aiSettings' }) }}
        />
      )}
      {shown && (
        <EmptyState
          icon={Clapperboard}
          titleAs="h2"
          title={shown.title}
          action={{ label: shown.action, onClick: () => navigate({ page: 'channelStart' }) }}
        />
      )}
    </Screen>
  )
}
