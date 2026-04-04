# Contributing to Solarc Brain

## Prerequisites

- **Node.js** 22+
- **pnpm** 10.29+
- **PostgreSQL** (local or Neon connection string)

## Setup

```bash
git clone <repo-url>
cd ultimatebrain
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local — set DATABASE_URL + at least one LLM API key
pnpm dev
```

Database schema auto-syncs on startup via `ensureSchema()` — no manual migrations needed.

## Development Workflow

1. **Branch** from `main` — use `feature/`, `fix/`, `docs/` prefixes
2. **Develop** — `pnpm dev` starts the web app with Turbopack on port 3000
3. **Test** — `pnpm test` (995+ tests across 3 packages)
4. **Typecheck** — `pnpm typecheck` (18 packages in parallel via Turborepo)
5. **Lint** — `pnpm lint` (ESLint across all packages)
6. **Commit** — Husky pre-commit hooks run lint-staged (ESLint --fix + Prettier)
7. **PR** — CI runs: typecheck → lint → test → brain:validate

## Monorepo Structure

```
apps/
  web/              ← Main Next.js 15 app (50 tRPC routers, 85 pages)
  worker/           ← Background jobs (pg-boss, 6 scheduled cron jobs)
  astrology-app/    ← Astrology frontend (auth delegates to Brain)
  astrology-brain/  ← Astrology Mini Brain (5 computation routes)

packages/
  db/               ← PostgreSQL schema (Drizzle ORM, 103 tables)
  brain-sdk/        ← SDK for Mini Brain → Brain communication
  brain-client/     ← Shared tRPC client for Brain API calls
  mini-brain-sdk/   ← Client SDK for Mini Brain connections
  mini-brain-server/← Hono HTTP server for Mini Brains
  engine-contracts/ ← Shared Zod schemas and model strategy
  ephemeris/        ← Swiss Ephemeris wrapper
  types/            ← Shared TypeScript types
  eslint-config/    ← Shared ESLint configuration
```

## Key Architecture

- **Truth Injection** — agents receive grounded runtime context before responding (never hallucinate topology)
- **Self-Healing Cortex** — OODA loop runs every 10 min: observe, orient, decide, act, learn
- **Evidence Pipeline** — healing outcomes, verifications, instinct promotions flow to tiered memory
- **Gateway** — multi-provider LLM router with circuit breaker, rate limiter, cost tracking
- **A2A Protocol** — DB-backed agent-to-agent delegation with TTL expiry and cancellation
- **Sandbox** — tool execution goes through permission check → policy → execute → audit

## Observability

- **Structured logger** (`apps/web/src/lib/logger.ts`) — JSON in production, pretty in dev
- **Request context** — AsyncLocalStorage injects requestId, userId, workspaceId into all logs
- **Slow query detection** — `trackQuery()` warns at 500ms, errors at 2000ms
- **Error boundaries** — `app/error.tsx` and `app/global-error.tsx` never expose internals

## Testing

```bash
pnpm test                          # All tests
cd apps/web && npx vitest run      # Web app only
npx vitest run src/server/services/healing/  # Subset
```

Tests use mocked DB — no real PostgreSQL needed. Patterns:

```typescript
vi.mock('@solarc/db', () => ({ agents: { id: 'id', ... } }))
vi.mock('drizzle-orm', () => ({ eq: (c, v) => ({ c, v }), ... }))
```

## Code Rules

- TypeScript strict mode
- No `console.log` in production — use `logger` from `@/lib/logger`
- No `as any` without justification
- No `.catch(() => {})` — all catches must log via `logger.warn`
- Error responses never expose `err.message` to external callers
- Do NOT commit `.env.local` or log API keys/tokens/PII

## Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/):

| Prefix     | Purpose                   |
| ---------- | ------------------------- |
| `feat`     | New feature               |
| `fix`      | Bug fix                   |
| `refactor` | Code restructuring        |
| `test`     | Tests                     |
| `docs`     | Documentation             |
| `chore`    | Maintenance, dependencies |

## Environment Variables

See `apps/web/.env.example` for the full documented list. Required:

- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — JWT signing (required in production)
- At least one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
