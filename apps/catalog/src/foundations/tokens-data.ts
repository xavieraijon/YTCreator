import type { Category, ContrastPair, Level, Theme } from '@ytcreator/tokens'
import data from '@ytcreator/tokens/tokens.json'

/** One entry of `tokens.json`, as written by `createTokensJson` in packages/tokens/src/build.ts. */
export interface TokenEntry {
  readonly name: string
  readonly cssProperty: string
  readonly level: Level
  readonly category: Category
  readonly description?: string
  readonly value: Readonly<Record<Theme, string>>
  readonly ref: Readonly<Record<Theme, string>> | null
  readonly allowedOn?: readonly string[]
}

export const tokens = data.tokens as readonly TokenEntry[]
export const contrastPairs = data.contrastPairs as readonly ContrastPair[]

export function tokensOf(category: Category, level: Level = 'semantic'): TokenEntry[] {
  return tokens.filter((token) => token.category === category && token.level === level)
}

/** Semantic tokens of `category` whose name matches `pattern`. */
export function select(category: Category, pattern: RegExp): TokenEntry[] {
  return tokensOf(category).filter((token) => pattern.test(token.name))
}

export const cssVar = (token: TokenEntry) => `var(${token.cssProperty})`

export const semanticVar = (name: string) => `var(--s-${name})`

/** Shows one value when both themes agree, or `claro / oscuro` when they differ. */
export function themed(values: Readonly<Record<Theme, string>>): string {
  return values.light === values.dark ? values.light : `${values.light} / ${values.dark}`
}
