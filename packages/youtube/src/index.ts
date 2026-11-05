// YouTube adapters behind the YouTubeData port of @ytcreator/core: yt-dlp, Data API and fake.
export { createDataApiYouTube, type DataApiLimits } from './data-api/adapter.ts'
export { createFakeYouTube } from './fake/fake-youtube.ts'
export { checkDataApiKey, type KeyCheck } from './data-api/check-key.ts'
export { createFakeKeyCheck } from './data-api/fake-key-check.ts'
export {
  createKeyCheck,
  createYouTubeAdapters,
  type KeyChecker,
  type YouTubeAdapters,
  type YouTubeRegistryOptions,
} from './registry.ts'
export { createYtDlpYouTube } from './ytdlp/adapter.ts'
