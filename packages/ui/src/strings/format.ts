/** Replaces each `{name}` in `template`. Throws if a placeholder has no value, so a missing one never reaches the screen. */
export function format(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`Missing value for {${name}} in "${template}"`)
    return String(value)
  })
}
