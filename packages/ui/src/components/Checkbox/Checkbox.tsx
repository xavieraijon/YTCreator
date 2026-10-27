import { Check, Minus } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, type ChangeEvent, type ComponentProps, type ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, useField } from '../Field/index.ts'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange'> {
  readonly label: string
  readonly description?: ReactNode
  readonly error?: ReactNode
  /** Some of the items it governs are checked. Only the DOM can set it. */
  readonly indeterminate?: boolean
  readonly onCheckedChange?: (checked: boolean) => void
  readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

/** A yes/no choice that takes effect when the form is sent. */
export function Checkbox({
  label,
  description,
  error,
  indeterminate = false,
  onCheckedChange,
  onChange,
  id,
  ref,
  className,
  ...rest
}: CheckboxProps) {
  const field = useField({ id, description, error })
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    onCheckedChange?.(event.target.checked)
  }
  return (
    <div className={cx(styles.checkbox, className)}>
      <span className={styles.control}>
        <input
          {...rest}
          {...field.control}
          ref={inputRef}
          type="checkbox"
          data-indeterminate={indeterminate || undefined}
          onChange={handleChange}
          className={styles.input}
        />
        <Icon icon={Check} size="sm" className={cx(styles.mark, styles.check)} />
        <Icon icon={Minus} size="sm" className={cx(styles.mark, styles.minus)} />
      </span>
      <label htmlFor={field.controlId} className={styles.label}>
        {label}
      </label>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      <FieldError id={field.errorId}>{error}</FieldError>
    </div>
  )
}
