import { AI_RUN_FAILURES, type AiRunFailure, type EstimateView, type ScriptView } from '@ytcreator/core/api'
import type { ScriptUse } from '@ytcreator/core'
import { useCallback, useEffect, useState } from 'react'
import { scriptsApi } from '../../../api/client.ts'
import { useJob } from '../../../shell/useJob.ts'

const isAiFailure = (value: string | null): value is AiRunFailure =>
  (AI_RUN_FAILURES as readonly string[]).includes(value ?? '')

// What the button says it costs. An estimate is spent when used and lasts ten minutes, so `fresh` asks for another
// right before spending; the one on the button stays meanwhile, so it does not go off under a click.
export interface ScriptEstimate {
  readonly estimate: EstimateView | null
  readonly error: unknown
  readonly retry: () => void
  readonly fresh: () => Promise<EstimateView | null>
}

export function useEstimate(script: ScriptView, use: ScriptUse, enabled = true, blockId?: string): ScriptEstimate {
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const { id, updatedAt } = script
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    scriptsApi
      .estimate(id, { use, ...(blockId ? { blockId } : {}) }, { signal: controller.signal })
      .then((got) => {
        setEstimate(got)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause)
      })
    return () => controller.abort()
  }, [id, updatedAt, use, enabled, blockId, attempt])

  const fresh = useCallback(async () => {
    try {
      const got = await scriptsApi.estimate(id, { use, ...(blockId ? { blockId } : {}) })
      setEstimate(got)
      setError(null)
      return got
    } catch (cause) {
      setError(cause)
      return null
    }
  }, [id, use, blockId])

  return { estimate: enabled ? estimate : null, error, retry: () => setAttempt((n) => n + 1), fresh }
}

export interface ScriptAi {
  /** What the AI is doing now, if anything. */
  readonly working: string | null
  /** Says yes only with the price on the button: if it moved, the button shows the new one and nothing is spent. */
  readonly run: (use: ScriptUse, price: ScriptEstimate, instructions?: string, blockId?: string) => Promise<void>
  readonly priceChanged: boolean
  /** Hides what the last job left: something else has been done since. */
  readonly dismiss: () => void
  readonly failureFor: (use: ScriptUse) => AiRunFailure | null
  /** A job that ended badly for a reason that is not one of the AI's. */
  readonly otherFailure: boolean
}

// Generating runs in the server: leaving the screen only stops the watching, and coming back picks it up (R12).
export function useScriptAi(
  script: ScriptView | null,
  onFinished: (op: string, ok: boolean) => void,
  onError: (cause: unknown) => void,
): ScriptAi {
  const [jobId, setJobId] = useState<string | null>(null)
  const [op, setOp] = useState<string | null>(null)
  const [priceChanged, setPriceChanged] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const watch = useJob(jobId)
  const job = script?.job ?? null

  useEffect(() => {
    if (job?.status === 'en_curso') {
      setJobId(job.id)
      setOp(job.op)
    }
  }, [job?.id, job?.status, job?.op])

  useEffect(() => {
    if (!watch || watch.status === 'en_curso' || !op) return
    const finished = op
    const ok = watch.status === 'hecho'
    setJobId(null)
    setOp(null)
    onFinished(finished, ok)
  }, [watch, op, onFinished])

  const run = useCallback(
    async (use: ScriptUse, price: ScriptEstimate, instructions?: string, blockId?: string) => {
      if (!script) return
      const shown = price.estimate?.cents
      setPriceChanged(false)
      const estimate = await price.fresh()
      if (!estimate) return
      if (estimate.blockedBy || estimate.cents !== shown) {
        setPriceChanged(estimate.cents !== shown)
        return
      }
      try {
        const { jobId: started } = await scriptsApi.generate(script.id, {
          use,
          estimateId: estimate.estimateId,
          ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
          ...(blockId ? { blockId } : {}),
        })
        setOp(use)
        setJobId(started)
      } catch (cause) {
        onError(cause)
      }
    },
    [script, onError],
  )

  const ended =
    job && job.status !== 'en_curso' && job.status !== 'hecho' && !jobId && job.id !== dismissed ? job : null
  return {
    working: jobId ? op : null,
    run,
    priceChanged,
    dismiss: useCallback(() => setDismissed(job?.id ?? null), [job?.id]),
    failureFor: (use) => (ended?.op === use && isAiFailure(ended.failure) ? ended.failure : null),
    otherFailure: ended !== null && !isAiFailure(ended.failure),
  }
}
