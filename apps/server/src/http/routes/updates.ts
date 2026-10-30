import { isNewer } from '@ytcreator/core'
import { dismissBodySchema, type UpdateInfo } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { SettingsRepo } from '../../db/repos/settings.ts'
import { parseBody } from '../validate.ts'

export interface UpdatesRoutesDeps {
  settings: SettingsRepo
  version: string
}

// Never reaches the network itself (FR-031): it only reads what the periodic version-check already saved.
export function updatesRoutes({ settings, version }: UpdatesRoutesDeps) {
  const routes = new Hono()

  routes.get('/', (c) => {
    const latest = settings.get('latest_version')
    const dismissed = settings.get('dismissed_version')
    const enabled = settings.get('update_check_enabled')
    const show = enabled === true && latest !== null && isNewer(latest, version) && latest !== dismissed
    const info: UpdateInfo = { current: version, latest, show }
    return c.json(info)
  })

  routes.post('/dismiss', async (c) => {
    const body = await parseBody(c, dismissBodySchema)
    settings.set('dismissed_version', body.version)
    return c.json({})
  })

  return routes
}
