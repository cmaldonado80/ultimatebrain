# Solarc Brain

AI agent orchestration platform with tiered execution (quick / autonomous / deep work), memory management, guardrails, self-healing, and A2A protocol support.

## Architecture

```
apps/
  web/        Next.js 15 — tRPC API + React UI
  worker/     pg-boss background job processor

packages/
  db/         Drizzle ORM schema + migrations
  types/      Shared TypeScript domain types
  engine-contracts/  Engine interfaces
  brain-sdk/         Client SDK for Brain communication
  eslint-config/     Shared ESLint rules

engines/
  orchestration/  Ticket + workflow execution
  llm/            LLM provider abstraction
  memory/         Memory graph + retrieval
  guardrails/     Safety + compliance
  healing/        Error recovery
  a2a/            Agent-to-agent protocol
  eval/           Quality evaluation
  app-factory/    Mini Brain scaffolding
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+ (or Docker)

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and API keys

# Start PostgreSQL (Docker)
docker compose up -d postgres

# Run database migrations and seed data
pnpm db:migrate
pnpm db:seed
```

## Development

```bash
# Start all apps in dev mode
pnpm dev

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format code
pnpm format

# Run tests
pnpm test
```

## Build

```bash
pnpm build
```

## Project Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Next.js + worker in dev mode |
| `pnpm build` | Production build |
| `pnpm test` | Run all Vitest test suites |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | ESLint across all packages |
| `pnpm format` | Prettier formatting |
| `pnpm db:generate` | Generate Drizzle migration SQL |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:seed` | Seed development data |

## Environment Variables

See [`.env.example`](.env.example) for all required and optional variables with descriptions.

## CI/CD

GitHub Actions runs on every PR and push to `main`:
- Type-check → Lint → Test → Build (main only)

## License

Private — Solarc
