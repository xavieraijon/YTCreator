import { packageJson, packageMarkdown, thumbnailBrief, type PackageExportInput } from '@ytcreator/core'
import {
  packageApproveBodySchema,
  packageEstimateBodySchema,
  packageExportQuerySchema,
  packageGenerateBodySchema,
  packagesExportQuerySchema,
  packageStudioBodySchema,
  pieceSaveBodySchema,
  publishSettingsBodySchema,
} from '@ytcreator/core/api'
import { type Context, Hono } from 'hono'
import type { z } from 'zod'
import { ApiError } from '../errors.ts'
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

  const formatOf = <S extends z.ZodType<{ format: string }>>(c: Context, schema: S): z.infer<S>['format'] => {
    const query = schema.safeParse({ format: c.req.query('format') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    return query.data.format
  }

  // A file to keep, never shown in the browser (R15): the document, the data or the thumbnail brief.
  const file = (c: Context, format: 'md' | 'json' | 'brief', input: PackageExportInput, name: string) => {
    const body =
      format === 'json'
        ? `${JSON.stringify(packageJson(input), null, 2)}\n`
        : format === 'brief'
          ? thumbnailBrief(input.packages[0]!)
          : packageMarkdown(input)
    return c.body(body, 200, {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    })
  }

  const exported = (channel: { id: string; displayName: string | null }, packages: PackageExportInput['packages']) => ({
    exportedAt: new Date().toISOString(),
    channel: { id: channel.id, displayName: channel.displayName },
    packages,
  })

  routes.get('/channels/:id/packages', (c) => c.json(service.summaries(c.req.param('id'))))

  routes.get('/channels/:id/packages/export', (c) => {
    const format = formatOf(c, packagesExportQuerySchema)
    const { channel, items, skipped, fileName } = service.exportAll(c.req.param('id'))
    return file(c, format, { ...exported(channel, items), skipped }, fileName(format))
  })

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

  // The figures the review uses: it is worked out in the browser, without AI (R13, SC-007).
  routes.get('/packages/:id/review', (c) => {
    service.find(c.req.param('id'))
    return c.json({ rules: service.reviewFigures(), sources: service.reviewSources() })
  })

  routes.put('/packages/:id/studio', async (c) => {
    const body = await parseBody(c, packageStudioBodySchema)
    return c.json(service.saveStudio(c.req.param('id'), body.done, body.base))
  })

  routes.get('/packages/:id/export', (c) => {
    const format = formatOf(c, packageExportQuerySchema)
    const { channel, item, fileName } = service.exportOne(c.req.param('id'))
    return file(c, format, exported(channel, [item]), fileName(format))
  })

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
