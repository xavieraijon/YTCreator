import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { es } from './es.ts'
import type { UiStrings, UiStringsOverride } from './types.ts'

const UiStringsContext = createContext<UiStrings>(es)

/** Deep merge of an override onto a full catalog: keys left out keep their value. */
export function mergeStrings(base: UiStrings, override: UiStringsOverride): UiStrings {
  const merged: Record<string, unknown> = { ...base }
  for (const [group, values] of Object.entries(override)) {
    merged[group] = { ...base[group as keyof UiStrings], ...values }
  }
  return merged as unknown as UiStrings
}

export interface UiStringsProviderProps {
  readonly strings?: UiStringsOverride
  readonly children: ReactNode
}

/** Replaces some or all of the internal texts of the components below it. Nested providers stack. */
export function UiStringsProvider({ strings = {}, children }: UiStringsProviderProps) {
  const parent = useContext(UiStringsContext)
  const value = useMemo(() => mergeStrings(parent, strings), [parent, strings])
  return <UiStringsContext value={value}>{children}</UiStringsContext>
}

export function useUiStrings(): UiStrings {
  return useContext(UiStringsContext)
}
