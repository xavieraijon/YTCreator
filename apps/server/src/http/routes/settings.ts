import { PROPOSED_LIMITS, validateLimits } from '@ytcreator/core'
import { limitsBodySchema, type LimitsView } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { LimitsRepo } from '../../db/repos/limits.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface SettingsRoutesDeps {
  limits: LimitsRepo
}

export function settingsRoutes({ limits }: SettingsRoutesDeps) {
  const routes = new Hono()

  // Without saved limits, the proposed ones, not yet accepted (FR-021).
  routes.get('/limits', (c) => {
    const saved = limits.get()
    const view: LimitsView = saved
      ? {
          perOperationCents: saved.perOperationCents,
          dailyCents: saved.dailyCents,
          monthlyCents: saved.monthlyCents,
          accepted: true,
        }
      : { ...PROPOSED_LIMITS, accepted: false }
    return c.json(view)
  })

  routes.put('/limits', async (c) => {
    const body = await parseBody(c, limitsBodySchema)
    const result = validateLimits(body)
    if (!result.ok) throw new ApiError({ code: 'validacion', fields: result.fields })
    const saved = limits.save(result.limits)
    const view: LimitsView = {
      perOperationCents: saved.perOperationCents,
      dailyCents: saved.dailyCents,
      monthlyCents: saved.monthlyCents,
      accepted: true,
    }
    return c.json(view)
  })

  return routes
}
