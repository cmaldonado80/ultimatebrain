# UltimateBrain (Solarc Brain)

AI agent orchestration platform built as a pnpm/Turborepo monorepo. The "Brain" manages hierarchies of agents, mini-brains, and development apps — each with its own database, agent community, and domain specialization.

**Stack:** Next.js 15 (App Router, Turbopack) · TypeScript · tRPC · Drizzle ORM · PostgreSQL + pgvector · Vitest · Playwright · Vercel · Neon

---

## Monorepo layout

```
apps/
  web/          — Main Next.js app (port 3000). All core UI + API.
  astrology-app/ — Domain-specific Next.js app (port 3200)
  astrology-brain/ — Mini-brain Node.js service using @solarc/mini-brain-server
  worker/       — Background jobs via pg-boss (@solarc/db consumer)

packages/
  db/           — Drizzle ORM schema, migrations, ensureSchema()
  types/        — Shared TypeScript domain enums (EntityTier, TicketStatus, etc.)
  brain-sdk/    — SDK for mini-brains to call UP to the parent Brain (tRPC facades)
  engine-contracts/ — Zod-based contract interfaces between engines
  ephemeris/    — Astrology/ephemeris calculations (swisseph)
  mini-brain-sdk/   — tRPC client for Development→MiniBrain communication
  mini-brain-server/ — Hono server scaffold for mini-brains
  eslint-config/    — Shared ESLint flat config

scripts/
  create-brain.ts      — Scaffold a new brain instance
  validate-template.ts — Validate agent/soul templates (run via `pnpm brain:validate`)
  run-evals.ts         — Evaluation runner
```

## Frontend layout (`apps/web/src/`)

```
app/
  layout.tsx            — Root layout (server component, wraps AppShell)
  loading.tsx           — Root shimmer skeleton
  error.tsx             — Root error boundary (Sentry-integrated)
  global-error.tsx      — Catches errors above root layout (Sentry-integrated)
  (dashboard)/          — Main app route group (auth-protected)
    layout.tsx          — n/a (inherits root)
    loading.tsx         — Shared dashboard loading state
    error.tsx           — Dashboard error boundary (Sentry-integrated)
    agents/ chat/ settings/ apps/ flows/ memory/ tickets/
    workspaces/ intelligence/ astrology/ engines/ guardrails/
    playbooks/ skills/ projects/ admin/ ...
  ops/                  — Operator/observability route group
    loading.tsx + error.tsx
    gateway/ traces/ evals/ healing/ ...
  auth/signin/          — Public signin page
  api/                  — API routes (self-authenticated, not middleware-protected)
components/
  ui/                   — Reusable design-system primitives
  chat/                 — Chat-specific components (markdown, panels)
  layout/               — Shell, sidebar, topbar, cursors, presence
  observatory/          — Flow canvas (dynamically imported)
  astrology/            — Chart components
  providers/            — React context providers (org, trpc)
hooks/
  chat/                 — Chat-specific hooks (use-chat-stream, etc.)
  use-active-org.ts     — Org context hook
lib/
  trpc.ts               — tRPC React client (all components import from here)
  astrology/            — Astrology utility functions
server/
  auth.ts               — JWT session (lazy secret)
  trpc.ts               — tRPC server setup + procedures
  errors.ts             — Domain error classes
  routers/              — ~50 tRPC routers
  services/             — 34 service modules (see below)
```

### Where does X go?

| You want to add…             | Put it in…                                           |
| ---------------------------- | ---------------------------------------------------- |
| A new dashboard page         | `app/(dashboard)/your-page/page.tsx` + `loading.tsx` |
| An API route                 | `app/api/your-route/route.ts` (add auth check)       |
| A reusable UI component      | `components/ui/`                                     |
| A feature-specific component | `components/<feature>/`                              |
| A React hook                 | `hooks/` (or `hooks/<feature>/` if scoped)           |
| A shared utility             | `lib/`                                               |
| A tRPC router                | `server/routers/` (register in `_app.ts`)            |
| A backend service            | `server/services/<name>/` with `index.ts` barrel     |
| Shared TypeScript types      | `packages/types/src/`                                |

