import { z } from 'zod'
import { HANDLE_PATTERN } from '../channel/outputs.ts'
import { YOUTUBE_SOURCES } from '../youtube/port.ts'

const revision = z.number().int().nonnegative()
const channelInput = z.string().trim().min(1).max(500)

// POST /api/journeys/:id/measures
export const measuresBodySchema = z.object({
  revision,
  niches: z
    .array(z.object({ label: z.string().trim().min(1), queries: z.array(z.string().trim().min(1)).min(1).max(3) }))
    .min(1)
    .max(6),
  // «Volver a medir»: measures again what is already measured (FR-027).
  force: z.boolean().optional(),
})

// POST /api/journeys/:id/name-checks
export const nameChecksBodySchema = z.object({
  revision,
  names: z
    .array(
      z.object({
        displayName: z.string().trim().min(1).max(100),
        handle: z.string().regex(HANDLE_PATTERN),
        origin: z.enum(['ia', 'creador']),
      }),
    )
    .min(1),
})

// POST /api/journeys/:id/reading and /resolve
export const readingBodySchema = z.object({ revision, input: channelInput })
export const resolveBodySchema = z.object({ input: channelInput })
export const resolvedChannelSchema = z.object({
  channelId: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  subscribers: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
  fetchedAt: z.string(),
})
export type ResolvedChannel = z.infer<typeof resolvedChannelSchema>

// Ajustes → YouTube
export const YOUTUBE_SOURCE_SETTINGS = ['auto', 'ytdlp', 'data_api'] as const
export type YouTubeSourceSetting = (typeof YOUTUBE_SOURCE_SETTINGS)[number]

export const youtubeSettingsSchema = z.object({
  source: z.enum(YOUTUBE_SOURCE_SETTINGS),
  effectiveSource: z.enum(YOUTUBE_SOURCES),
  ytdlpVersion: z.string().nullable(),
  // `rejected`: YouTube stopped taking the key, so it is no longer used until another is saved (P15 a).
  apiKey: z.object({ set: z.boolean(), hint: z.string().length(4).nullable(), rejected: z.boolean() }),
  quota: z
    .object({
      used: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      nearLimit: z.boolean(),
    })
    .optional(),
})
export type YouTubeSettings = z.infer<typeof youtubeSettingsSchema>

export const youtubeSourceBodySchema = z.object({ source: z.enum(YOUTUBE_SOURCE_SETTINGS) })
export const youtubeApiKeyBodySchema = z.object({ apiKey: z.string().trim().min(1) })
