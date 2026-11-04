import { measuresBodySchema, nameChecksBodySchema, referencesBodySchema } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { JourneysRepo } from '../../db/repos/journeys.ts'
import type { MeasuresRepo } from '../../db/repos/measures.ts'
import type { NameCheckService } from '../../services/name-check.ts'
import type { NicheResearch } from '../../services/niche-research.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface YouTubeRoutesDeps {
  journeys: JourneysRepo
  measures: MeasuresRepo
  research: NicheResearch
  nameCheck: NameCheckService
}

export function youtubeRoutes({ journeys, measures, research, nameCheck }: YouTubeRoutesDeps) {
  const routes = new Hono()

  routes.post('/journeys/:id/measures', async (c) => {
    const journey = journeys.get(c.req.param('id'))
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const body = await parseBody(c, measuresBodySchema)
    if (journey.revision !== body.revision) throw new ApiError({ code: 'conflicto', current: journey as never })
    const job = research.start(journey.id, body.niches, { force: body.force ?? false })
    return c.json({ jobId: job.id }, 202)
  })

  routes.post('/journeys/:id/name-checks', async (c) => {
    const journey = journeys.get(c.req.param('id'))
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const body = await parseBody(c, nameChecksBodySchema)
    if (journey.revision !== body.revision) throw new ApiError({ code: 'conflicto', current: journey as never })
    return c.json({ jobId: nameCheck.start(journey.id, body.names).id }, 202)
  })

  routes.post('/journeys/:id/references', async (c) => {
    const journey = journeys.get(c.req.param('id'))
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const { measureId, add, remove } = await parseBody(c, referencesBodySchema)
    const measure = measures.get(measureId)
    if (measure?.journeyId !== journey.id) throw new ApiError({ code: 'no_encontrado' })
    const result = await research.references(measure, { add, remove })
    if (result.ok) return c.json(result.references)
    if ('failure' in result) throw new ApiError({ code: 'youtube', youtubeFailure: result.failure })
    throw new ApiError({ code: 'validacion', fields: { [add ? 'add' : 'remove']: 'no_valido' } })
  })

  return routes
}
