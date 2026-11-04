// Small concurrency limiter: yt-dlp processes and handle checks never pile up (research R5).
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(max: number): Limiter {
  let running = 0
  const queue: (() => void)[] = []
  const release = () => {
    running--
    queue.shift()?.()
  }
  return async (task) => {
    if (running >= max) await new Promise<void>((resolve) => queue.push(resolve))
    running++
    try {
      return await task()
    } finally {
      release()
    }
  }
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

// Runs fn over every item with at most `max` at once; results keep the input order and a failure stops nothing.
export async function mapLimit<I, T>(
  items: readonly I[],
  max: number,
  fn: (item: I) => Promise<T>,
): Promise<Settled<T>[]> {
  const limit = createLimiter(max)
  return Promise.all(
    items.map((item) =>
      limit(() => fn(item)).then(
        (value): Settled<T> => ({ ok: true, value }),
        (error: unknown): Settled<T> => ({ ok: false, error }),
      ),
    ),
  )
}
