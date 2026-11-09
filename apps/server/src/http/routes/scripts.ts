import { scriptFileName, scriptJson, scriptMarkdown, scriptsFileName, targetSecondsSchema } from '@ytcreator/core'
import {
  approveDraftBodySchema,
  approveOutlineBodySchema,
  claimActionBodySchema,
  draftSaveBodySchema,
  exportQuerySchema,
  outlineSaveBodySchema,
  restoreBodySchema,
  scriptVersionParamsSchema,
  scriptVersionsQuerySchema,
  scriptEstimateBodySchema,
  scriptGenerateBodySchema,
  scriptPatchBodySchema,
  scriptSettingsBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { ScriptsRepo } from '../../db/repos/scripts.ts'
import type { Context } from 'hono'
import type { ScriptExportInput } from '@ytcreator/core'
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

  const exportFormat = (c: Context) => {
    const query = exportQuerySchema.safeParse({ format: c.req.query('format') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    return query.data.format
  }

  const file = (c: Context, format: 'md' | 'json', input: ScriptExportInput, name: string) =>
    c.body(format === 'md' ? scriptMarkdown(input) : `${JSON.stringify(scriptJson(input), null, 2)}\n`, 200, {
      'Content-Type': format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    })

  const exported = (channel: { id: string; displayName: string | null }, items: ScriptExportInput['scripts']) => ({
    exportedAt: new Date().toISOString(),
    channel: { id: channel.id, displayName: channel.displayName },
    scripts: items,
  })

  routes.get('/channels/:id/scripts', (c) => {
    const { channel } = service.withProfile(c.req.param('id'))
    return c.json(service.summaries(channel.id))
  })

  routes.get('/channels/:id/scripts/export', (c) => {
    const format = exportFormat(c)
    const { channel, items } = service.exportAll(c.req.param('id'))
    return file(c, format, exported(channel, items), scriptsFileName(channel.displayName, format))
  })

  routes.get('/scripts/:id/export', (c) => {
    const format = exportFormat(c)
    const { channel, item } = service.exportOne(c.req.param('id'))
    return file(c, format, exported(channel, [item]), scriptFileName(item.title, format))
  })

  routes.get('/scripts/:id/review', (c) => {
    service.find(c.req.param('id'))
    return c.json({ rules: service.reviewRules() })
  })

  const versionParams = (c: Context) => {
    const params = scriptVersionParamsSchema.safeParse({ kind: c.req.param('kind'), version: c.req.param('version') })
    if (!params.success) throw new ApiError({ code: 'validacion', fields: { version: 'no_valido' } })
    return params.data
  }

  routes.get('/scripts/:id/versions', (c) => {
    const query = scriptVersionsQuerySchema.safeParse({ kind: c.req.query('kind') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { kind: 'no_valido' } })
    return c.json(service.listVersions(c.req.param('id'), query.data.kind))
  })

  routes.get('/scripts/:id/versions/:kind/:version', (c) => {
    const { kind, version } = versionParams(c)
    return c.json(service.readVersion(c.req.param('id'), kind, version))
  })

  routes.post('/scripts/:id/versions/:kind/:version/restore', async (c) => {
    const { kind, version } = versionParams(c)
    const { baseVersion } = await parseBody(c, restoreBodySchema)
    return c.json(service.restoreVersion(c.req.param('id'), kind, version, baseVersion))
  })

  routes.post('/scripts/:id/draft/approve', async (c) => {
    const { version, acknowledgedPending } = await parseBody(c, approveDraftBodySchema)
    return c.json(service.approveDraft(c.req.param('id'), version, acknowledgedPending))
  })

  routes.get('/channels/:id/script-settings', (c) => c.json(service.settings(c.req.param('id'))))

  routes.put('/channels/:id/script-settings', async (c) => {
    const body = await parseBody(c, scriptSettingsBodySchema)
    return c.json(service.saveSettings(c.req.param('id'), body))
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
    const { use, blockId } = await parseBody(c, scriptEstimateBodySchema)
    return c.json(service.estimate(c.req.param('id'), use, blockId))
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

  routes.put('/scripts/:id/draft', async (c) => {
    const body = await parseBody(c, draftSaveBodySchema)
    return c.json(service.saveDraft(c.req.param('id'), body))
  })

  routes.post('/scripts/:id/claims/:claimId', async (c) => {
    const body = await parseBody(c, claimActionBodySchema)
    return c.json(service.actOnClaim(c.req.param('id'), c.req.param('claimId'), body))
  })

  return routes
}
