import { describe, expect, it } from 'vitest'
import { durationSeconds, expectedOutputTokens, wordCount } from '../../src/script/duration.ts'

describe('durationSeconds', () => {
  it('an empty text lasts nothing', () => {
    expect(durationSeconds('', 150)).toBe(0)
    expect(durationSeconds('   \n ', 150)).toBe(0)
  })

  it('counts words, not spaces', () => {
    expect(wordCount('uno  dos\n\ttres ')).toBe(3)
  })

  it('150 words at 150 a minute are 60 seconds', () => {
    expect(durationSeconds(Array(150).fill('palabra').join(' '), 150)).toBe(60)
  })

  it('goes with the pace of the channel', () => {
    expect(durationSeconds(Array(150).fill('palabra').join(' '), 100)).toBe(90)
  })
})

describe('expectedOutputTokens (R11)', () => {
  it('words × 1.6 × 1.3 plus 60 per block', () => {
    // 10 min at 150 = 1.500 words → 3.120 tokens, plus 6 blocks.
    expect(expectedOutputTokens(600, 150, 6)).toBe(3120 + 360)
  })

  it('rounds up', () => {
    expect(expectedOutputTokens(1, 150, 0)).toBe(6)
  })
})
