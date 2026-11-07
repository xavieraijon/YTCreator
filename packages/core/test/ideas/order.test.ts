import { describe, expect, it } from 'vitest'
import { checkOrder, moveAmong, moveDown, moveUp } from '../../src/ideas/order.ts'

describe('the order of the bank and the queue (data-model.md)', () => {
  it('checkOrder: the same ideas, each once', () => {
    expect(checkOrder(['b', 'a', 'c'], ['a', 'b', 'c'])).toBe(true)
    expect(checkOrder(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(checkOrder(['a', 'b', 'c', 'd'], ['a', 'b', 'c'])).toBe(false)
    expect(checkOrder(['a', 'a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(checkOrder(['a', 'b', 'x'], ['a', 'b', 'c'])).toBe(false)
    expect(checkOrder([], [])).toBe(true)
  })

  it('moveUp and moveDown move one place and stop at the edges', () => {
    expect(moveUp(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(moveDown(['a', 'b', 'c'], 'b')).toEqual(['a', 'c', 'b'])
    expect(moveUp(['a', 'b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
    expect(moveDown(['a', 'b', 'c'], 'c')).toEqual(['a', 'b', 'c'])
    expect(moveUp(['a', 'b'], 'x')).toEqual(['a', 'b'])
  })

  it('moveAmong passes the idea seen next to it, and the hidden ones keep their places', () => {
    const all = ['a', 'x', 'b', 'y', 'c']
    expect(moveAmong(all, ['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'x', 'y', 'c'])
    expect(moveAmong(all, ['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'x', 'y', 'c', 'b'])
    expect(moveAmong(all, ['a', 'b', 'c'], 'a', 'up')).toEqual(all)
    expect(moveAmong(all, ['a', 'b', 'c'], 'c', 'down')).toEqual(all)
    expect(moveAmong(['a', 'b', 'c'], ['a', 'b', 'c'], 'b', 'up')).toEqual(moveUp(['a', 'b', 'c'], 'b'))
  })
})
