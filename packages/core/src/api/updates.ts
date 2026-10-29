import { z } from 'zod'

export const updateInfoSchema = z.object({
  current: z.string(),
  latest: z.string().nullable(),
  show: z.boolean(),
})
export type UpdateInfo = z.infer<typeof updateInfoSchema>

export const dismissBodySchema = z.object({ version: z.string().min(1) })

export const healthSchema = z.object({ app: z.literal('ytcreator'), version: z.string(), instanceId: z.string() })
export type Health = z.infer<typeof healthSchema>

export const shutdownResponseSchema = z.object({})
