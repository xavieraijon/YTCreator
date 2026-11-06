import { describe, expect, it } from 'vitest'
import { CHANNEL_HANDLE_PATTERN, isChannelId, isValidHandle, parseChannelInput } from '../../src/youtube/handle.ts'

const ID = 'UCabcdefghijklmnopqrstuv'

describe('parseChannelInput', () => {
  it.each([
    ['https://www.youtube.com/@cocina.facil', 'cocina.facil'],
    ['youtube.com/@cocina_facil/videos', 'cocina_facil'],
    ['https://m.youtube.com/@Cocina-Facil?si=x', 'Cocina-Facil'],
    ['@cocinafacil', 'cocinafacil'],
    ['  cocinafacil  ', 'cocinafacil'],
  ])('reads a handle from %s', (input, handle) => {
    expect(parseChannelInput(input)).toEqual({ kind: 'handle', handle })
  })

  it.each([
    ['https://www.youtube.com/user/Vsauce/videos', 'user', 'Vsauce'],
    ['youtube.com/c/veritasium', 'c', 'veritasium'],
    ['https://m.youtube.com/c/Ni%C3%B1osCanal', 'c', 'NiñosCanal'],
  ] as const)('reads an old link %s (entry 144)', (input, path, name) => {
    expect(parseChannelInput(input)).toEqual({ kind: 'legacy', path, name })
  })

  it('an old link without a name, or with one that cannot be, is nothing', () => {
    expect(parseChannelInput('https://www.youtube.com/c/')).toBeNull()
    expect(parseChannelInput('https://www.youtube.com/user/a%ZZ')).toBeNull()
    expect(parseChannelInput('https://www.youtube.com/c/a b')).toBeNull()
  })

  it('reads a channel id link', () => {
    expect(parseChannelInput(`https://www.youtube.com/channel/${ID}`)).toEqual({ kind: 'channel', channelId: ID })
    expect(parseChannelInput(ID)).toEqual({ kind: 'channel', channelId: ID })
  })

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('reads a video link %s', (input, videoId) => {
    expect(parseChannelInput(input)).toEqual({ kind: 'video', videoId })
  })

  it.each(['', '@ab', 'https://example.com/@cocina', 'con espacios', '@' + 'a'.repeat(31)])('rejects %s', (input) => {
    expect(parseChannelInput(input)).toBeNull()
  })
})

describe('handle and channel id rules', () => {
  it('handles have 3–30 chars of [A-Za-z0-9._-] and no @', () => {
    expect(isValidHandle('abc')).toBe(true)
    expect(isValidHandle('a'.repeat(30))).toBe(true)
    expect(isValidHandle('ab')).toBe(false)
    expect(isValidHandle('a'.repeat(31))).toBe(false)
    expect(isValidHandle('@abc')).toBe(false)
    expect(isValidHandle('ñandú')).toBe(false)
    expect(CHANNEL_HANDLE_PATTERN.test('ñandú')).toBe(true)
    expect(CHANNEL_HANDLE_PATTERN.test('n\u0303andu\u0301')).toBe(true)
    expect(CHANNEL_HANDLE_PATTERN.test('con espacio')).toBe(false)
    expect(CHANNEL_HANDLE_PATTERN.test('a/b/c')).toBe(false)
  })

  it('channel ids start with UC and have 24 chars', () => {
    expect(isChannelId(ID)).toBe(true)
    expect(isChannelId('UCshort')).toBe(false)
    expect(isChannelId('XX' + ID.slice(2))).toBe(false)
  })
})
