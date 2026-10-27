import stylelint from 'stylelint'
import { rule as strictValue } from 'stylelint-declaration-strict-value'
import { breakpoints } from '@ytcreator/tokens/breakpoints'

/**
 * Visual properties that only accept tokens (research R12), grouped by the token category the message names.
 * `transition` and `animation` shorthands are left out: they mix property names with durations and curves, so
 * the longhands carry the check.
 */
const categories = {
  color: [
    'color',
    'background',
    'background-color',
    'background-image',
    'fill',
    'stroke',
    'caret-color',
    'accent-color',
    'text-decoration-color',
    '/^border(-(block|inline|top|right|bottom|left)(-(start|end))?)?-color$/',
    'outline-color',
  ],
  borde: [
    '/^border(-(block|inline|top|right|bottom|left)(-(start|end))?)?$/',
    '/^border(-(block|inline|top|right|bottom|left)(-(start|end))?)?-width$/',
    'outline',
    'outline-width',
    'outline-offset',
  ],
  espaciado: [
    '/^(margin|padding)(-(block|inline|top|right|bottom|left)(-(start|end))?)?$/',
    'gap',
    'row-gap',
    'column-gap',
  ],
  tipografía: ['font', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'],
  radio: ['/^border(-(start|end|top|bottom)-(start|end|left|right))?-radius$/'],
  sombra: ['box-shadow', 'text-shadow'],
  capa: ['z-index'],
  duración: ['transition-duration', 'animation-duration', 'transition-delay', 'animation-delay'],
  curva: ['transition-timing-function', 'animation-timing-function'],
  cristal: ['backdrop-filter', '-webkit-backdrop-filter'],
}

/** Keywords and the system colors of forced-colors mode (they belong to the user, not to the theme). */
const ignoreValues = [
  'inherit',
  'initial',
  'unset',
  'currentColor',
  'transparent',
  'none',
  '0',
  'auto',
  '/^(solid|dashed|dotted|double)$/',
  '/^(Canvas|CanvasText|LinkText|VisitedText|ActiveText|ButtonFace|ButtonText|ButtonBorder|Field|FieldText|Highlight|HighlightText|SelectedItem|SelectedItemText|Mark|MarkText|GrayText|AccentColor|AccentColorText)$/',
]

/**
 * `stylelint-declaration-strict-value` takes a single fixed message, while the contract (quality-gates.md) names
 * the token category in each one. This rule runs it once per category with its own message.
 */
const tokenValueRuleName = 'ytcreator/token-value'
const tokenValue = stylelint.createPlugin(tokenValueRuleName, (enabled) => (root, result) => {
  if (!enabled) return
  for (const [category, properties] of Object.entries(categories)) {
    strictValue(properties, {
      ignoreValues,
      ignoreFunctions: false,
      message: `Valor suelto en "\${property}". Usa un token de ${category} (var(--s-…) o var(--c-…)).`,
    })(root, result)
  }
})

const widths = Object.values(breakpoints)

/** @type {import('stylelint').Config} */
export default {
  plugins: [tokenValue],
  ignoreFiles: ['**/dist/**', '**/node_modules/**', '**/playwright-report/**', '**/test-results/**'],
  rules: {
    [tokenValueRuleName]: true,
    'declaration-property-value-disallowed-list': [
      { '/.*/': ['/var\\(--p-/'] },
      { message: (property) => `"${property}" usa un primitivo (--p-…). Fuera de packages/tokens, usa un semántico.` },
    ],
    'media-feature-name-allowed-list': [
      ['width', 'min-width', 'max-width', '/^prefers-/', 'forced-colors', 'pointer', 'any-pointer', 'hover'],
    ],
    'media-feature-name-value-allowed-list': [{ '/^(min-|max-)?width$/': widths }],
    'color-no-hex': true,
    'color-named': 'never',
  },
  overrides: [
    {
      files: ['packages/tokens/**/*.css'],
      rules: { 'declaration-property-value-disallowed-list': null },
    },
  ],
}
