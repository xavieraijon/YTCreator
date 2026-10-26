export type Level = 'primitive' | 'semantic' | 'component'

export type Category =
  'color' | 'space' | 'type' | 'radius' | 'shadow' | 'glass' | 'border' | 'layer' | 'motion' | 'breakpoint'

export type Theme = 'light' | 'dark'

declare const levelBrand: unique symbol

/** Reference to a token of level `L`. Only obtainable from `primitive()`, `semantic()` and `component()`. */
export interface Ref<L extends Level> {
  /** Kebab-case, unique. Prefixed by level in CSS: `--p-*`, `--s-*`, `--c-*`. */
  readonly name: string
  readonly level: L
  readonly [levelBrand]: L
}

/** One reference for both themes, or one per theme. */
export type ThemedRef<L extends Level> = Ref<L> | { readonly light: Ref<L>; readonly dark: Ref<L> }

export interface PrimitiveToken extends Ref<'primitive'> {
  readonly category: Category
  /** Primitives are the only tokens with a literal value. */
  readonly value: string
  readonly description?: string
}

export interface SemanticToken extends Ref<'semantic'> {
  readonly category: Category
  /** Always points to primitives: never to the same or a higher level. */
  readonly value: ThemedRef<'primitive'>
  /** What it is used for (es). */
  readonly description: string
  /** Semantic backgrounds this text or icon colour may sit on. Required on text and icon tokens. */
  readonly allowedOn?: readonly string[]
  readonly reducedMotion?: Ref<'primitive'>
  readonly reducedTransparency?: ThemedRef<'primitive'>
}

export interface ComponentToken extends Ref<'component'> {
  readonly category: Category
  /** Always points to semantics: never to a primitive. */
  readonly value: ThemedRef<'semantic'>
  /** What it is used for (es). */
  readonly description: string
}

export type Token = PrimitiveToken | SemanticToken | ComponentToken

export type ContrastKind = 'text' | 'large-text' | 'ui'

export const contrastMinimum: Readonly<Record<ContrastKind, number>> = { text: 4.5, 'large-text': 3, ui: 3 }

export interface ContrastPair {
  readonly foreground: string
  readonly background: string
  readonly kind: ContrastKind
  /** Computed, never written by hand. */
  readonly ratio: { readonly light: number; readonly dark: number }
  /** `true` only if both ratios meet the minimum of `kind`. */
  readonly allowed: boolean
}

type Input<T> = Omit<T, 'level' | typeof levelBrand>

/** Declares a family of primitives: `primitives('color', 'color', { 'coral-500': '…' })` → `color-coral-500`. */
export function primitives<const K extends string | number>(
  category: Category,
  prefix: string,
  values: Record<K, string>,
): { readonly [P in K]: PrimitiveToken } {
  const entries = Object.entries<string>(values).map(([key, value]) => [
    key,
    { name: `${prefix}-${key}`, level: 'primitive', category, value } as unknown as PrimitiveToken,
  ])
  return Object.fromEntries(entries) as { readonly [P in K]: PrimitiveToken }
}

export function primitive(token: Input<PrimitiveToken>): PrimitiveToken {
  return { ...token, level: 'primitive' } as unknown as PrimitiveToken
}

export function semantic(token: Input<SemanticToken>): SemanticToken {
  return { ...token, level: 'semantic' } as unknown as SemanticToken
}

export function component(token: Input<ComponentToken>): ComponentToken {
  return { ...token, level: 'component' } as unknown as ComponentToken
}

export function isThemed<L extends Level>(value: ThemedRef<L>): value is Exclude<ThemedRef<L>, Ref<L>> {
  return 'light' in value
}

/** Reference for one theme. */
export function refFor<L extends Level>(value: ThemedRef<L>, theme: Theme): Ref<L> {
  return isThemed(value) ? value[theme] : value
}

/** Every token this token points to (value and preference fallbacks). */
export function references(token: Token): Ref<Level>[] {
  if (token.level === 'primitive') return []
  const values: ThemedRef<Level>[] = [token.value]
  if (token.level === 'semantic') {
    if (token.reducedMotion) values.push(token.reducedMotion)
    if (token.reducedTransparency) values.push(token.reducedTransparency)
  }
  return values.flatMap((value) => (isThemed(value) ? [value.light, value.dark] : [value]))
}

/** Text and icon semantics: they must declare `allowedOn`. */
export function isTextOrIcon(token: Token): boolean {
  return token.level === 'semantic' && /^color-(text-.+|.+-fg)$/.test(token.name)
}
