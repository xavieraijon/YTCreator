import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))
/** A component stylesheet that does not exist: the root config applies to it as to any real one. */
const codeFilename = fileURLToPath(new URL('../src/components/Sample/Sample.module.css', import.meta.url))

async function warnings(code: string) {
  const { results } = await stylelint.lint({ code, codeFilename, cwd: root })
  return results.flatMap((result) => result.warnings.map((warning) => warning.text))
}

/** Every message names the property and points to a token (contracts/quality-gates.md). */
const tokenMessage = (property: string, category: string) =>
  `Valor suelto en "${property}". Usa un token de ${category} (var(--s-…) o var(--c-…)).`

describe('stylelint: only tokens (scenario 5.1)', () => {
  it.each([
    ['padding: 13px', 'padding', 'espaciado'],
    ['color: #fff', 'color', 'color'],
    ['color: red', 'color', 'color'],
    ['z-index: 10', 'z-index', 'capa'],
    ['transition-duration: 200ms', 'transition-duration', 'duración'],
  ])('rejects `%s` naming the token category', async (declaration, property, category) => {
    const texts = await warnings(`.box { ${declaration}; }`)
    expect(texts.some((text) => text.startsWith(tokenMessage(property, category)))).toBe(true)
  })

  it('rejects a primitive outside the tokens package', async () => {
    const texts = await warnings('.box { color: var(--p-color-coral-500); }')
    expect(texts.some((text) => text.includes('"color" usa un primitivo (--p-…)'))).toBe(true)
  })

  it('rejects a breakpoint that is not a token', async () => {
    const texts = await warnings('@media (width >= 50rem) { .box { display: none; } }')
    expect(texts.some((text) => text.includes('50rem'))).toBe(true)
  })

  it('accepts tokens and keywords', async () => {
    const texts = await warnings(`
      .box {
        padding: var(--s-space-4) 0;
        margin: auto;
        color: var(--s-color-text-primary);
        background: var(--c-card-bg);
        border-color: currentColor;
        outline-color: transparent;
        box-shadow: none;
        font: inherit;
      }
      @media (min-width: 48rem) {
        .box { gap: var(--s-space-2); }
      }
    `)
    expect(texts).toEqual([])
  })
})