## Services (`apps/web/src/server/services/`)

| Service                | Path                  | Purpose                                                                                                                      |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **a2a**                | `a2a/`                | Agent-to-Agent protocol: agent card registry, skill-based discovery, task delegation                                         |
| **adaptive**           | `adaptive/`           | Dashboard layout engine — ranks panels by role, behavior, context                                                            |
| **agents**             | `agents/`             | JourneyEngine — declarative agent behavior via state machines                                                                |
| **aitmpl**             | `aitmpl/`             | Template catalog and installer for agents, skills, hooks, MCPs                                                               |
| **atlas**              | `atlas/`              | Context builder: role-aware truth injection from tagged ATLAS.md sections                                                    |
| **browser-agent**      | `browser-agent/`      | Real-time browser automation streaming with screenshots                                                                      |
| **builder**            | `builder/`            | Blueprint generator, execution engine, gap detector for domain products                                                      |
| **chat**               | `chat/`               | Tool executor, context compactor, loop detection, session rotation                                                           |
| **checkpointing**      | `checkpointing/`      | State snapshots and time-travel replay                                                                                       |
| **crews**              | `crews/`              | Multi-agent crew coordination with ReAct execution                                                                           |
| **engine-registry**    | `engine-registry/`    | Central registry of all Brain engines with health/metrics                                                                    |
| **engines**            | `engines/`            | Computation engines (ephemeris)                                                                                              |
| **evals**              | `evals/`              | Evaluation framework: dataset builder, drift detector, scorers                                                               |
| **evolution**          | `evolution/`          | Agent self-improvement via performance analysis and mutation                                                                 |
| **flows**              | `flows/`              | Deterministic flow orchestration (FlowBuilder/FlowRunner)                                                                    |
| **gateway**            | `gateway/`            | LLM gateway: router, semantic cache, circuit breaker, cost tracker, rate limiter, key vault                                  |
| **guardrails**         | `guardrails/`         | Input/output safety: rule engine, input scanner, built-in rules                                                              |
| **healing**            | `healing/`            | Self-healing diagnostics and recovery                                                                                        |
| **instincts**          | `instincts/`          | Behavioral pattern learning: observe → detect → score → promote → inject                                                     |
| **integrations**       | `integrations/`       | Channels, webhooks, artifacts, model fallback                                                                                |
| **intelligence**       | `intelligence/`       | Adaptive router, agent messaging, capability profiling                                                                       |
| **mcp**                | `mcp/`                | Model Context Protocol server and tool registry                                                                              |
| **memory**             | `memory/`             | Smart memory: add, search, consolidate, extract facts                                                                        |
| **middleware**         | `middleware/`         | OpenAgents-style event pipeline interceptors                                                                                 |
| **mini-brain-factory** | `mini-brain-factory/` | Provision domain-specific mini-brains with isolated DBs                                                                      |
| **neon**               | `neon/`               | Neon PostgreSQL API client for database provisioning                                                                         |
| **orchestration**      | `orchestration/`      | Cron engine, agent lifecycle (onboard/assign/promote/review/terminate), routines, brain seed. 11 agent tiers under `agents/` |
| **platform**           | `platform/`           | Constitutional debate engine, atomic checkout, deployment workflow, audit log, token ledger                                  |
| **playbooks**          | `playbooks/`          | Record → distill → execute action sequences                                                                                  |
| **presence**           | `presence/`           | Multiplayer presence tracking (users + agents)                                                                               |
| **skills**             | `skills/`             | Skill marketplace: validate, sandbox execute, permission checks                                                              |
| **task-runner**        | `task-runner/`        | ModeRouter — dispatches quick/deep-work/autonomous execution                                                                 |
| **topology**           | `topology/`           | System topology snapshots, blast radius, health scoring                                                                      |
| **visual-qa**          | `visual-qa/`          | Visual QA recording and review                                                                                               |

## Routers (`apps/web/src/server/routers/`)

~50 tRPC routers merged in `_app.ts`. Three procedure tiers:

