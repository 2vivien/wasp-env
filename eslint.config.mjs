import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'test-results/**', 'next-env.d.ts']),
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    ignores: ['app/layout.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,8})$/]',
          message: 'Utiliser un token de src/styles/tokens.css, jamais une couleur en dur.',
        },
        {
          selector: "CallExpression[callee.name=/^(rgb|rgba|hsl|hsla)$/]",
          message: 'Utiliser un token de src/styles/tokens.css, jamais une couleur en dur.',
        },
      ],
    },
  },
])
