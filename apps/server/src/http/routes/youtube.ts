import type { YouTubeFailureCode } from '@ytcreator/core'
import {
  measuresBodySchema,
  nameChecksBodySchema,
  readingBodySchema,
  referencesBodySchema,
  resolveBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { JourneysRepo } from '../../db/repos/journeys.ts'
import type { MeasuresRepo } from '../../db/repos/measures.ts'
import type { ChannelReadingService } from '../../services/channel-reading.ts'
import type { NameCheckService } from '../../services/name-check.ts'
import type { NicheResearch } from '../../services/niche-research.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface YouTubeRoutesDeps {
  journeys: JourneysRepo
  measures: MeasuresRepo
  research: NicheResearch
  nameCheck: NameCheckService
  reading: ChannelReadingService
}

// A channel that does not exist is a 404 (contracts/http-api.md); the rest is why YouTube could not be read.
const lookUpError = (failure: YouTubeFailureCode) =>
  failure === 'no_encontrado' || failure === 'sin_datos'
    ? new ApiError({ code: 'no_encontrado' })
    : new ApiError({ code: 'youtube', youtubeFailure: failure })

export function youtubeRoutes({ journeys, measures, research, nameCheck, reading }: YouTubeRoutesDeps) {
  const routes = new Hono()

  routes.post('/journeys/:id/resolve', async (c) => {
    const journey = journeys.get(c.req.param('id'))
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const { input } = await parseBody(c, resolveBodySchema)
    const looked = await reading.lookUp(input)
    if (!looked.ok) throw lookUpError(looked.failure)
    return c.json(looked.channel)
  })

  routes.post('/journeys/:id/reading', async (c) => {
    const journey = journeys.get(c.req.param('id'))
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const body = await parseBody(c, readingBodySchema)
    if (journey.revision !== body.revision) throw new ApiError({ code: 'conflicto', current: journey as never })
    if (journey.kind !== 'existente' || (journey.step !== 'confirmar' && journey.step !== 'lectura')) {
      throw new ApiError({ code: 'validacion', fields: { step: 'no_valido' } })
    }
    const looked = await reading.lookUp(body.input)
    if (!looked.ok) throw lookUpError(looked.failure)
    if (reading.isTaken(journey, looked.channel.channelId)) {
      throw new ApiError({ code: 'conflicto', guard: 'ya_hay_canal' })
    }
    return c.json({ jobId: reading.start(journey, body.input, looked).id }, 202)
  })

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
