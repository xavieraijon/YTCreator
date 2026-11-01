import {
  type HandleStatus,
  type Sourced,
  type YouTubeResult,
  isValidHandle,
  youtubeFailure,
} from '@ytcreator/core'

// Both adapters check a handle the same way: the public @handle page, with no key and no units (spike S2).
export async function checkHandleAt(
  fetch: typeof globalThis.fetch,
  handle: string,
  signal: AbortSignal,
  sourced: (status: HandleStatus) => YouTubeResult<Sourced<HandleStatus>>,
): Promise<YouTubeResult<Sourced<HandleStatus>>> {
  if (!isValidHandle(handle)) return youtubeFailure('no_encontrado')
  try {
    const response = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      method: 'GET',
      redirect: 'manual',
      signal,
    })
    // 404 means nobody has it, 200 means taken. Anything else is not an answer.
    if (response.status === 404) return sourced('libre')
    if (response.status === 200) return sourced('ocupado')
    if (response.status === 429) return youtubeFailure('bloqueado')
    return youtubeFailure('no_disponible')
  } catch (error) {
    return youtubeFailure(isTimeout(error) ? 'tiempo_agotado' : 'no_disponible')
  }
}

export function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}
