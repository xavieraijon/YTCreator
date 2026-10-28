import { type ApiErrorBody, HTTP_STATUS_BY_CODE } from '@ytcreator/core/api'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Thrown by routes; createApp turns it into the HTTP code of contracts/http-api.md.
export class ApiError extends Error {
  readonly body: ApiErrorBody['error']

  constructor(body: ApiErrorBody['error']) {
    super(body.code)
    this.body = body
  }

  get status(): ContentfulStatusCode {
    return HTTP_STATUS_BY_CODE[this.body.code] as ContentfulStatusCode
  }
}
