import { CircleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Icon } from '../../icons/index.ts'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import styles from './Field.module.css'

/** Props shared by every form control (contracts/components.md, «Formularios»). */
export interface FieldProps {
  /** Always visible: a placeholder never replaces it. */
  readonly label: string
  readonly description?: ReactNode
  /** What went wrong and how to fix it. Adds `aria-invalid`, an icon and the text (FR-010). */
  readonly error?: ReactNode
  /** Not readonly: it must match the native attribute that the controls also extend. */
  required?: boolean
  /** Marks the label with «opcional». Mark the optional fields, not the required ones. */
  readonly optional?: boolean
}

/** Ids that tie the control to its label, help and error. */
export function useField({ id, description, error }: { id?: string; description?: ReactNode; error?: ReactNode }) {
  const generated = useId()
  const controlId = id ?? generated
  const descriptionId = description ? `${controlId}-description` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return {
    controlId,
    descriptionId,
    errorId,
    control: {
      id: controlId,
      'aria-describedby': cx(descriptionId, errorId) || undefined,
      'aria-invalid': error ? true : undefined,
    },
  }
}

interface FieldLabelProps {
  readonly htmlFor?: string
  readonly as?: 'label' | 'legend'
  readonly optional?: boolean
  readonly className?: string
  readonly children: ReactNode
}

export function FieldLabel({ htmlFor, as: Element = 'label', optional, className, children }: FieldLabelProps) {
  const strings = useUiStrings().field
  return (
    <Element htmlFor={Element === 'label' ? htmlFor : undefined} className={cx(styles.label, className)}>
      {children}
      {optional && <span className={styles.optional}> ({strings.optional})</span>}
    </Element>
  )
}

export function FieldDescription({ id, children }: { readonly id?: string; readonly children?: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className={styles.description}>
      {children}
    </p>
  )
}

export function FieldError({ id, children }: { readonly id?: string; readonly children?: ReactNode }) {
  const strings = useUiStrings().field
  if (!children) return null
  return (
    <p id={id} className={styles.error}>
      <Icon icon={CircleAlert} size="sm" className={styles.errorIcon} />
      <span>
        <span className="visually-hidden">{strings.errorPrefix} </span>
        {children}
      </span>
    </p>
  )
}

export { styles as fieldStyles }
