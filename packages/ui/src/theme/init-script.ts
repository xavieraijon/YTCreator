/** Storage key of the theme preference. Shared by the init script and `useThemePreference`. */
export const themeStorageKey = 'ytc.theme'

/**
 * Inline script that applies a stored `light` or `dark` preference before the first paint (contracts/theme.md).
 * Any other value, or a storage that throws, leaves the page following the system.
 */
export const themeInitScript = `try{var t=localStorage.getItem('${themeStorageKey}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`
