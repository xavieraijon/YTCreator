import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, FieldLabel, fieldStyles, useField, type FieldProps } from '../Field/index.ts'
import styles from './Select.module.css'

export interface SelectOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

export interface SelectProps extends FieldProps, ComponentProps<'select'> {
  /** The choices. `children` (`<option>`, `<optgroup>`) can be used instead. */
  readonly options?: readonly SelectOption[]
}

/** Native list of choices: the browser's own keyboard and picker, with the look of the other fields. */
export function Select({
  label,
  description,
  error,
  optional,
  required,
  options,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  const field = useField({ id, description, error })
  return (
    <div className={cx(fieldStyles.field, className)}>
      <FieldLabel htmlFor={field.controlId} optional={optional}>
        {label}
      </FieldLabel>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      <div className={fieldStyles.box}>
        <select {...rest} {...field.control} required={required} className={cx(fieldStyles.control, styles.select)}>
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <Icon icon={ChevronDown} size="sm" className={cx(fieldStyles.icon, styles.chevron)} />
      </div>
      <FieldError id={field.errorId}>{error}</FieldError>
    </div>
  )
}