- `publicProcedure` — no auth
- `protectedProcedure` — requires session + input sanitization (XSS)
- `workspaceProcedure` — protected + workspace permission check

## Key patterns

### ensureSchema (cold-start provisioning)

`packages/db/src/index.ts` — On first connection, `ensureSchema()` creates all enums/tables/indexes via raw SQL. Guarded by a module-level `_schemaSynced` flag so it runs exactly once per process. This means any fresh Postgres database is ready without running migrations.

### Truth injection (Atlas)

`apps/web/src/server/services/atlas/` — ATLAS.md contains tagged documentation sections (`<!-- @section:name -->`). The ContextBuilder loads, caches, and maps sections to agent roles/capabilities so each agent's system prompt gets only relevant guidance.

### Gateway router (LLM orchestration)

`apps/web/src/server/services/gateway/router.ts` — All LLM calls flow through the GatewayRouter. It resolves provider from model name, checks circuit breaker + rate limits, queries semantic cache, routes through OpenClaw or direct fallback chains (e.g. Anthropic → Ollama → OpenAI → Google), then records cost and caches the response.

### Instinct system (behavioral learning)

`apps/web/src/server/services/instincts/` — Agents accumulate instincts (trigger + action + confidence). The InstinctInjector filters by domain, applies confidence decay, scores relevance, and injects top-N as natural-language behavioral hints in system prompts.

### Context compaction

`apps/web/src/server/services/chat/context-compactor.ts` — Two modes: fast `compact()` drops middle messages preserving system + recent N; LLM-powered `structuredCompact()` summarizes via Goal/Progress/Decisions/Files/NextSteps format.

### Lazy env validation

`apps/web/src/env.ts` — Zod schema validated via a Proxy that defers `validateEnv()` to first property access, not import time. Prevents build-time crashes during static page generation.

### Lazy auth secret

`apps/web/src/server/auth.ts` — `getSecret()` reads `AUTH_SECRET` from `process.env` on first call, not at module scope. Throws in production if missing; falls back to dev secret otherwise.

### Domain errors

`apps/web/src/server/errors.ts` — Typed error classes (NotFoundError, ValidationError, ServiceError, PermissionError, ConflictError, RateLimitError) with `toTRPCError()` conversion and `withDomainErrors()` wrapper.

## Dev commands

```bash
pnpm dev              # Start all apps (Turbopack, watch mode)
pnpm build            # Build all packages + apps
pnpm test             # Run Vitest across all packages
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript check all packages
pnpm format           # Prettier

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed database

# Brain utilities
pnpm brain:create     # Scaffold a new brain instance
pnpm brain:validate   # Validate agent templates (runs in CI)

# Docker (local full stack)
docker compose up     # Postgres + Jaeger + OpenClaw + app
```

## Environment variables

**Required:**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (`postgres://...`) |

**Required in production:**
| Variable | Description |
|----------|-------------|
| `AUTH_SECRET` | JWT signing secret (min 16 chars, generate with `openssl rand -base64 32`) |
| `CRON_SECRET` | Secures `/api/cron` endpoint |

**LLM providers (at least one):**
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google AI API key |

**Optional:**
| Variable | Description |
|----------|-------------|
| `VAULT_SECRET` | Encrypts stored API keys (min 16 chars) |
| `NEON_API_KEY` / `NEON_PROJECT_ID` | Neon database provisioning for mini-brains |
| `OPENCLAW_WS` / `OPENCLAW_TOKEN` | OpenClaw daemon connection |
| `OLLAMA_API_KEY` | Ollama cloud API key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector (Jaeger) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error monitoring DSN |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Sentry source map uploads |
| `SKIP_AUTH` | Set `true` in dev only to bypass auth |

See `.env.example` and `apps/web/.env.example` for full list with defaults.

## Deployment

**Vercel** — Primary deployment target.

