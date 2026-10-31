import type { LucideIcon } from 'lucide-react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { Button, type ButtonProps } from '../Button/index.ts'
import { Tooltip, type TooltipProps } from '../Tooltip/index.ts'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  /** Required: it is the accessible name and the tooltip text. */
  readonly label: string
  readonly icon: LucideIcon
  /** Where the tooltip opens. Change it when the button sits against an edge that would clip it. */
  readonly tooltipSide?: TooltipProps['side']
}

/** Button with an icon and no visible text. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  tooltipSide,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <Button {...rest} variant={variant} size={size} aria-label={label} className={cx(styles.iconButton, className)}>
        <Icon icon={icon} size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} />
      </Button>
    </Tooltip>
  )
}
