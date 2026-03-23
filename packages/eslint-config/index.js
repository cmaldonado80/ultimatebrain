import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  // Architecture enforcement: prevent domain/engine code from importing infrastructure
  {
    files: ['**/engines/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['next', 'next/*'], message: 'Engine packages must not import Next.js — keep engines framework-agnostic.' },
          { group: ['@trpc/*'], message: 'Engine packages must not import tRPC — they are pure domain logic.' },
        ],
      }],
    },
  },
  {
    files: ['**/packages/types/src/**/*.ts', '**/packages/engine-contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Domain types must not depend on ORM implementation.' },
          { group: ['next', 'next/*'], message: 'Domain types must not depend on framework.' },
        ],
      }],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/drizzle/**'],
  },
  prettier,
]
