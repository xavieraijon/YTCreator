import { describe, expect, it } from 'vitest'
import { createTokensJson, renderBreakpoints, renderCss, validate } from '../src/build.ts'
import { createContrastPairs } from '../src/contrast-pairs.ts'
import { semantic, tokens } from '../src/index.ts'
import { color } from '../src/primitive/color.ts'

describe('token build', () => {
  const css = renderCss(tokens)

  it('matches the snapshot', () => {
    expect(css).toMatchSnapshot()
  })

  it('wraps everything in @layer tokens and declares color-scheme', () => {
    expect(css).toMatch(/^\/\*.*\*\/\n@layer tokens \{/)
    expect(css).toContain(':root { color-scheme: light dark; }')
    expect(css).toContain(":root[data-theme='light'] { color-scheme: light; }")
    expect(css).toContain(":root[data-theme='dark'] { color-scheme: dark; }")
  })

  it('every --s-color-* uses light-dark()', () => {
    const declarations = css.match(/--s-color-[\w-]+: [^;]+;/g) ?? []
    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.filter((declaration) => !declaration.includes('light-dark('))).toEqual([])
  })

  it('emits no breakpoint custom property', () => {
    expect(css).not.toMatch(/--[psc]-breakpoint/)
  })

  it('exports breakpoints as constants', () => {
    expect(renderBreakpoints(tokens)).toContain(
      "export const breakpoints = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem' } as const",
    )
  })

  it('tokens.json carries the contrast pairs and the metadata of each token', () => {
    const json = createTokensJson(tokens, createContrastPairs(tokens))
    expect(json.contrastPairs.length).toBeGreaterThan(0)
    expect(json.contrastPairs[0]).toMatchObject({ ratio: { light: expect.any(Number), dark: expect.any(Number) } })
    expect(json.tokens.find((token) => token.name === 'color-bg')).toMatchObject({
      cssProperty: '--s-color-bg',
      level: 'semantic',
      ref: { light: 'color-neutral-50', dark: 'color-neutral-950' },
    })
  })

  /** Body of the `:root` rule inside the block that starts with `at`. */
  const blockBody = (at: string) => css.split(`${at} {`)[1]?.split('}')[0] ?? ''
  const value = (body: string, property: string) => new RegExp(`${property}: ([^;]+);`).exec(body)?.[1]

  it('drops every duration to 0ms with reduced motion, except duration-fast', () => {
    expect(css).toContain('--p-duration-0: 0ms;')
    const body = blockBody('@media (prefers-reduced-motion: reduce)')
    const durations = tokens.filter((token) => token.level === 'semantic' && token.name.startsWith('duration-'))
    expect(durations.length).toBeGreaterThan(0)
    for (const { name } of durations) {
      expect(value(body, `--s-${name}`), name).toBe(name === 'duration-fast' ? undefined : 'var(--p-duration-0)')
    }
  })

  it.each(['@media (prefers-reduced-transparency: reduce)', '@supports not (backdrop-filter: blur(1px))'])(
    'turns glass into an opaque raised surface under %s',
    (at) => {
      const body = blockBody(at)
      expect(value(body, '--s-glass-bg')).toBe(value(css, '--s-color-surface-raised'))
      expect(value(body, '--s-glass-blur')).toBe('var(--p-glass-blur-off)')
      expect(css).toContain('--p-glass-blur-off: none;')
    },
  )

  it('passes validation with the current tokens', () => {
    expect(validate(tokens)).toEqual([])
  })

  it('fails when a text token has no allowedOn', () => {
    const broken = semantic({
      name: 'color-text-broken',
      category: 'color',
      value: { light: color.black, dark: color.white },
      description: 'Prueba.',
    })
    expect(validate([...tokens, broken])).toEqual(['color-text-broken: text and icon tokens must declare allowedOn'])
  })

  it('fails when allowedOn names an unknown background', () => {
    const broken = semantic({
      name: 'color-text-broken',
      category: 'color',
      value: { light: color.black, dark: color.white },
      description: 'Prueba.',
      allowedOn: ['color-nowhere'],
    })
    expect(validate([...tokens, broken])).toHaveLength(1)
  })
})
