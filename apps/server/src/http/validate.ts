import type { FieldCode } from '@ytcreator/core/api'
import type { Context } from 'hono'
import type { z } from 'zod'
import { ApiError } from './errors.ts'

// The body as the schema reads it, or `400 validacion` with a code per field (never the value received).
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError({ code: 'validacion' })
  }
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  const fields: Record<string, FieldCode> = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path.join('.') || '_'
    const length = (issue.code === 'too_small' || issue.code === 'too_big') && issue.origin === 'string'
    fields[field] ??= length ? 'longitud_no_valida' : 'no_valido'
  }
  throw new ApiError({ code: 'validacion', fields })
}
