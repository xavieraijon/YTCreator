import type { PublishUse } from '@ytcreator/core'
import { AI_RUN_FAILURES, type AiRunFailure, type EstimateView, type PackageView } from '@ytcreator/core/api'
import { useCallback, useEffect, useState } from 'react'
import { packagesApi } from '../../../api/client.ts'
import { useJob } from '../../../shell/useJob.ts'

const isAiFailure = (value: string | null): value is AiRunFailure =>
  (AI_RUN_FAILURES as readonly string[]).includes(value ?? '')

// What the button says it costs, as in the script (005): `fresh` asks again right before spending.
export interface PackageEstimate {
  readonly estimate: EstimateView | null
  readonly error: unknown
  readonly retry: () => void
  readonly fresh: () => Promise<EstimateView | null>
}

export function usePackageEstimate(pkg: PackageView, use: PublishUse, enabled = true): PackageEstimate {
  const [estimate, setEstimate] = useState<EstimateView | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const { id, updatedAt } = pkg
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    packagesApi
      .estimate(id, { use }, { signal: controller.signal })
      .then((got) => {
        setEstimate(got)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause)
      })
    return () => controller.abort()
  }, [id, updatedAt, use, enabled, attempt])

  const fresh = useCallback(async () => {
    try {
      const got = await packagesApi.estimate(id, { use })
      setEstimate(got)
      setError(null)
      return got
    } catch (cause) {
      setError(cause)
      return null
    }
  }, [id, use])

  return { estimate: enabled ? estimate : null, error, retry: () => setAttempt((n) => n + 1), fresh }
}

export interface PackageAi {
  readonly working: PublishUse | null
  readonly run: (use: PublishUse, price: PackageEstimate, instructions?: string) => Promise<void>
  readonly priceChanged: boolean
  readonly dismiss: () => void
  readonly failureFor: (use: PublishUse) => AiRunFailure | null
  readonly otherFailure: boolean
}

// Generating runs in the server: leaving the screen only stops the watching, and coming back picks it up (FR-020).
export function usePackageAi(
  pkg: PackageView | null,
  onFinished: (op: string, ok: boolean) => void,
  onError: (cause: unknown) => void,
): PackageAi {
  const [jobId, setJobId] = useState<string | null>(null)
  const [op, setOp] = useState<PublishUse | null>(null)
  const [priceChanged, setPriceChanged] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const watch = useJob(jobId)
  const job = pkg?.job ?? null

  useEffect(() => {
    if (job?.status === 'en_curso') {
      setJobId(job.id)
      setOp(job.op as PublishUse)
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
    async (use: PublishUse, price: PackageEstimate, instructions?: string) => {
      if (!pkg) return
      const shown = price.estimate?.cents
      setPriceChanged(false)
      const estimate = await price.fresh()
      if (!estimate) return
      if (estimate.blockedBy || estimate.cents !== shown) {
        setPriceChanged(estimate.cents !== shown)
        return
      }
      try {
        const { jobId: started } = await packagesApi.generate(pkg.id, {
          use,
          estimateId: estimate.estimateId,
          ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
        })
        setOp(use)
        setJobId(started)
      } catch (cause) {
        onError(cause)
      }
    },
    [pkg, onError],
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
