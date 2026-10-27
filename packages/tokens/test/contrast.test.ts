import { describe, expect, it } from 'vitest'
import { createContrastPairs } from '../src/contrast-pairs.ts'
import { composite, contrastRatio, parseOklch } from '../src/contrast.ts'
import { contrastMinimum, tokens } from '../src/index.ts'

const white = parseOklch('oklch(1 0 0)')
const black = parseOklch('oklch(0 0 0)')

describe('contrast maths', () => {
  it('white on black is 21:1 and the ratio is symmetric', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })

  it('converts OKLCH to sRGB', () => {
    // neutral-500 ≈ #717178 (research R2)
    const { r, g, b } = parseOklch('oklch(0.55 0.012 285)')
    expect([r, g, b].map((channel) => Math.round(channel * 255))).toEqual([0x71, 0x71, 0x78])
  })

  it('composites a translucent colour over its backdrop', () => {
    const half = composite(parseOklch('oklch(0 0 0 / 0.5)'), white)
    expect(half.alpha).toBe(1)
    expect(half.r).toBeCloseTo(0.5, 5)
  })
})

describe('documented pairs (SC-001)', () => {
  const pairs = createContrastPairs(tokens)

  it('there are pairs to check', () => {
    expect(pairs.length).toBeGreaterThan(0)
  })

  it.each(pairs.map((pair) => [`${pair.foreground} sobre ${pair.background}`, pair] as const))(
    '%s cumple el mínimo en los dos temas',
    (_, pair) => {
      const minimum = contrastMinimum[pair.kind]
      for (const theme of ['light', 'dark'] as const) {
        expect(
          pair.ratio[theme],
          `${pair.foreground} sobre ${pair.background} (tema ${theme}): ${pair.ratio[theme]}:1, mínimo ${minimum}:1`,
        ).toBeGreaterThanOrEqual(minimum)
      }
      expect(pair.allowed).toBe(true)
    },
  )
})
