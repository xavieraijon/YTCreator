import type { ConnectionKind } from '@ytcreator/core'
import { onboardingStateSchema, type OnboardingState, type WizardAction } from '@ytcreator/core/api'
import { useEffect, useSyncExternalStore } from 'react'
import { apiClient, ApiClientError } from '../api/client.ts'

export interface OnboardingSnapshot {
  readonly state: OnboardingState | null
  // Only while there is no state to show: a failed reload keeps the last one.
  readonly error: ApiClientError | null
}

let snapshot: OnboardingSnapshot = { state: null, error: null }
const listeners = new Set<() => void>()

function set(next: OnboardingSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

const asClientError = (error: unknown) =>
  error instanceof ApiClientError ? error : new ApiClientError('respuesta', null, null)

export async function reloadOnboarding(): Promise<void> {
  try {
    set({ state: await apiClient.get('/api/onboarding', onboardingStateSchema), error: null })
  } catch (error) {
    set({ state: snapshot.state, error: snapshot.state ? null : asClientError(error) })
  }
}

export type StepResult = { ok: true } | { ok: false; error: ApiClientError }

// With a 409 the state becomes the server's `current` and App moves to it: the screen shows nothing (two tabs).
export async function sendStep(action: WizardAction, kind?: ConnectionKind): Promise<StepResult> {
  const state = snapshot.state
  if (!state) return { ok: false, error: new ApiClientError('respuesta', null, null) }
  try {
    const body = { expectedRevision: state.revision, action, ...(kind ? { kind } : {}) }
    set({ state: await apiClient.post('/api/onboarding/step', body, onboardingStateSchema), error: null })
    return { ok: true }
  } catch (caught) {
    const error = asClientError(caught)
    if (error.body?.code === 'conflicto') {
      if (error.body.current) set({ state: error.body.current, error: null })
      else await reloadOnboarding()
    }
    return { ok: false, error }
  }
}

export const isConflict = (error: ApiClientError) => error.body?.code === 'conflicto'

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useOnboarding(): OnboardingSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot)
}

// Once, in App: the first load, and a reload whenever the tab comes back (another tab may have moved on).
export function useOnboardingSync(): void {
  useEffect(() => {
    void reloadOnboarding()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadOnboarding()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
