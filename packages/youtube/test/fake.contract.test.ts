import { describe, expect, it } from 'vitest'
import { createFakeYouTube } from '../src/fake/fake-youtube.ts'
import { CHANNEL_30 } from '../src/fake/scenarios.ts'
import { INPUTS, runYouTubeContract } from './contract/battery.ts'

runYouTubeContract('fake', (stub) => createFakeYouTube(stub === 'normal' ? {} : { failure: stub }))

describe('fake YouTube', () => {
  it('has the channel of 30 videos the battery points at', async () => {
    const yt = createFakeYouTube()
    expect(CHANNEL_30.info.channelId).toBe(INPUTS.channelId)
    const videos = await yt.listChannelVideos(INPUTS.channelId, { limit: 200 })
    expect(videos.ok && videos.value.data).toHaveLength(30)
  })

  it('has dates only for the newest videos and some shorts', async () => {
    const yt = createFakeYouTube()
    const videos = await yt.listChannelVideos(INPUTS.channelId, { limit: 200 })
    if (!videos.ok) throw new Error('expected ok')
    expect(videos.value.data.filter((v) => v.publishedAt !== null)).toHaveLength(15)
    expect(videos.value.data.some((v) => v.isShort)).toBe(true)
  })

  it('treats any handle that starts with «ocupad» as taken', async () => {
    const yt = createFakeYouTube()
    const result = await yt.checkHandle('ocupadisimo')
    expect(result.ok && result.value.data).toBe('ocupado')
  })

  it('stamps the time it is given', async () => {
    const yt = createFakeYouTube({ now: () => new Date('2026-11-01T09:00:00Z') })
    const result = await yt.search('cocina', { limit: 3 })
    expect(result.ok && result.value.fetchedAt).toBe('2026-11-01T09:00:00.000Z')
  })
})
