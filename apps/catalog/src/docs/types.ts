import type { ReactNode } from 'react'

export const docGroups = ['actions', 'forms', 'containers', 'communication', 'progress'] as const

export type DocGroup = (typeof docGroups)[number]

interface Example {
  readonly text: string
  readonly render?: () => ReactNode
}

/** One catalog page per component (contracts/catalog.md). */
export interface ComponentDoc {
  /** Same as the route `#/componentes/<id>`: the kebab-case name of the export. */
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly group: DocGroup
  /** At least one. */
  readonly variants: readonly { readonly title: string; readonly render: () => ReactNode }[]
  /** Hover, focus and pressed are forced with `data-force-state`. */
  readonly states: readonly { readonly state: string; readonly render: () => ReactNode }[]
  /** At least one of each. */
  readonly dos: readonly Example[]
  readonly donts: readonly Example[]
  readonly a11y: readonly string[]
  /** Names of the tokens it uses, without the `--s-`/`--c-` prefix. */
  readonly tokens: readonly string[]
}
