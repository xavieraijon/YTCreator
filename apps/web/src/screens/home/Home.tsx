import { EmptyState, ErrorMessage } from '@ytcreator/ui'
import { Clapperboard } from 'lucide-react'
import { useAiOverview } from '../../ai/useAiOverview.ts'
import { navigate } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'

// The way into the channel: everything about it lives in /canal.
export function Home() {
  const overview = useAiOverview()

  return (
    <Screen title={es.home.title}>
      {overview && !overview.activeKind && (
        <ErrorMessage
          title={es.home.noAi}
          action={{ label: es.home.connectAi, onClick: () => navigate({ page: 'aiSettings' }) }}
        />
      )}
      <EmptyState
        icon={Clapperboard}
        titleAs="h2"
        title={es.home.body}
        action={{ label: es.home.createChannel, onClick: () => navigate({ page: 'channelStart' }) }}
      />
    </Screen>
  )
}
