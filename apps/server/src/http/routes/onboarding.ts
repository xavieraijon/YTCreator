import { stepBodySchema } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { OnboardingRepo } from '../../db/repos/onboarding.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export function onboardingRoutes(onboarding: OnboardingRepo) {
  const routes = new Hono()

  routes.get('/', (c) => c.json(onboarding.get()))

  // The step and the activation of the chosen connection go in one transaction (OnboardingRepo.apply).
  routes.post('/step', async (c) => {
    const body = await parseBody(c, stepBodySchema)
    const result = onboarding.apply(body)
    if (result.ok) return c.json(result.state)
    if (result.code === 'conflicto') throw new ApiError({ code: 'conflicto', current: result.current })
    throw new ApiError({ code: 'validacion', ...(result.guard ? { guard: result.guard } : {}) })
  })

  return routes
}
