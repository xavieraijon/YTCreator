import { describe, expect, it } from 'vitest'
import { formatEuros, parseEuros } from '../src/screens/settings/euros.ts'

describe('parseEuros', () => {
  it.each([
    ['0,50', 50],
    ['0.5', 50],
    ['3', 300],
    ['20,00', 2000],
    [' 1000 € ', 100_000],
    ['0,07', 7],
    ['0,1', 10],
    ['0,29', 29],
    ['1,15', 115],
  ])('%s → %i cents, exactly', (text, cents) => {
    expect(parseEuros(text)).toBe(cents)
  })

  it.each(['', 'abc', '1,234', '-1', '1.000,00', ',5', '1,', '12345678'])('%s is not an amount', (text) => {
    expect(parseEuros(text)).toBeNull()
  })
})

describe('formatEuros', () => {
  it.each([
    [50, '0,50'],
    [300, '3,00'],
    [2000, '20,00'],
    [7, '0,07'],
    [100_000, '1000,00'],
  ])('%i cents → %s', (cents, text) => {
    expect(formatEuros(cents)).toBe(text)
  })

  it('round-trips with parseEuros', () => {
    for (const cents of [1, 29, 115, 99_999]) expect(parseEuros(formatEuros(cents))).toBe(cents)
  })
})
