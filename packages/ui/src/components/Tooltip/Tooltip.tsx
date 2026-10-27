import { Tooltip as RadixTooltip } from 'radix-ui'
import { createContext, useContext, type ComponentProps, type ReactElement } from 'react'
import { cx } from '../../utils/cx.ts'
import styles from './Tooltip.module.css'

/**
 * Where tooltips are portalled. A modal `<dialog>` lives in the top layer and makes the rest of the page inert,
 * so the dialog provides itself as the container.
 */
export const TooltipContainerContext = createContext<HTMLElement | null>(null)

export interface TooltipProps extends Omit<ComponentProps<'div'>, 'content' | 'children'> {
  /** Never essential: it must also be in the trigger's accessible name or in visible text. */
  readonly content: string
  /** A single focusable element. */
  readonly children: ReactElement
  readonly side?: 'top' | 'right' | 'bottom' | 'left'
}

/** Opens on hover and on focus. Touch screens may never show it (contracts/components.md). */
export function Tooltip({ content, children, side = 'top', className, ...rest }: TooltipProps) {
  const container = useContext(TooltipContainerContext)
  return (
    <RadixTooltip.Provider delayDuration={500}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal container={container ?? undefined}>
          <RadixTooltip.Content {...rest} side={side} sideOffset={6} className={cx(styles.tooltip, className)}>
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
