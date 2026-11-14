import type { SpeechRecognizer } from '@ytcreator/core'
import { Hono } from 'hono'
import type { SubtitlesService } from '../../services/subtitles.ts'

export interface SubtitleRoutesDeps {
  service: SubtitlesService
  /** The real engine or, in a build that allows it, the fake one (`YTCREATOR_FAKE_SPEECH`). */
  recognizer: SpeechRecognizer
}

// The subtitles of a script (specs/007-subtitles/contracts/http-api.md). The rest of the routes come with each story.
export function subtitleRoutes({ service }: SubtitleRoutesDeps) {
  const routes = new Hono()

  routes.get('/scripts/:id/subtitles', (c) => c.json(service.view(c.req.param('id'))))

  return routes
}
