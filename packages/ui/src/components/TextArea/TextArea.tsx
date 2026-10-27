import type { ComponentProps } from 'react'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, FieldLabel, fieldStyles, useField, type FieldProps } from '../Field/index.ts'
import styles from './TextArea.module.css'

export interface TextAreaProps extends FieldProps, ComponentProps<'textarea'> {
  /** Grows with the text where the browser supports `field-sizing`; elsewhere the user can drag it. */
  readonly autoResize?: boolean
}

/** Several lines of text, such as a script or a description. */
export function TextArea({
  label,
  description,
  error,
  optional,
  required,
  autoResize = false,
  rows = 4,
  id,
  className,
  ...rest
}: TextAreaProps) {
  const field = useField({ id, description, error })
  return (
    <div className={cx(fieldStyles.field, className)}>
      <FieldLabel htmlFor={field.controlId} optional={optional}>
        {label}
      </FieldLabel>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      <div className={cx(fieldStyles.box, styles.box)}>
        <textarea
          {...rest}
          {...field.control}
          rows={rows}
          required={required}
          data-auto-resize={autoResize || undefined}
          className={cx(fieldStyles.control, styles.textarea)}
        />
      </div>
      <FieldError id={field.errorId}>{error}</FieldError>
    </div>
  )
}
