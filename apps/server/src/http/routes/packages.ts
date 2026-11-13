import { Hono } from 'hono'
import type { PackageService } from '../../services/packages.ts'

export interface PackageRoutesDeps {
  service: PackageService
}

// The publishing packages of a channel (specs/006-publishing-package/contracts/http-api.md).
export function packageRoutes({ service }: PackageRoutesDeps) {
  const routes = new Hono()

  routes.get('/channels/:id/packages', (c) => c.json(service.summaries(c.req.param('id'))))

  routes.post('/scripts/:id/package', (c) => {
    const { view, created } = service.openForScript(c.req.param('id'))
    return c.json(view, created ? 201 : 200)
  })

  routes.get('/packages/:id', (c) => c.json(service.read(c.req.param('id'))))

  return routes
}
