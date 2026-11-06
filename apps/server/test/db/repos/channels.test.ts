import { beforeEach, describe, expect, it } from 'vitest'
import { createChannelsRepo, type ChannelsRepo } from '../../../src/db/repos/channels.ts'
import { freshDb } from './helpers.ts'

describe('channels repo', () => {
  let channels: ChannelsRepo

  beforeEach(() => {
    channels = createChannelsRepo(freshDb())
  })

  it('has no current channel at first', () => {
    expect(channels.getCurrent()).toBeNull()
  })

  it('creates a new channel with provisional name and Spanish defaults', () => {
    const channel = channels.create({ origin: 'nuevo' })
    expect(channel).toMatchObject({
      origin: 'nuevo',
      displayName: null,
      handle: null,
      nameStatus: 'provisional',
      youtubeChannelId: null,
      language: 'es',
      audienceRegion: 'espana',
      archivedAt: null,
    })
    expect(channels.getCurrent()?.id).toBe(channel.id)
  })

  it('creates an existing channel with its YouTube id and finds it by that id', () => {
    const channel = channels.create({
      origin: 'existente',
      youtubeChannelId: 'UC' + 'a'.repeat(22),
      displayName: 'Mi canal',
    })
    expect(channels.findByYouTubeId('UC' + 'a'.repeat(22))?.id).toBe(channel.id)
  })

  it('updates the name and the status', () => {
    const channel = channels.create({ origin: 'nuevo' })
    const updated = channels.update(channel.id, {
      displayName: 'Cocina lenta',
      handle: 'cocinalenta',
      nameStatus: 'elegido',
    })
    expect(updated).toMatchObject({ displayName: 'Cocina lenta', handle: 'cocinalenta', nameStatus: 'elegido' })
  })

  it('rejects a handle with forbidden characters', () => {
    const channel = channels.create({ origin: 'nuevo' })
    expect(() => channels.update(channel.id, { handle: 'con espacio' })).toThrow()
  })
})
