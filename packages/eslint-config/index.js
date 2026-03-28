import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import nextPlugin from '@next/eslint-plugin-next'

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── TypeScript (all files) ──────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  // ── React + JSX (component files) ───────────────────────────────────────
  {
    files: ['**/*.tsx'],
    plugins: {
      'react': react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 19 JSX transform
      'react/prop-types': 'off', // TypeScript handles this
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // ── Next.js (web app) ───────────────────────────────────────────────────
  {
    files: ['**/apps/web/**/*.ts', '**/apps/web/**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  // ── Test files (relaxed console) ────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      'no-console': 'off',
    },
  },
  // ── Architecture enforcement ────────────────────────────────────────────
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
  // ── Ignored paths ───────────────────────────────────────────────────────
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/drizzle/**'],
  },
  prettier,
]
