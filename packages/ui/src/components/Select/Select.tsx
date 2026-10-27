import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as RadixSelect } from 'radix-ui'
import { Icon } from '../../icons/index.ts'
import { cx } from '../../utils/cx.ts'
import { FieldDescription, FieldError, FieldLabel, fieldStyles, useField, type FieldProps } from '../Field/index.ts'
import styles from './Select.module.css'

export interface SelectOption {
  readonly value: string
  readonly label: string
  /** A second line under the label, for options that need a word of context. */
  readonly description?: string
  readonly disabled?: boolean
}

export interface SelectProps extends FieldProps {
  readonly options: readonly SelectOption[]
  readonly value?: string
  readonly defaultValue?: string
  readonly onValueChange?: (value: string) => void
  /** Shown while nothing is chosen. It never replaces the label. */
  readonly placeholder?: string
  /** Sends the value with a native form. */
  readonly name?: string
  readonly disabled?: boolean
  readonly id?: string
  readonly className?: string
  /** Catalog only: shows a state without interaction. */
  readonly 'data-force-state'?: 'hover' | 'focus'
}

/** Choice among many options in our own dropdown (Radix Select): keyboard, typeahead and screen reader included. */
export function Select({
  label,
  description,
  error,
  optional,
  required,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  disabled,
  id,
  className,
  'data-force-state': forceState,
}: SelectProps) {
  const field = useField({ id, description, error })
  return (
    <div className={cx(fieldStyles.field, className)}>
      <FieldLabel htmlFor={field.controlId} optional={optional}>
        {label}
      </FieldLabel>
      <FieldDescription id={field.descriptionId}>{description}</FieldDescription>
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        required={required}
        disabled={disabled}
      >
        <div className={cx(fieldStyles.box, styles.box)}>
          <RadixSelect.Trigger
            {...field.control}
            data-force-state={forceState}
            className={cx(fieldStyles.control, styles.trigger)}
          >
            <span className={styles.value}>
              <RadixSelect.Value placeholder={placeholder} />
            </span>
            <RadixSelect.Icon className={cx(fieldStyles.icon, styles.chevron)}>
              <Icon icon={ChevronDown} size="sm" />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>
        </div>
        <RadixSelect.Portal>
          <RadixSelect.Content position="popper" sideOffset={6} collisionPadding={8} className={styles.menu}>
            <RadixSelect.ScrollUpButton className={styles.scroll}>
              <Icon icon={ChevronUp} size="sm" />
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className={styles.viewport}>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.option}
                >
                  <span className={styles.optionText}>
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                    {option.description && <span className={styles.optionDescription}>{option.description}</span>}
                  </span>
                  <RadixSelect.ItemIndicator className={styles.check}>
                    <Icon icon={Check} size="sm" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className={styles.scroll}>
              <Icon icon={ChevronDown} size="sm" />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      <FieldError id={field.errorId}>{error}</FieldError>
    </div>
  )
}
