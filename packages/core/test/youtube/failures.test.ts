import { describe, expect, it } from 'vitest'
import { YOUTUBE_FAILURES, youtubeFailure, type YouTubeResult } from '../../src/youtube/failures.ts'

describe('YouTube failures', () => {
  it('has exactly the six codes of the contract', () => {
    expect([...YOUTUBE_FAILURES]).toEqual([
      'sin_datos',
      'no_encontrado',
      'bloqueado',
      'cupo_agotado',
      'tiempo_agotado',
      'no_disponible',
    ])
  })

  it('builds the {ok:false, failure} shape', () => {
    const result: YouTubeResult<number> = youtubeFailure('bloqueado')
    expect(result).toEqual({ ok: false, failure: { code: 'bloqueado' } })
  })
})
