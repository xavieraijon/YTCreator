import { type Logger, type SecretStore, type YouTubeSource, Secret, secretRef } from '@ytcreator/core'
import { type YouTubeSettings, youtubeApiKeyBodySchema, youtubeSourceBodySchema } from '@ytcreator/core/api'
import type { KeyChecker } from '@ytcreator/youtube'
import { Hono } from 'hono'
import type { SettingsRepo } from '../../db/repos/settings.ts'
import type { JobsService } from '../../services/jobs.ts'
import type { ReaderUpdateResult } from '../../services/reader-update.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface YouTubeSettingsDeps {
  settings: SettingsRepo
  secrets: SecretStore
  checkKey: KeyChecker
  quota: { used(): number; limit: number; nearLimitRatio: number }
  effectiveSource: () => YouTubeSource
  readerVersion: () => string | null
  updateReader: () => Promise<ReaderUpdateResult>
  jobs: JobsService
  logger: Logger
}

// Where the key lives in the secret store. It never contains the creator's data.
export const YOUTUBE_KEY_REF = secretRef('youtube', 'data_api')

// Ajustes → YouTube (contracts/http-api.md). The key goes in and is checked; only its 4-character hint comes out.
export function youtubeSettingsRoutes(deps: YouTubeSettingsDeps) {
  const { settings, secrets, quota, logger } = deps
  const routes = new Hono()

  const view = (): YouTubeSettings => {
    const set = settings.get('youtube.api_key_ref') !== null
    const used = quota.used()
    return {
      source: settings.get('youtube.source') ?? 'auto',
      effectiveSource: deps.effectiveSource(),
      ytdlpVersion: deps.readerVersion(),
      apiKey: {
        set,
        hint: set ? settings.get('youtube.api_key_hint') : null,
        rejected: set && settings.get('youtube.api_key_rejected') === true,
      },
      // The units of the day only mean something with a key (FR-030).
      ...(set ? { quota: { used, limit: quota.limit, nearLimit: used >= quota.limit * quota.nearLimitRatio } } : {}),
    }
  }

  const forget = async () => {
    const removed = await secrets.delete(YOUTUBE_KEY_REF)
    if (!removed.ok) throw new ApiError({ code: 'interno' })
    settings.set('youtube.api_key_ref', null)
    settings.set('youtube.api_key_hint', null)
    settings.set('youtube.api_key_rejected', null)
  }

  routes.get('/', (c) => c.json(view()))

  routes.put('/source', async (c) => {
    const { source } = await parseBody(c, youtubeSourceBodySchema)
    // Always with the key needs a key YouTube takes.
    const usable = settings.get('youtube.api_key_ref') !== null && settings.get('youtube.api_key_rejected') !== true
    if (source === 'data_api' && !usable) throw new ApiError({ code: 'validacion', fields: { source: 'no_valido' } })
    settings.set('youtube.source', source)
    return c.json(view())
  })

  routes.put('/api-key', async (c) => {
    const { apiKey } = await parseBody(c, youtubeApiKeyBodySchema)
    const key = Secret.from(apiKey)
    const checked = await deps.checkKey(key)
    logger.info('youtube.key_check', { outcome: checked.ok ? 'ok' : checked.failure })
    if (!checked.ok) {
      const { failure } = checked
      if (failure === 'rechazada') throw new ApiError({ code: 'validacion', fields: { apiKey: 'no_valido' } })
      throw new ApiError({ code: 'youtube', youtubeFailure: failure })
    }
    const stored = await secrets.set(YOUTUBE_KEY_REF, key)
    if (!stored.ok) throw new ApiError({ code: 'interno' })
    settings.set('youtube.api_key_ref', YOUTUBE_KEY_REF)
    settings.set('youtube.api_key_hint', key.hint())
    settings.set('youtube.api_key_rejected', null)
    return c.json(view())
  })

  routes.delete('/api-key', async (c) => {
    await forget()
    return c.body(null, 204)
  })

  routes.post('/update-reader', (c) => {
    const job = deps.jobs.start({ journeyId: null, kind: 'actualizar_lector' }, async () => {
      const result = await deps.updateReader()
      logger.info(
        'youtube.reader_update',
        result.ok ? { outcome: 'ok', version: result.version } : { outcome: result.failure },
      )
      return result.ok ? undefined : { failure: result.failure }
    })
    return c.json({ jobId: job.id }, 202)
  })

  return routes
}
