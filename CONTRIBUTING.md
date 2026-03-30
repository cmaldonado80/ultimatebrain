# Contributing to Solarc Brain

Thank you for your interest in contributing to Solarc Brain. This guide will help you get started.

## Prerequisites

- **Node.js** 20 or higher
- **pnpm** (package manager)
- **PostgreSQL** (local instance or connection string to a remote database)

## Setup

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd ultimatebrain
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

   Fill in the required values (at minimum `DATABASE_URL`).

4. Set up the database:

   ```bash
   pnpm db:push   # apply schema to your database
   ```

## Development Workflow

1. Create a branch from `main` using the following naming conventions:
   - `feature/<description>` -- new features
   - `fix/<description>` -- bug fixes
   - `docs/<description>` -- documentation changes

2. Make your changes and ensure they build cleanly.

3. Open a pull request against `main`.

## Code Standards

- **TypeScript** in strict mode across the entire codebase.
- **ESLint** for linting -- run `pnpm lint` to check.
- **Prettier** for formatting -- run `pnpm format` to auto-format.

Please fix all lint and type errors before submitting a pull request.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must start with a type prefix:

| Prefix     | Purpose                                 |
| ---------- | --------------------------------------- |
| `feat`     | A new feature                           |
| `fix`      | A bug fix                               |
| `refactor` | Code restructuring (no behavior change) |
| `docs`     | Documentation only                      |
| `test`     | Adding or updating tests                |

Examples:

```
feat: add workspace invite flow
fix: correct JWT expiry calculation
docs: update API key rotation instructions
```

## Pull Request Process

1. Every PR must include a description of what changed and why.
2. TypeScript type-checking must pass (`pnpm typecheck`).
3. Link the related issue in the PR description (e.g., `Closes #123`).
4. Request a review from at least one maintainer.

## Testing

We use [Vitest](https://vitest.dev/) as the test runner.

```bash
pnpm test          # run all tests
pnpm test --watch  # run in watch mode
```

Write tests for new functionality and ensure existing tests pass before opening a PR.

## Architecture Overview

Solarc Brain is organized as a **pnpm monorepo**:

```
apps/
  web/             -- main Next.js web application
  astrology-app/   -- astrology-focused frontend
  worker/          -- background job runner
packages/
  db/              -- shared Drizzle ORM schema and database utilities
  brain-sdk/       -- SDK for interacting with brain services
  types/           -- shared TypeScript types
  engine-contracts/-- contracts between engine components
  eslint-config/   -- shared ESLint configuration
```

Most feature work happens in `apps/web`. Database schema changes go in `packages/db`. Shared types and utilities live in the corresponding package under `packages/`.
