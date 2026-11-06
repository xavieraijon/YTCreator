import type { Secret, YouTubeData } from '@ytcreator/core'
import { createDataApiYouTube, type DataApiLimits } from './data-api/adapter.ts'
import { checkDataApiKey, type KeyCheck } from './data-api/check-key.ts'
import { createFakeKeyCheck } from './data-api/fake-key-check.ts'
import { createFakeYouTube } from './fake/fake-youtube.ts'
import { createYtDlpYouTube } from './ytdlp/adapter.ts'

export interface YouTubeRegistryOptions {
  env: Record<string, string | undefined>
  // <app data>/bin/yt-dlp, where the installer leaves it.
  binPath: string
  fetch: typeof globalThis.fetch
  getKey: () => Promise<Secret | null>
  quota: { used(): number; add(units: number): void }
  limits: DataApiLimits
  now?: () => Date
  // Only narrows what the build allows, like the AI registry.
  allowFake?: boolean
  onKeyRejected?: (hint: string) => void
}

export type YouTubeAdapters = { fake: YouTubeData } | { ytdlp: YouTubeData; dataApi: YouTubeData }

// With `YTCREATOR_FAKE_YOUTUBE=1` (and only in a build that allows it) nothing touches the network or a binary.
export function createYouTubeAdapters({
  env,
  binPath,
  fetch,
  getKey,
  quota,
  limits,
  now,
  allowFake = true,
  onKeyRejected,
}: YouTubeRegistryOptions): YouTubeAdapters {
  if (__YTC_ALLOW_FAKE_AI__ && allowFake && env.YTCREATOR_FAKE_YOUTUBE === '1') {
    return { fake: createFakeYouTube(now ? { now } : {}) }
  }
  return {
    ytdlp: createYtDlpYouTube({ binPath, fetch, ...(now ? { now } : {}) }),
    dataApi: createDataApiYouTube({
      fetch,
      getKey,
      quota,
      limits,
      ...(now ? { now } : {}),
      ...(onKeyRejected ? { onKeyRejected } : {}),
    }),
  }
}

export type KeyChecker = (key: Secret) => Promise<KeyCheck>

// The check of a key before it is kept: with the fake YouTube, the fake check (no network).
export function createKeyCheck({
  env,
  fetch,
  limits,
  allowFake = true,
}: Pick<YouTubeRegistryOptions, 'env' | 'fetch' | 'limits' | 'allowFake'>): KeyChecker {
  if (__YTC_ALLOW_FAKE_AI__ && allowFake && env.YTCREATOR_FAKE_YOUTUBE === '1') return createFakeKeyCheck()
  return (key) => checkDataApiKey(key, { fetch, limits })
}
