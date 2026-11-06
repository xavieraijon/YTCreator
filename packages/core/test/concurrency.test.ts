import { describe, expect, it } from 'vitest'
import { createLimiter, mapLimit } from '../src/concurrency.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('concurrency limiter', () => {
  it('never runs more than N tasks at once', async () => {
    const limit = createLimiter(3)
    let running = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        limit(async () => {
          running++
          peak = Math.max(peak, running)
          await tick()
          running--
        }),
      ),
    )
    expect(peak).toBe(3)
  })

  it('keeps the order of results and goes on after a failure', async () => {
    const results = await mapLimit([3, 1, 2, 0], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n))
      if (n === 1) throw new Error('falla')
      return n * 10
    })
    expect(results).toEqual([
      { ok: true, value: 30 },
      { ok: false, error: new Error('falla') },
      { ok: true, value: 20 },
      { ok: true, value: 0 },
    ])
  })

  it('a rejected task frees its slot', async () => {
    const limit = createLimiter(1)
    await expect(limit(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(limit(async () => 'sigue')).resolves.toBe('sigue')
  })
})
