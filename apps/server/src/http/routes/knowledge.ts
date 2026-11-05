import type { KnowledgeAges } from '@ytcreator/core/api'
import { Hono } from 'hono'

const DAY_MS = 86_400_000

export interface KnowledgeRoutesDeps {
  files: () => { file: string; label: string; reviewedAt: string }[]
  staleAfterDays: number
  now?: () => Date
}

// What YTCreator knows about YouTube and when it was last reviewed; Ajustes lists what is older than 180 days
// (contracts/knowledge.md).
export function knowledgeRoutes({ files, staleAfterDays, now = () => new Date() }: KnowledgeRoutesDeps) {
  const routes = new Hono()
  routes.get('/', (c) => {
    const limit = now().getTime() - staleAfterDays * DAY_MS
    const ages: KnowledgeAges = {
      files: files().map(({ file, label, reviewedAt }) => ({
        id: file,
        label,
        reviewedAt,
        stale: Date.parse(`${reviewedAt}T00:00:00Z`) < limit,
      })),
      staleAfterDays,
    }
    return c.json(ages)
  })
  return routes
}
