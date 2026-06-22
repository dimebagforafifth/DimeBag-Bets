// Flat ESLint config (ESLint 9). Focused on CORRECTNESS, not style — Prettier
// owns formatting (eslint-config-prettier turns off any rule that would fight it).
// The highest-value rules here are react-hooks/* on the hooks-heavy UI, which tsc
// can't check. Type-aware linting is intentionally NOT enabled (no parserOptions
// .project) to keep lint fast and free of a second TS program; tsc is the type gate.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // dist-pages is the generated GitHub Pages build (minified bundles), produced in
  // CI and never committed — never lint it (minified code floods CI with errors).
  { ignores: ['dist/**', 'dist-pages/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Real bugs (hooks called conditionally, etc.) — hard error.
      'react-hooks/rules-of-hooks': 'error',
      // Missing effect deps — surfaced as a warning: often deliberate in this
      // codebase (and already annotated where so), so it informs without blocking.
      'react-hooks/exhaustive-deps': 'warn',
      // tsc already enforces unused locals/params (noUnusedLocals/Parameters) with
      // full type awareness — don't duplicate it (and its different ergonomics) here.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettier,
)
