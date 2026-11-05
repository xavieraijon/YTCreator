import { Tabs } from '@ytcreator/ui'
import { navigate, type Target } from '../../router.ts'
import { Screen } from '../../shell/Screen.tsx'
import { es } from '../../strings/es.ts'
import { AiSettings } from './AiSettings.tsx'
import { GeneralSettings } from './GeneralSettings.tsx'
import { UsageLog } from './UsageLog.tsx'
import { YouTubeSettingsScreen } from './YouTubeSettings.tsx'

export type SettingsTab = 'ia' | 'youtube' | 'consumo' | 'general'

const PAGE: Readonly<Record<SettingsTab, Target>> = {
  ia: { page: 'aiSettings' },
  youtube: { page: 'youtubeSettings' },
  consumo: { page: 'usageSettings' },
  general: { page: 'generalSettings' },
}
const isTab = (value: string): value is SettingsTab => value in PAGE

// /ajustes opens on the IA tab; each tab has its own address so it survives a reload.
export function Settings({ tab }: { tab: SettingsTab }) {
  return (
    <Screen title={es.settings.title}>
      <Tabs
        label={es.settings.title}
        value={tab}
        onValueChange={(value) => {
          if (isTab(value)) navigate(PAGE[value])
        }}
        items={[
          { id: 'ia', label: es.settings.tabs.ia, content: <AiSettings /> },
          { id: 'youtube', label: es.settings.tabs.youtube, content: <YouTubeSettingsScreen /> },
          { id: 'consumo', label: es.settings.tabs.consumo, content: <UsageLog /> },
          { id: 'general', label: es.settings.tabs.general, content: <GeneralSettings /> },
        ]}
      />
    </Screen>
  )
}
