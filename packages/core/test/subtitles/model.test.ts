import { describe, expect, it } from 'vitest'
import {
  CUE_FLAGS,
  cueSchema,
  heardWordSchema,
  replacementSchema,
  SUBTITLE_ORIGINS,
  subtitlesContentSchema,
} from '../../src/subtitles/model.ts'

const cue = (extra: object = {}) => ({
  id: 'c1',
  start: 0,
  end: 1.5,
  text: 'Hola',
  flags: [],
  heard: null,
  reviewed: false,
  ...extra,
})
const word = (extra: object = {}) => ({ text: 'Hola', start: 0, end: 0.4, p: 0.9, ...extra })
const content = (cues: object[], extra: object = {}) => ({ cues, words: [word()], audioSeconds: 10, ...extra })
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('enums (data-model.md)', () => {
  it('has the origins and flags of the data model', () => {
    expect(SUBTITLE_ORIGINS).toEqual(['reconocimiento', 'edicion', 'ia', 'recuperada', 'reaplicada'])
    expect(CUE_FLAGS).toEqual(['del_guion', 'poca_seguridad', 'cambio_ia'])
  })
})

describe('a cue', () => {
  it('takes an id, its times, text, flags and whether it was reviewed', () => {
    expect(ok(cueSchema, cue())).toBe(true)
    expect(ok(cueSchema, cue({ id: '' }))).toBe(false)
    expect(ok(cueSchema, cue({ reviewed: 'no' }))).toBe(false)
  })

  it('starts before it ends, never below 0, in seconds with up to 3 decimals', () => {
    expect(ok(cueSchema, cue({ start: 1.234, end: 2.5 }))).toBe(true)
    expect(ok(cueSchema, cue({ start: 2, end: 2 }))).toBe(false)
    expect(ok(cueSchema, cue({ start: 3, end: 2 }))).toBe(false)
    expect(ok(cueSchema, cue({ start: -0.1 }))).toBe(false)
    expect(ok(cueSchema, cue({ start: 0.0001 }))).toBe(false)
  })

  it('has text: not empty, and up to 2 lines separated by \\n', () => {
    expect(ok(cueSchema, cue({ text: 'Una línea\nOtra línea' }))).toBe(true)
    expect(ok(cueSchema, cue({ text: '' }))).toBe(false)
    expect(ok(cueSchema, cue({ text: '   ' }))).toBe(false)
    expect(ok(cueSchema, cue({ text: 'Una\nDos\nTres' }))).toBe(false)
  })

  it('only takes the flags of its enum, without repeating them', () => {
    expect(ok(cueSchema, cue({ flags: ['poca_seguridad'] }))).toBe(true)
    expect(ok(cueSchema, cue({ flags: ['lectura_rapida'] }))).toBe(false)
    expect(ok(cueSchema, cue({ flags: ['poca_seguridad', 'poca_seguridad'] }))).toBe(false)
  })

  it('keeps what was heard when the script or the AI changed it', () => {
    expect(ok(cueSchema, cue({ flags: ['del_guion'], heard: 'ola' }))).toBe(true)
    expect(ok(cueSchema, cue({ flags: ['cambio_ia'], heard: 'hola' }))).toBe(true)
    expect(ok(cueSchema, cue({ flags: ['del_guion'], heard: null }))).toBe(false)
    expect(ok(cueSchema, cue({ flags: ['cambio_ia'] }))).toBe(false)
  })
})

describe('a heard word', () => {
  it('has text, times and a probability from 0 to 1', () => {
    expect(ok(heardWordSchema, word())).toBe(true)
    expect(ok(heardWordSchema, word({ p: 0 }))).toBe(true)
    expect(ok(heardWordSchema, word({ p: 1.2 }))).toBe(false)
    expect(ok(heardWordSchema, word({ p: -0.1 }))).toBe(false)
    expect(ok(heardWordSchema, word({ start: 1, end: 0.5 }))).toBe(false)
    expect(ok(heardWordSchema, word({ text: '' }))).toBe(false)
  })
})

describe('the subtitles of a version', () => {
  it('holds the cues, the heard words and the audio length', () => {
    expect(ok(subtitlesContentSchema('largo'), content([cue()]))).toBe(true)
    expect(ok(subtitlesContentSchema('largo'), content([]))).toBe(true)
  })

  it('keeps every cue within the audio: 0 ≤ start < end ≤ audioSeconds', () => {
    expect(ok(subtitlesContentSchema('largo'), content([cue({ start: 9, end: 10 })]))).toBe(true)
    expect(ok(subtitlesContentSchema('largo'), content([cue({ start: 9, end: 10.5 })]))).toBe(false)
  })

  it('keeps the cues in order of start and with different ids', () => {
    const second = cue({ id: 'c2', start: 2, end: 3 })
    expect(ok(subtitlesContentSchema('largo'), content([cue(), second]))).toBe(true)
    expect(ok(subtitlesContentSchema('largo'), content([second, cue()]))).toBe(false)
    expect(ok(subtitlesContentSchema('largo'), content([cue(), { ...second, id: 'c1' }]))).toBe(false)
  })

  it('in a Short, one line per cue', () => {
    expect(ok(subtitlesContentSchema('short'), content([cue({ text: 'Una línea' })]))).toBe(true)
    expect(ok(subtitlesContentSchema('short'), content([cue({ text: 'Una\nDos' })]))).toBe(false)
  })
})

describe('a replacement in every cue (FR-009)', () => {
  it('changes one non-empty text for another, different one', () => {
    expect(ok(replacementSchema, { from: 'ola', to: 'hola' })).toBe(true)
    expect(ok(replacementSchema, { from: '', to: 'hola' })).toBe(false)
    expect(ok(replacementSchema, { from: 'hola', to: '' })).toBe(false)
    expect(ok(replacementSchema, { from: 'hola', to: 'hola' })).toBe(false)
  })
})
