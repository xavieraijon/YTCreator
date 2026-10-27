import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { Toast as RadixToast } from 'radix-ui'
import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { Button } from '../Button/index.ts'
import { IconButton } from '../IconButton/index.ts'
import styles from './Toast.module.css'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastOptions {
  readonly title: string
  readonly description?: string
  readonly tone?: ToastTone
  /** A toast with an action stays until it is closed: the user needs time to reach it (WCAG 2.2.1). */
  readonly action?: { readonly label: string; readonly onClick: () => void }
  /**
   * Milliseconds on screen, or `'persistent'` to stay until closed. Leave it out to follow the rules of FR-012a:
   * confirmations go away on their own; warnings, errors and toasts with an action stay.
   */
  readonly duration?: number | 'persistent'
}

interface ToastEntry extends ToastOptions {
  readonly id: number
  readonly open: boolean
  readonly paused: boolean
}

const toneIcons: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
}

/** Up to three at once; older ones wait their turn. */
const maxVisible = 3

/** Tones that ask for attention: they stay until the user closes them. */
const persistentTones: ReadonlySet<ToastTone> = new Set(['warning', 'danger'])

/** Time on screen in ms, `Infinity` when it stays. A confirmation gets 5 s plus 50 ms per character, up to 12 s. */
export function toastDuration({ title, description = '', tone = 'info', action, duration }: ToastOptions): number {
  if (duration === 'persistent') return Infinity
  if (duration !== undefined) return duration
  if (action || persistentTones.has(tone)) return Infinity
  return Math.min(12_000, 5000 + 50 * (title.length + description.length))
}

const ToastContext = createContext<{ toast: (options: ToastOptions) => void } | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}

/** Hosts the toast region. F8 moves the focus to it. Put it once, near the root. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const strings = useUiStrings().toast
  const [entries, setEntries] = useState<readonly ToastEntry[]>([])

  const toast = useCallback((options: ToastOptions) => {
    setEntries((current) => [...current, { ...options, id: Date.now() + Math.random(), open: true, paused: false }])
  }, [])
  const update = (id: number, change: Partial<ToastEntry>) =>
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  const close = (id: number) => update(id, { open: false })
  const remove = (id: number) => setEntries((current) => current.filter((entry) => entry.id !== id))

  const value = useMemo(() => ({ toast }), [toast])
  const visible = entries.filter((entry) => entry.open).slice(0, maxVisible)
  const closing = entries.filter((entry) => !entry.open)

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" label={strings.region.replace(' ({hotkey})', '')}>
        {children}
        {[...closing, ...visible].map((entry) => {
          const tone = entry.tone ?? 'info'
          const duration = toastDuration(entry)
          const timed = Number.isFinite(duration)
          return (
            <RadixToast.Root
              key={entry.id}
              open={entry.open}
              onOpenChange={(open) => (open ? undefined : close(entry.id))}
              onAnimationEnd={() => (entry.open ? undefined : remove(entry.id))}
              duration={duration}
              onPause={() => update(entry.id, { paused: true })}
              onResume={() => update(entry.id, { paused: false })}
              type={tone === 'danger' ? 'foreground' : 'background'}
              data-tone={tone}
              data-paused={entry.paused || undefined}
              className={styles.toast}
              style={timed ? ({ '--toast-duration': `${duration}ms` } as CSSProperties) : undefined}
            >
              <Icon icon={toneIcons[tone]} size="md" className={styles.icon} />
              <div className={styles.text}>
                <RadixToast.Title className={styles.title}>{entry.title}</RadixToast.Title>
                {entry.description && (
                  <RadixToast.Description className={styles.description}>{entry.description}</RadixToast.Description>
                )}
                {entry.action && (
                  <RadixToast.Action altText={entry.action.label} asChild>
                    <Button size="sm" onClick={entry.action.onClick} className={styles.action}>
                      {entry.action.label}
                    </Button>
                  </RadixToast.Action>
                )}
              </div>
              <RadixToast.Close asChild>
                <IconButton label={strings.close} icon={X} size="sm" />
              </RadixToast.Close>
              {/* Shows the time left; it stops when Radix pauses the timer (pointer, focus or window blur). */}
              {timed && <span className={styles.timer} aria-hidden />}
            </RadixToast.Root>
          )
        })}
        <RadixToast.Viewport label={strings.region} className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}
