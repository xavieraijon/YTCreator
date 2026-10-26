import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { Icon } from '../icons/index.ts'
import { useUiStrings } from '../strings/UiStringsProvider.tsx'
import styles from './ThemeSwitcher.module.css'
import { useThemePreference, type ThemePreference } from './useThemePreference.ts'

export interface ThemeSwitcherProps {
  readonly className?: string
}

const options: readonly { readonly value: ThemePreference; readonly icon: LucideIcon }[] = [
  { value: 'auto', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
]

/** Segmented group of native radios: Automático / Claro / Oscuro (contracts/theme.md). */
export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const strings = useUiStrings().theme
  const { preference, setPreference } = useThemePreference()
  const name = useId()

  return (
    <fieldset className={[styles.switcher, className].filter(Boolean).join(' ')}>
      <legend className="visually-hidden">{strings.label}</legend>
      {options.map(({ value, icon }) => (
        <label key={value} className={styles.option}>
          <input
            type="radio"
            className={styles.input}
            name={name}
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
          />
          <Icon icon={icon} size="sm" />
          <span className={styles.text}>{strings[value]}</span>
        </label>
      ))}
    </fieldset>
  )
}
