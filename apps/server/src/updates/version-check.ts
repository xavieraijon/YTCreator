import type { Logger } from '@ytcreator/core'
import type { SettingsRepo } from '../db/repos/settings.ts'

export interface VersionCheckDeps {
  fetch: typeof fetch
  now: () => Date
  settings: SettingsRepo
  logger: Logger
  // The latest release's static files (installer/install.sh's own YTCREATOR_RELEASE_BASE).
  releaseBase: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 10_000

// Once a day at most, asks the release base for the plain-text `VERSION` of the latest release. No creator data
// leaves the machine (FR-009b, FR-031): a bare GET with a fixed User-Agent, nothing else. A failure, of any kind,
// is only logged — the check still counts for the day, so a down server isn't retried on every call.
export function createVersionCheck({ fetch, now, settings, logger, releaseBase }: VersionCheckDeps) {
  return {
    async run(): Promise<void> {
      if (settings.get('update_check_enabled') === false) return
      const lastCheck = settings.get('last_update_check_at')
      if (lastCheck !== null && now().getTime() - new Date(lastCheck).getTime() < DAY_MS) return

      try {
        const response = await fetch(`${releaseBase}/VERSION`, {
          headers: { 'User-Agent': 'YTCreator' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.ok) {
          const version = (await response.text()).trim()
          settings.set('latest_version', version)
        } else {
          logger.warn('version_check.failed', { status: response.status })
        }
      } catch (error) {
        logger.warn('version_check.failed', { error })
      } finally {
        settings.set('last_update_check_at', now().toISOString())
      }
    },
  }
}

export type VersionCheck = ReturnType<typeof createVersionCheck>
