import { type UsageList, usageQuerySchema } from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { UsageRepo } from '../../db/repos/usage.ts'
import { ApiError } from '../errors.ts'

// A `YYYY-MM-DD` as the creator's own day: from its local midnight.
const localDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}
const nextDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)

// Ajustes → Consumo (contracts/cost.md): the calls between two days, both included (this month by default), and the
// totals of today and of the month, which do not depend on the days asked for.
export function usageRoutes({ usage, now = () => new Date() }: { usage: UsageRepo; now?: () => Date }) {
  const routes = new Hono()

  routes.get('/', (c) => {
    const query = usageQuerySchema.safeParse({ from: c.req.query('from'), to: c.req.query('to') })
    if (!query.success) {
      // Each date that is wrong is named, not always the first one.
      const fields = Object.fromEntries(
        query.error.issues.map((issue) => [String(issue.path[0] ?? 'from'), 'no_valido' as const]),
      )
      throw new ApiError({ code: 'validacion', fields })
    }
    const today = now()
    const from = query.data.from ? localDay(query.data.from) : new Date(today.getFullYear(), today.getMonth(), 1)
    const to = query.data.to
      ? localDay(query.data.to)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (from > to) throw new ApiError({ code: 'validacion', fields: { from: 'no_valido' } })
    const { dayCents, monthCents } = usage.totals(today)
    const list: UsageList = { items: usage.between(from, nextDay(to)), todayCents: dayCents, monthCents }
    return c.json(list)
  })

  return routes
}
