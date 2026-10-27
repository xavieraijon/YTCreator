import type { ChangeEvent, ComponentProps, ReactNode } from 'react'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, useField } from '../Field/index.ts'
import styles from './Switch.module.css'

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'role' | 'onChange'> {
  readonly label: string
  readonly description?: ReactNode
  readonly onCheckedChange?: (checked: boolean) => void
  readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

/** On or off with an immediate effect. For a choice that is saved later, use a Checkbox. */
export function Switch({ label, description, onCheckedChange, onChange, id, className, ...rest }: SwitchProps) {
  const field = useField({ id, description })
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    onCheckedChange?.(event.target.checked)
  }
  return (
    <div className={cx(styles.switch, className)}>
      <input
        {...rest}
        {...field.control}
        type="checkbox"
        role="switch"
        onChange={handleChange}
        className={styles.input}
      />
      <label htmlFor={field.controlId} className={styles.label}>
        {label}
      </label>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
    </div>
  )
}
