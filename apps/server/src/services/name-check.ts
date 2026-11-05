import {
  createLimiter,
  type Logger,
  type NameThresholds,
  nameFindings,
  semaphoreOf,
  type StoredHandleStatus,
  type YouTubeData,
} from '@ytcreator/core'
import type { NameCheck, NamesRepo } from '../db/repos/names.ts'
import type { JobsService } from './jobs.ts'

export const MAX_NAME_CHECKS = 4
export const NAME_CHECK_TTL_MS = 60 * 60 * 1000
const SEARCH_LIMIT = 30

export interface NameToCheck {
  displayName: string
  handle: string
  origin: 'ia' | 'creador'
}

export interface NameCheckDeps {
  youtube: Pick<YouTubeData, 'search' | 'checkHandle'>
  names: NamesRepo
  jobs: JobsService
  thresholds: NameThresholds
  logger: Logger
  now?: () => Date
}

export function createNameCheck({ youtube, names, jobs, thresholds, logger, now = () => new Date() }: NameCheckDeps) {
  const limit = createLimiter(MAX_NAME_CHECKS)

  const check = async (journeyId: string, name: NameToCheck): Promise<NameCheck> => {
    const [handle, search] = await Promise.all([
      youtube.checkHandle(name.handle),
      // Names look at titles and channels, so no dates: nothing else is asked to YouTube.
      youtube.search(name.displayName, { limit: SEARCH_LIMIT, withoutDates: true }),
    ])
    const handleStatus: StoredHandleStatus = handle.ok ? handle.value.data : 'sin_comprobar'
    // A search with no results is good news for a name, not a failure.
    const hits = search.ok ? search.value.data : !search.ok && search.failure.code === 'sin_datos' ? [] : null
    const findings = hits && nameFindings(name.displayName, hits)
    return names.record({
      journeyId,
      ...name,
      ...semaphoreOf({ displayName: name.displayName, handleStatus, findings }, thresholds),
      handleStatus,
      similarChannels: findings?.similarChannels ?? [],
      titleHits: findings?.titleHits ?? null,
    })
  }

  // A name looked at within the hour is not asked again, unless the check could not be done.
  const recent = (journeyId: string, { displayName, handle }: NameToCheck) =>
    names
      .listByJourney(journeyId)
      .findLast(
        (c) =>
          c.displayName === displayName &&
          c.handle === handle &&
          c.semaphore !== 'sin_comprobar' &&
          now().getTime() - Date.parse(c.checkedAt) < NAME_CHECK_TTL_MS,
      ) ?? null

  return {
    start(journeyId: string, list: readonly NameToCheck[]) {
      return jobs.start({ journeyId, kind: 'comprobar_nombres', total: list.length }, async (job) => {
        let done = 0
        await Promise.all(
          list.map((name) =>
            limit(async () => {
              let finished = recent(journeyId, name)
              if (!finished) {
                try {
                  finished = await check(journeyId, name)
                } catch (error) {
                  logger.error('name_check.failed', { error })
                  finished = names.record({
                    journeyId,
                    ...name,
                    semaphore: 'sin_comprobar',
                    reasons: ['fallo'],
                    handleStatus: 'sin_comprobar',
                    similarChannels: [],
                    titleHits: null,
                  })
                }
              }
              done += 1
              job.progress(done, list.length)
              job.item(finished)
            }),
          ),
        )
      })
    },
  }
}
export type NameCheckService = ReturnType<typeof createNameCheck>
