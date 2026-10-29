import { Button, Dialog, EmptyState, ErrorMessage } from '@ytcreator/ui'
import { Clapperboard } from 'lucide-react'
import { useState } from 'react'
import { useAiOverview } from '../../ai/useAiOverview.ts'
import { navigate } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'

// Channels arrive in the next feature: for now the home only says so.
export function Home() {
  const overview = useAiOverview()
  const [coming, setComing] = useState(false)
  const toSettings = () => navigate({ page: 'aiSettings' })

  return (
    <Screen title={es.home.title}>
      {overview && !overview.activeKind && (
        <ErrorMessage title={es.home.noAi} action={{ label: es.home.connectAi, onClick: toSettings }} />
      )}
      <EmptyState
        icon={Clapperboard}
        titleAs="h2"
        title={es.home.body}
        action={{ label: es.home.createChannel, onClick: () => setComing(true) }}
      />
      <Dialog
        open={coming}
        onOpenChange={setComing}
        title={es.home.comingTitle}
        description={es.home.comingBody}
        footer={
          <>
            <Button onClick={toSettings}>{es.home.goSettings}</Button>
            <Button variant="primary" onClick={() => setComing(false)}>
              {es.home.understood}
            </Button>
          </>
        }
      />
    </Screen>
  )
}