- Config: `vercel.json` — filters build to `@solarc/web...`, outputs to `apps/web/.next`
- Daily cron: `0 0 * * *` → `/api/cron`
- Standalone output disabled on Vercel (uses Vercel's adapter)
- Security headers set in `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.)

**Neon** — PostgreSQL provider for production + mini-brain provisioning.

- Mini-brain factory provisions isolated Neon databases per domain
- `packages/db` handles schema with `ensureSchema()` (no migration step needed)

**Docker** — For local development or self-hosted.

- `docker-compose.yml`: Postgres 17 + pgvector, Jaeger, OpenClaw, migration service, app
- `apps/web/Dockerfile`: Multi-stage Alpine build → standalone Next.js server

## Testing

**Vitest** — Unit/integration tests.

- Root config: `vitest.config.ts` (80% line/function, 70% branch thresholds)
- App config: `apps/web/vitest.config.ts` (excludes e2e/)
- ~70 test files across `apps/web/src/server/` (routers + services)
- `packages/brain-sdk` and `scripts/` also have tests
- Run: `pnpm test`

**Playwright** — E2E smoke tests.

- Config: `apps/web/playwright.config.ts` (baseURL `localhost:3000`)
- Tests: `apps/web/e2e/smoke.test.ts`
- CI: 1 worker, 2 retries, trace on first retry

## CI/CD (`.github/workflows/ci.yml`)

**Check job** (all PRs + pushes): `typecheck` → `lint` → `test` → `brain:validate`
**Build job** (main only, after check): `pnpm build` with `DATABASE_URL` and `SKIP_AUTH=true`

## Error monitoring (Sentry)

- `apps/web/sentry.client.config.ts` — Client-side init (10% traces in prod, replay on error)
- `apps/web/sentry.server.config.ts` — Server-side init
- `apps/web/sentry.edge.config.ts` — Edge/middleware init
- `apps/web/src/instrumentation.ts` — Next.js instrumentation hook, wires `onRequestError`
- `apps/web/src/app/global-error.tsx` — Root error boundary with `Sentry.captureException`
- `apps/web/src/app/error.tsx` — App error boundary with `Sentry.captureException`
- `next.config.ts` wrapped with `withSentryConfig()` (source maps disabled when no DSN)
- Set `NEXT_PUBLIC_SENTRY_DSN` to activate; without it Sentry is inert

## Rate limiting

Gateway-level rate limiter at `apps/web/src/server/services/gateway/rate-limiter.ts`. Applied in the GatewayRouter and API routes (`/api/chat/stream`, `/api/a2a/[agentId]`).

## Security

- **Auth**: JWT sessions via `server/auth.ts`. Middleware redirects unauthenticated page requests to `/auth/signin` (skipped with `SKIP_AUTH=true`). API routes handle their own auth.
- **CSRF**: Origin-based validation in middleware for mutating API requests. Exempt: `/api/a2a/`, `/api/.well-known/`, `/api/brain/`, `/api/cron`, `/api/webhooks`.
- **CSP**: Strict Content-Security-Policy in `next.config.ts` — allows `'self'`, Sentry, Google Fonts. `frame-ancestors 'none'`, `form-action 'self'`.
- **Input sanitization**: tRPC middleware sanitizes all inputs via XSS filter on `protectedProcedure`.
- **Rate limiting**: In-memory IP-based rate limiters on `/api/chat/stream` (20/min) and `/api/a2a/` (30/min per IP, 100/min per agent).
- **Headers**: X-Frame-Options DENY, HSTS, X-Content-Type-Options nosniff, Permissions-Policy.

## Performance

- Heavy client components (`react-syntax-highlighter`, `@xyflow/react`) loaded via `next/dynamic` with `ssr: false`
- Loading skeletons on all major route groups (`loading.tsx`)
- Database pool: max 3 connections (serverless), max 20 (normal), with idle timeout
- `useMemo`/`useCallback` used throughout dashboard components for derived state and handlers

## Notes

- `pnpm.overrides` pins `drizzle-orm@0.38.4` to prevent dual-instance type conflicts from `@opentelemetry/api` (transitive via `@sentry/nextjs`)
- The tRPC context is built in `apps/web/src/server/trpc.ts` with SuperJSON transformer
- All API routes must include auth checks — they are excluded from middleware auth redirect but included in CSRF origin validation
