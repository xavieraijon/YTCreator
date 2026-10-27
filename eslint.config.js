import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.tsbuild/**', '**/playwright-report/**', '**/test-results/**', '.specify/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    ...jsxA11y.flatConfigs.recommended,
    plugins: {
      react,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: '19' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/prop-types': 'off',
      // Safari stops announcing lists styled with `list-style: none`; `role="list"` brings them back.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property[key.type="Identifier"]',
          message: "Usa un CSS Module con tokens; en línea solo se permiten custom properties (p. ej. '--progress')",
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
)
