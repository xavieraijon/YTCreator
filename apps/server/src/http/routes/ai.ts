import { completeLoginBodySchema, credentialBodySchema, keyConnectionKindSchema } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { AiConnectionsService } from '../../services/ai-connections.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export function aiRoutes(ai: AiConnectionsService) {
  const routes = new Hono()

  routes.get('/', async (c) => c.json(await ai.overview()))

  routes.post('/subscription/login', async (c) => c.json(await ai.startLogin()))

  routes.post('/subscription/login/:loginId/complete', async (c) => {
    const { code, label } = await parseBody(c, completeLoginBodySchema)
    return c.json(await ai.completeLogin(c.req.param('loginId'), code, label), 201)
  })

  routes.delete('/subscription/login/:loginId', async (c) => {
    await ai.cancelLogin(c.req.param('loginId'))
    return c.body(null, 204)
  })

  routes.put('/connections/:kind/credential', async (c) => {
    const kind = keyConnectionKindSchema.safeParse(c.req.param('kind'))
    if (!kind.success) throw new ApiError({ code: 'no_encontrado' })
    const { key } = await parseBody(c, credentialBodySchema)
    return c.json(await ai.saveKey(kind.data, key))
  })

  return routes
}
