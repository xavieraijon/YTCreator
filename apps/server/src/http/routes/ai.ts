import {
  activeBodySchema,
  completeLoginBodySchema,
  connectionKindSchema,
  credentialBodySchema,
  keyConnectionKindSchema,
  renameAccountBodySchema,
  reorderAccountsBodySchema,
} from '@ytcreator/core/api'
import { Hono, type Context } from 'hono'
import type { AiConnectionsService } from '../../services/ai-connections.ts'
import type { ClaudeRepair } from '../../services/claude-repair.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

// An unknown kind in the path is a resource that does not exist.
function kindParam<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }) {
  const kind = schema.safeParse(c.req.param('kind'))
  if (!kind.success) throw new ApiError({ code: 'no_encontrado' })
  return kind.data
}

export function aiRoutes(ai: AiConnectionsService, repair?: ClaudeRepair) {
  const routes = new Hono()

  routes.get('/', async (c) => c.json(await ai.overview()))

  routes.post('/active', async (c) => {
    const { kind } = await parseBody(c, activeBodySchema)
    return c.json(await ai.activate(kind))
  })

  routes.post('/subscription/login', async (c) => c.json(await ai.startLogin()))

  routes.post('/subscription/login/:loginId/complete', async (c) => {
    const { code, label } = await parseBody(c, completeLoginBodySchema)
    const { account, created } = await ai.completeLogin(c.req.param('loginId'), code, label)
    return c.json(account, created ? 201 : 200)
  })

  routes.delete('/subscription/login/:loginId', async (c) => {
    await ai.cancelLogin(c.req.param('loginId'))
    return c.body(null, 204)
  })

  // Before `/:id`, so «order» is not read as an id.
  routes.patch('/subscription/accounts/order', async (c) => {
    const { ids } = await parseBody(c, reorderAccountsBodySchema)
    return c.json(ai.reorderAccounts(ids))
  })

  routes.patch('/subscription/accounts/:id', async (c) => {
    const { label } = await parseBody(c, renameAccountBodySchema)
    return c.json(ai.renameAccount(c.req.param('id'), label))
  })

  routes.delete('/subscription/accounts/:id', async (c) => {
    await ai.deleteAccount(c.req.param('id'))
    return c.body(null, 204)
  })

  routes.post('/subscription/accounts/:id/check', async (c) => c.json(await ai.checkAccount(c.req.param('id'))))

  routes.post('/subscription/accounts/:id/login', async (c) => c.json(await ai.startRelogin(c.req.param('id'))))

  routes.post('/connections/:kind/check', async (c) =>
    c.json(await ai.checkConnection(kindParam(c, connectionKindSchema))),
  )

  routes.put('/connections/:kind/credential', async (c) => {
    const kind = kindParam(c, keyConnectionKindSchema)
    const { key } = await parseBody(c, credentialBodySchema)
    return c.json(await ai.saveKey(kind, key))
  })

  routes.delete('/connections/:kind/credential', async (c) => {
    await ai.deleteKey(kindParam(c, keyConnectionKindSchema))
    return c.body(null, 204)
  })

  routes.post('/repair-claude-code', (c) => {
    if (!repair) throw new ApiError({ code: 'no_encontrado' })
    return c.json(repair.start(), 202)
  })

  routes.get('/repair-claude-code', (c) => c.json(repair?.state() ?? { state: 'inactivo' }))

  return routes
}
