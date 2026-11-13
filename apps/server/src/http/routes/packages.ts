import {
  packageApproveBodySchema,
  packageEstimateBodySchema,
  packageGenerateBodySchema,
  pieceSaveBodySchema,
  publishSettingsBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { PackageWork } from '../../services/package-work.ts'
import type { PackageService } from '../../services/packages.ts'
import { parseBody } from '../validate.ts'

export interface PackageRoutesDeps {
  service: PackageService
  work: PackageWork
}

// The publishing packages of a channel (specs/006-publishing-package/contracts/http-api.md).
export function packageRoutes({ service, work }: PackageRoutesDeps) {
  const routes = new Hono()

  routes.get('/channels/:id/packages', (c) => c.json(service.summaries(c.req.param('id'))))

  routes.get('/channels/:id/publish-settings', (c) => c.json(service.settingsOf(c.req.param('id'))))

  routes.put('/channels/:id/publish-settings', async (c) => {
    const body = await parseBody(c, publishSettingsBodySchema)
    return c.json(service.saveSettings(c.req.param('id'), body))
  })

  routes.post('/scripts/:id/package', (c) => {
    const { view, created } = service.openForScript(c.req.param('id'))
    return c.json(view, created ? 201 : 200)
  })

  routes.get('/packages/:id', (c) => c.json(service.read(c.req.param('id'))))

  routes.post('/packages/:id/estimate', async (c) => {
    const body = await parseBody(c, packageEstimateBodySchema)
    return c.json(work.estimate(c.req.param('id'), body))
  })

  routes.post('/packages/:id/generate', async (c) => {
    const body = await parseBody(c, packageGenerateBodySchema)
    return c.json({ jobId: work.generate(c.req.param('id'), body) }, 202)
  })

  routes.put('/packages/:id/pieces/:kind', async (c) => {
    const body = await parseBody(c, pieceSaveBodySchema)
    return c.json(work.savePiece(c.req.param('id'), c.req.param('kind'), body))
  })

  routes.post('/packages/:id/approve', async (c) => {
    const body = await parseBody(c, packageApproveBodySchema)
    return c.json(work.approve(c.req.param('id'), body))
  })

  return routes
}
