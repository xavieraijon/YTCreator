import { targetSecondsSchema } from '@ytcreator/core'
import {
  approveOutlineBodySchema,
  outlineSaveBodySchema,
  scriptEstimateBodySchema,
  scriptGenerateBodySchema,
  scriptPatchBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { ScriptsRepo } from '../../db/repos/scripts.ts'
import type { ScriptService } from '../../services/scripts.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface ScriptRoutesDeps {
  service: ScriptService
  scripts: ScriptsRepo
}

// The scripts of a channel (specs/005-script-and-outline/contracts/http-api.md).
export function scriptRoutes({ service, scripts }: ScriptRoutesDeps) {
  const routes = new Hono()

  routes.get('/channels/:id/scripts', (c) => {
    const { channel } = service.withProfile(c.req.param('id'))
    return c.json(service.summaries(channel.id))
  })

  routes.post('/ideas/:id/script', (c) => {
    const { view, created } = service.openForIdea(c.req.param('id'))
    return c.json(view, created ? 201 : 200)
  })

  routes.get('/scripts/:id', (c) => {
    const { script, idea, profileVersion } = service.find(c.req.param('id'))
    return c.json(service.view(script, idea, profileVersion))
  })

  routes.patch('/scripts/:id', async (c) => {
    const body = await parseBody(c, scriptPatchBodySchema)
    const { script, idea, profileVersion } = service.find(c.req.param('id'))
    service.assertIdle(script)
    if (body.baseUpdatedAt !== script.updatedAt) throw new ApiError({ code: 'version_cambiada' })
    const seconds = body.targetSeconds ?? script.targetSeconds
    const rule = targetSecondsSchema(script.format, service.shortMaxSeconds)
    if (body.targetSeconds !== undefined && !rule.safeParse(seconds).success) {
      throw new ApiError({ code: 'validacion', fields: { targetSeconds: 'no_valido' } })
    }
    const changed = scripts.update(script.id, { targetSeconds: seconds, notes: body.notes ?? script.notes })
    return c.json(service.view(changed, idea, profileVersion))
  })

  routes.post('/scripts/:id/estimate', async (c) => {
    const { use } = await parseBody(c, scriptEstimateBodySchema)
    return c.json(service.estimate(c.req.param('id'), use))
  })

  routes.post('/scripts/:id/generate', async (c) => {
    const body = await parseBody(c, scriptGenerateBodySchema)
    return c.json({ jobId: service.generate(c.req.param('id'), body) }, 202)
  })

  routes.put('/scripts/:id/outline', async (c) => {
    const body = await parseBody(c, outlineSaveBodySchema)
    return c.json(service.saveOutline(c.req.param('id'), body))
  })

  routes.post('/scripts/:id/outline/approve', async (c) => {
    const { version } = await parseBody(c, approveOutlineBodySchema)
    return c.json(service.approveOutline(c.req.param('id'), version))
  })

  return routes
}
