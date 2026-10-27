import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, FieldLabel, fieldStyles, useField, type FieldProps } from '../Field/index.ts'

export interface TextFieldProps extends FieldProps, Omit<ComponentProps<'input'>, 'type'> {
  readonly type?: 'text' | 'email' | 'url' | 'search' | 'password' | 'tel' | 'number'
  /** Decorative: the label already says what the field is for. */
  readonly iconStart?: LucideIcon
}

/** One line of text. `className` goes to the wrapper; the other props go to the `<input>`. */
export function TextField({
  label,
  description,
  error,
  optional,
  required,
  iconStart,
  type = 'text',
  id,
  className,
  ...rest
}: TextFieldProps) {
  const field = useField({ id, description, error })
  return (
    <div className={cx(fieldStyles.field, className)}>
      <FieldLabel htmlFor={field.controlId} optional={optional}>
        {label}
      </FieldLabel>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      <div className={fieldStyles.box}>
        {iconStart && <Icon icon={iconStart} size="sm" className={fieldStyles.icon} />}
        <input {...rest} {...field.control} type={type} required={required} className={fieldStyles.control} />
      </div>
      <FieldError id={field.errorId}>{error}</FieldError>
    </div>
  )
}
