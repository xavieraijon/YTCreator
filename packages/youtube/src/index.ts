// YouTube adapters behind the YouTubeData port of @ytcreator/core: yt-dlp, Data API and fake.
export { createDataApiYouTube, type DataApiLimits } from './data-api/adapter.ts'
export { createFakeYouTube } from './fake/fake-youtube.ts'
export { createYouTubeAdapters, type YouTubeAdapters, type YouTubeRegistryOptions } from './registry.ts'
export { createYtDlpYouTube } from './ytdlp/adapter.ts'
