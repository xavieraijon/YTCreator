import { aiOverviewSchema, type AiOverview } from '@ytcreator/core/api'
import { useEffect, useSyncExternalStore } from 'react'
import { apiClient } from '../api/client.ts'

// `GET /api/ai`, shared by the header badge and the screens that change a connection.
let overview: AiOverview | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

export function reloadAi(): Promise<void> {
  loading ??= apiClient
    .get('/api/ai', aiOverviewSchema)
    .then((next) => {
      overview = next
      listeners.forEach((listener) => listener())
    })
    // The badge keeps what it had: a failed reload is not worth an error of its own.
    .catch(() => undefined)
    .finally(() => {
      loading = null
    })
  return loading
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useAiOverview(): AiOverview | null {
  const value = useSyncExternalStore(subscribe, () => overview)
  useEffect(() => {
    if (!overview) void reloadAi()
  }, [])
  return value
}
