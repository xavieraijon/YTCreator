import { AiWorking, Button } from '@ytcreator/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { es } from '../strings/es.ts'
import styles from './AiWork.module.css'

// After this long a wait gets a «Cancelar» (contracts/ui-screens.md, «Trabajo de la IA»).
export const SLOW_MS = 5000

export interface AiWorkState {
  readonly label: string
  readonly slow: boolean
}

// One AI wait at a time per screen: a check, a login. Cancelling (or leaving the screen) aborts the request.
export function useAiWork() {
  const [work, setWork] = useState<AiWorkState | null>(null)
  const current = useRef<AbortController | null>(null)

  useEffect(() => () => current.current?.abort(), [])

  const run = useCallback(async <T,>(label: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    setWork({ label, slow: false })
    const timer = setTimeout(() => {
      if (current.current === controller) setWork({ label, slow: true })
    }, SLOW_MS)
    try {
      return await task(controller.signal)
    } finally {
      clearTimeout(timer)
      if (current.current === controller) {
        current.current = null
        setWork(null)
      }
    }
  }, [])

  const cancel = useCallback(() => current.current?.abort(), [])

  return { work, run, cancel }
}

export function AiWorkStatus({ work, onCancel }: { work: AiWorkState | null; onCancel: () => void }) {
  if (!work) return null
  return (
    <div className={styles.work}>
      <AiWorking label={work.label} variant="inline" />
      {work.slow && (
        <Button variant="secondary" onClick={onCancel}>
          {es.aiWork.cancel}
        </Button>
      )}
    </div>
  )
}
