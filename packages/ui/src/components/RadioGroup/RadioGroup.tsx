import type { LucideIcon } from 'lucide-react'
import { useId, type ChangeEvent, type ComponentProps, type ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, FieldLabel } from '../Field/index.ts'
import styles from './RadioGroup.module.css'

export interface RadioOption {
  readonly value: string
  /** In the `cards` look it is the card title. */
  readonly label: string
  readonly description?: string
  readonly icon?: LucideIcon
  readonly disabled?: boolean
}

export interface RadioGroupProps extends Omit<ComponentProps<'fieldset'>, 'onChange' | 'defaultValue'> {
  readonly label: string
  readonly options: readonly RadioOption[]
  readonly name?: string
  readonly value?: string
  readonly defaultValue?: string
  readonly onValueChange?: (value: string) => void
  readonly description?: ReactNode
  readonly error?: ReactNode
  readonly optional?: boolean
  readonly required?: boolean
  /** `cards` suits a few options that need a description, such as choosing an AI provider. */
  readonly appearance?: 'list' | 'cards'
}

/** One choice out of a few visible options. Arrows move between them (native radio behaviour). */
export function RadioGroup({
  label,
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  description,
  error,
  optional,
  required,
  appearance = 'list',
  className,
  ...rest
}: RadioGroupProps) {
  const groupId = useId()
  const groupName = name ?? groupId
  const descriptionId = description ? `${groupId}-description` : undefined
  const errorId = error ? `${groupId}-error` : undefined
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onValueChange?.(event.target.value)

  return (
    <fieldset
      {...rest}
      aria-describedby={cx(descriptionId, errorId) || undefined}
      data-appearance={appearance}
      className={cx(styles.group, className)}
    >
      <FieldLabel as="legend" optional={optional} className={styles.legend}>
        {label}
      </FieldLabel>
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
      <div className={styles.options}>
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`
          const hintId = option.description ? `${optionId}-hint` : undefined
          return (
            <div key={option.value} className={styles.option}>
              <input
                id={optionId}
                type="radio"
                name={groupName}
                value={option.value}
                checked={value === undefined ? undefined : value === option.value}
                defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
                disabled={option.disabled}
                required={required}
                aria-describedby={hintId}
                onChange={handleChange}
                className={styles.input}
              />
              {option.icon && (
                <span className={styles.icon}>
                  <Icon icon={option.icon} size="md" />
                </span>
              )}
              <label htmlFor={optionId} className={styles.label}>
                {option.label}
              </label>
              {option.description && (
                <p id={hintId} className={styles.hint}>
                  {option.description}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  )
}
