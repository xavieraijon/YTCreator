import { Tabs as RadixTabs } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './Tabs.module.css'

export interface TabItem {
  readonly id: string
  readonly label: string
  readonly content: ReactNode
  readonly disabled?: boolean
}

export interface TabsProps extends Omit<ComponentProps<'div'>, 'defaultValue' | 'dir'> {
  readonly items: readonly TabItem[]
  readonly value?: string
  /** First tab by default. */
  readonly defaultValue?: string
  readonly onValueChange?: (value: string) => void
  /** Names the tab list when the page has more than one. */
  readonly label?: string
}

/** Views of the same content. Arrows move and select; Home and End jump to the ends. */
export function Tabs({ items, value, defaultValue, onValueChange, label, className, ...rest }: TabsProps) {
  return (
    <RadixTabs.Root
      {...rest}
      value={value}
      defaultValue={defaultValue ?? items[0]?.id}
      onValueChange={onValueChange}
      className={cx(styles.tabs, className)}
    >
      <RadixTabs.List aria-label={label} className={styles.list}>
        {items.map((item) => (
          <RadixTabs.Trigger key={item.id} value={item.id} disabled={item.disabled} className={styles.trigger}>
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.id} value={item.id} className={styles.content}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
