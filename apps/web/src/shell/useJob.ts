import type { JobEvent } from '@ytcreator/core/api'
import { useEffect, useState } from 'react'
import { watchJob } from '../api/client.ts'

export interface JobWatch {
  readonly status: 'en_curso' | 'hecho' | 'fallido'
  readonly done: number
  readonly total: number
  readonly items: readonly unknown[]
  readonly failure: string | null
}

const START: JobWatch = { status: 'en_curso', done: 0, total: 0, items: [], failure: null }

export function jobReducer(watch: JobWatch, event: JobEvent): JobWatch {
  switch (event.type) {
    case 'progress':
      return { ...watch, done: event.done, total: event.total }
    case 'item':
      return { ...watch, items: [...watch.items, event.item] }
    case 'done':
      return { ...watch, status: 'hecho' }
    case 'failed':
      return { ...watch, status: 'fallido', failure: event.failure }
  }
}

// Follows a background job. Leaving the screen only stops the watching: the job goes on in the server.
export function useJob(jobId: string | null): JobWatch | null {
  const [watch, setWatch] = useState<{ jobId: string; state: JobWatch } | null>(null)
  useEffect(() => {
    if (!jobId) return undefined
    return watchJob(jobId, (event) =>
      setWatch((current) => ({
        jobId,
        state: jobReducer(current?.jobId === jobId ? current.state : START, event),
      })),
    )
  }, [jobId])
  if (!jobId) return null
  return watch?.jobId === jobId ? watch.state : START
}
