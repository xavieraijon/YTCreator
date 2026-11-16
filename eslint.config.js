import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const inlineStyle = {
  selector:
    'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property[key.type="Identifier"]',
  message: "Usa un CSS Module con tokens; en línea solo se permiten custom properties (p. ej. '--progress')",
}

// A secret's value only leaves its `Secret` wrapper inside the adapters and the secret stores (constitution VII).
const secretReveal = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='reveal']",
  message:
    'Solo packages/ai/src, packages/youtube/src/data-api y apps/server/src/secrets pueden llamar a .reveal() de un Secret',
}

// Child processes get their arguments as a list, never through a shell (yt-dlp, claude).
const shellTrue = {
  selector: "Property[key.name='shell'][value.value=true]",
  message: 'Nunca `shell: true`: lanza el proceso con execFile/spawn y los argumentos en lista',
}

// The YouTube Data API is only reached by its adapter, which keeps the key in a header and the quota counted.
const googleApis = {
  selector: 'Literal[value=/googleapis\\.com/], TemplateElement[value.raw=/googleapis\\.com/]',
  message: 'Las llamadas a googleapis.com solo se hacen en packages/youtube/src/data-api',
}

// Processes are launched only where they are part of the job: AI adapters, yt-dlp, the CLI and the secret helpers.
const childProcess = {
  paths: [
    {
      name: 'node:child_process',
      message:
        'node:child_process solo se usa en packages/youtube/src/ytdlp, packages/speech/src/whisper, packages/ai/src y los puntos ya permitidos del servidor',
    },
    { name: 'child_process', message: 'Usa node:child_process, y solo donde está permitido' },
  ],
}

// The AI is only reached through the AiProvider port: SDKs live in packages/ai (constitution IV).
const aiSdks = {
  regex: '^(@anthropic-ai/.+|@google/genai|@google/generative-ai|openai|@ai-sdk/.+|ai)$',
  message: 'Los SDK de IA solo se importan en packages/ai, detrás del puerto AiProvider',
}

// The domain does not depend on adapters or apps.
const coreBoundaries = {
  group: [
    '@ytcreator/ai',
    '@ytcreator/ai/*',
    '@ytcreator/server',
    '@ytcreator/web',
    '@ytcreator/catalog',
    '**/packages/ai/**',
    '**/apps/**',
  ],
  message: 'packages/core no puede importar de packages/ai ni de apps/*',
}

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
      'no-restricted-syntax': ['error', inlineStyle, secretReveal, shellTrue, googleApis],
      'no-restricted-imports': ['error', { patterns: [aiSdks], ...childProcess }],
    },
  },
  {
    files: ['packages/ai/src/**/*.ts', 'apps/server/src/secrets/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', inlineStyle, shellTrue, googleApis] },
  },
  {
    files: ['packages/youtube/src/data-api/**/*.ts', '**/test/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', inlineStyle, shellTrue] },
  },
  {
    files: [
      'packages/youtube/src/ytdlp/**/*.ts',
      // whisper-cli, behind the SpeechRecognizer port (007, R6), and `tar` for its pinned Linux package (R1).
      'packages/speech/src/whisper/**/*.ts',
      'apps/server/src/services/speech-engine.ts',
      'apps/server/src/cli.ts',
      'apps/server/src/secrets/**/*.ts',
      'apps/server/src/services/claude-repair.ts',
      '**/test/**/*.ts',
      '**/e2e/**/*.ts',
      'installer/**/*.ts',
    ],
    rules: { 'no-restricted-imports': ['error', { patterns: [aiSdks] }] },
  },
  {
    files: ['packages/ai/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [aiSdks, coreBoundaries], ...childProcess }] },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
)
