/** Internal texts of the components, grouped by component. Content texts always arrive by props (research R10). */
export interface UiStrings {
  readonly semaphore: {
    readonly verde: string
    readonly ambar: string
    readonly rojo: string
    readonly sin_comprobar: string
  }
  readonly dataSource: {
    /** Placeholder: `{fecha}`. */
    readonly youtube: string
    /** Placeholders: `{fuente}`, `{fecha}`. */
    readonly conocimiento: string
    readonly ia: string
  }
  readonly button: {
    /** Accessible name added while a button is busy. */
    readonly loading: string
  }
  readonly dialog: {
    readonly close: string
  }
  readonly toast: {
    readonly close: string
    /** Name of the notification region. Placeholder: `{hotkey}` (F8). */
    readonly region: string
  }
  readonly field: {
    readonly optional: string
    /** Read before the error message by screen readers. */
    readonly errorPrefix: string
  }
  readonly progress: {
    /** Visible percentage of a progress bar. Placeholder: `{value}`. */
    readonly value: string
  }
  readonly stepper: {
    /** Placeholders: `{current}`, `{total}`. */
    readonly position: string
    readonly done: string
    readonly current: string
    readonly pending: string
  }
  readonly theme: {
    readonly label: string
    readonly auto: string
    readonly light: string
    readonly dark: string
  }
  readonly aiWorking: {
    readonly defaultLabel: string
  }
}

/** Partial override accepted by `UiStringsProvider`: any key at any depth may be left out. */
export type UiStringsOverride = { readonly [K in keyof UiStrings]?: Partial<UiStrings[K]> }
