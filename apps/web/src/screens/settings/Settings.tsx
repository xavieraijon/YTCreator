import { Tabs } from '@ytcreator/ui'
import { navigate } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import { AiSettings } from './AiSettings.tsx'
import { GeneralSettings } from './GeneralSettings.tsx'

export type SettingsTab = 'ia' | 'general'

// /ajustes opens on the IA tab; each tab has its own address so it survives a reload.
export function Settings({ tab }: { tab: SettingsTab }) {
  return (
    <Screen title={es.settings.title}>
      <Tabs
        label={es.settings.title}
        value={tab}
        onValueChange={(value) => navigate({ page: value === 'general' ? 'generalSettings' : 'aiSettings' })}
        items={[
          { id: 'ia', label: es.settings.tabs.ia, content: <AiSettings /> },
          { id: 'general', label: es.settings.tabs.general, content: <GeneralSettings /> },
        ]}
      />
    </Screen>
  )
}
