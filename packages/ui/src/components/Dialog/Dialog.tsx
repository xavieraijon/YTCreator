import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { useUiStrings } from '../../strings/UiStringsProvider.tsx'
import { cx } from '../../utils/cx.ts'
import { IconButton } from '../IconButton/index.ts'
import { TooltipContainerContext } from '../Tooltip/index.ts'
import styles from './Dialog.module.css'

export interface DialogProps extends Omit<ComponentProps<'dialog'>, 'open' | 'title'> {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description?: ReactNode
  /** The actions. The main one goes last. */
  readonly footer?: ReactNode
  readonly size?: 'sm' | 'md'
}

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary'

/**
 * Modal on the native `<dialog>`: the browser makes the page inert and Escape closes it. The Tab trap is kept by
 * hand so the focus never leaves to the browser chrome, and the focus goes back to the element that opened it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'md',
  className,
  children,
  onKeyDown,
  ...rest
}: DialogProps) {
  const strings = useUiStrings().dialog
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [container, setContainer] = useState<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      opener?.focus()
    }
  }, [open])

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    onKeyDown?.(event)
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)].filter(
      (item) => item.offsetParent !== null || item === document.activeElement,
    )
    const first = items.at(0)
    const last = items.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const setRefs = (node: HTMLDialogElement | null) => {
    dialogRef.current = node
    setContainer(node)
  }

  return (
    <dialog
      {...rest}
      ref={setRefs}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-size={size}
      onClose={() => onOpenChange(false)}
      onCancel={(event) => {
        event.preventDefault()
        onOpenChange(false)
      }}
      onKeyDown={handleKeyDown}
      className={cx(styles.dialog, className)}
    >
      {open && (
        <TooltipContainerContext.Provider value={container}>
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
          {/* Last in the DOM so the focus starts on the content; placed at the top right by CSS. */}
          <IconButton
            label={strings.close}
            icon={X}
            size="sm"
            className={styles.close}
            onClick={() => onOpenChange(false)}
          />
        </TooltipContainerContext.Provider>
      )}
    </dialog>
  )
}
