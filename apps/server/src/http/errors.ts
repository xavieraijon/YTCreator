import { type ApiErrorBody, HTTP_STATUS_BY_CODE } from '@ytcreator/core/api'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Thrown by routes; createApp turns it into the HTTP code of contracts/http-api.md.
export class ApiError extends Error {
  readonly body: ApiErrorBody['error']
  // Only where the contract gives a code two statuses: `sin_audio` is 409 to recognize and 404 to read it (007).
  private readonly statusOverride: ContentfulStatusCode | undefined

  constructor(body: ApiErrorBody['error'], { status }: { status?: ContentfulStatusCode } = {}) {
    super(body.code)
    this.body = body
    this.statusOverride = status
  }

  get status(): ContentfulStatusCode {
    return this.statusOverride ?? (HTTP_STATUS_BY_CODE[this.body.code] as ContentfulStatusCode)
  }
}
