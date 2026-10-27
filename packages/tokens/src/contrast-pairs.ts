import { composite, contrastRatio, parseOklch, type Rgba } from './contrast.ts'
import { color } from './primitive/color.ts'
import { contrastMinimum, refFor, type ContrastKind, type ContrastPair, type Theme, type Token } from './types.ts'

export interface PairSpec {
  readonly foreground: string
  readonly background: string
  readonly kind: ContrastKind
}

/** Pairs that `allowedOn` cannot express: UI parts and, from US2/US3 on, component tokens. */
export const manualPairs: readonly PairSpec[] = [
  ...['color-bg', 'color-surface', 'color-surface-raised', 'color-surface-sunken'].flatMap((background) => [
    { foreground: 'color-border-focus', background, kind: 'ui' as const },
    { foreground: 'color-border-strong', background, kind: 'ui' as const },
  ]),
  { foreground: 'theme-switcher-option-text', background: 'theme-switcher-bg', kind: 'text' },
  { foreground: 'theme-switcher-option-text-selected', background: 'theme-switcher-option-bg-selected', kind: 'text' },
  { foreground: 'button-text', background: 'button-bg', kind: 'text' },
  { foreground: 'button-text-hover', background: 'button-bg-hover', kind: 'text' },
  { foreground: 'button-border', background: 'button-bg', kind: 'ui' },
  { foreground: 'button-primary-text', background: 'button-primary-bg', kind: 'text' },
  { foreground: 'button-primary-text', background: 'button-primary-bg-hover', kind: 'text' },
  { foreground: 'button-primary-text', background: 'button-primary-bg-active', kind: 'text' },
  { foreground: 'button-ghost-text', background: 'button-ghost-bg-hover', kind: 'text' },
  { foreground: 'button-danger-text', background: 'button-danger-bg', kind: 'text' },
  { foreground: 'checkbox-border', background: 'checkbox-bg', kind: 'ui' },
  { foreground: 'checkbox-checked-mark', background: 'checkbox-checked-bg', kind: 'ui' },
  { foreground: 'switch-track-border', background: 'switch-track', kind: 'ui' },
  { foreground: 'switch-thumb', background: 'switch-track', kind: 'ui' },
  { foreground: 'switch-thumb-on', background: 'switch-track-on', kind: 'ui' },
  { foreground: 'radio-border', background: 'radio-bg', kind: 'ui' },
  { foreground: 'radio-checked', background: 'radio-card-bg', kind: 'ui' },
  { foreground: 'error-message-text', background: 'error-message-bg', kind: 'text' },
  { foreground: 'empty-state-icon', background: 'empty-state-icon-bg', kind: 'ui' },
  { foreground: 'color-text-primary', background: 'glass-panel-bg', kind: 'text' },
  { foreground: 'color-text-secondary', background: 'glass-panel-bg', kind: 'text' },
  { foreground: 'ai-working-text', background: 'ai-working-bg', kind: 'text' },
]

/** What a translucent background may end up painted over. */
const backdrops = [color.white, color.black, color['coral-500']].map((token) => parseOklch(token.value))

const round = (ratio: number) => Math.round(ratio * 100) / 100

export function createContrastPairs(
  tokens: readonly Token[],
  manual: readonly PairSpec[] = manualPairs,
): ContrastPair[] {
  const byName = new Map(tokens.map((token) => [token.name, token]))

  const resolve = (name: string, theme: Theme): Rgba => {
    const token = byName.get(name)
    if (!token) throw new Error(`Unknown token in a contrast pair: ${name}`)
    if (token.level === 'primitive') return parseOklch(token.value)
    return resolve(refFor<Token['level']>(token.value, theme).name, theme)
  }

  /** Worst ratio over every backdrop when the background is translucent. */
  const ratio = (foreground: string, background: string, theme: Theme): number => {
    const fg = resolve(foreground, theme)
    const bg = resolve(background, theme)
    const grounds = bg.alpha < 1 ? backdrops.map((backdrop) => composite(bg, backdrop)) : [bg]
    return round(Math.min(...grounds.map((ground) => contrastRatio(fg, ground))))
  }

  const fromAllowedOn: PairSpec[] = tokens.flatMap((token) =>
    token.level === 'semantic' && token.allowedOn
      ? token.allowedOn.map((background) => ({ foreground: token.name, background, kind: 'text' as const }))
      : [],
  )

  return [...fromAllowedOn, ...manual].map(({ foreground, background, kind }) => {
    const light = ratio(foreground, background, 'light')
    const dark = ratio(foreground, background, 'dark')
    const minimum = contrastMinimum[kind]
    return { foreground, background, kind, ratio: { light, dark }, allowed: light >= minimum && dark >= minimum }
  })
}
