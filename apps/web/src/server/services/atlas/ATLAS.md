<!-- @section:stack -->

## Tech Stack

- Runtime: Node 22 + TypeScript 5.8, pnpm monorepo (Turborepo)
- Framework: Next.js 15 (App Router), tRPC v11
- Database: PostgreSQL 17 + pgvector, Drizzle ORM
- Styling: Tailwind v4, Dark Cosmic design system
- Testing: Vitest
- Auth: NextAuth v5
- Tracing: OpenTelemetry → Jaeger
- LLM Routing: Gateway Router (Anthropic, OpenAI, Google, Ollama, OpenClaw)
<!-- @end -->

<!-- @section:structure -->

## Project Structure

```
apps/web/                  — Next.js app (UI + API + tRPC)
  src/app/                 — App Router pages & API routes
  src/server/routers/      — tRPC routers (gateway, agents, tickets, flows, memory, skills, instincts)
  src/server/services/     — Domain services (gateway, memory, orchestration, healing, atlas, mcp, flows)
  src/components/          — React components (Dark Cosmic design system)
packages/db/               — Drizzle schema, migrations, seed
packages/types/            — Shared TypeScript types
```

<!-- @end -->

<!-- @section:conventions -->

## Conventions

- Drizzle ORM for all DB access — no raw SQL
- tRPC routers: `src/server/routers/*.ts` — each router uses `protectedProcedure`
- Services: `src/server/services/*/` — business logic, no direct DB in routers beyond simple CRUD
- Dark Cosmic CSS: `cyber-card`, `cyber-btn-primary`, `cyber-input`, `neon-dot`, `font-orbitron`
- Vitest for unit tests: `__tests__/*.test.ts`
- Use `and()` from drizzle-orm for multi-condition queries (never pass array to `.where()`)
- Wrap multi-step DB writes in `db.transaction(async (tx) => { ... })`
- No silent `.catch(() => {})` — use `try/catch` + `console.warn`
- Gateway router handles LLM provider fallback automatically
<!-- @end -->

<!-- @section:coder -->

## For Coders

- Import schema from `@solarc/db` (e.g., `import { agents, tickets } from '@solarc/db'`)
- Import types from `@solarc/types`
- State mutations use Drizzle `.update().set().where()` or `.insert().values().returning()`
- Agent souls: YAML frontmatter + markdown in `orchestration/agents/0*-category/*.md`
- Flows engine: multi-step workflows with checkpoint resume via `stepIndex`
- Memory service: pgvector-backed semantic search with embeddings
- Event bus: `eventBus.emit('ticket.created', { ticketId })` for cross-service coordination
<!-- @end -->

<!-- @section:planner -->

## For Planners

- Clean Architecture: Domain → Application → Infrastructure
- Engines are pluggable: gateway, memory, orchestration, governance
- Agent types: executor, planner, reviewer, specialist
- Agent capabilities: reasoning, agentic, coder, flash, vision, multimodal, guard, judge, router, embedding
- Ticket lifecycle: backlog → queued → in_progress → review → done (or failed/cancelled)
- Workspace types: general, development, staging, system
- Brain entities (mini-brains): self-contained units with own DB, agents, and governance
<!-- @end -->

<!-- @section:reviewer -->

## For Reviewers

- No silent error swallowing — every catch must log or propagate
- Validate at system boundaries only (user input, API routes), trust internal code
- Check for OWASP top 10: injection, XSS, SSRF, auth bypass
- Ensure proper HTTP status codes and error types returned to client
- DB operations that touch multiple tables must use transactions
- Verify agent soul prompts don't contain PII or sensitive data
<!-- @end -->

<!-- @section:ops -->

## For Ops/System Agents

- Health monitoring: `SystemOrchestrator.monitorHealth()` checks all workspaces
- Auto-healing: `HealingEngine.autoHeal()` triggered by `health.degraded` event
- CronEngine: scheduled jobs with auto-pause after 5 consecutive failures
- Event bus events: `ticket.created`, `ticket.completed`, `ticket.failed`, `agent.error`, `health.degraded`, `brain.seeded`
- Token budget enforcement: `TokenLedgerService.checkBudget()` before chat processing
- Agent rebalancing: `SystemOrchestrator.rebalanceAgents()` across workspaces
<!-- @end -->

<!-- @section:dev -->

## For Development Workspace

- `SKIP_AUTH=true` bypasses authentication in development
- Docker compose: postgres + pgvector + jaeger + openclaw + app
- Migrations: run automatically via migrate service on startup
- pgvector extension required: `CREATE EXTENSION IF NOT EXISTS vector`
- Seed data: `brain-seed.ts` provisions 10 category workspaces with 143 agents
- Available Ollama cloud models: qwen3.5:cloud, deepseek-v3.2:cloud, gemini-3-flash-preview:cloud
<!-- @end -->

<!-- @section:anti-hallucination -->

## Anti-Hallucination Rules

- DO NOT reference files, routes, or services that don't exist in the project structure above
- DO NOT assume external services (Redis, Kafka, Elasticsearch) — we use PostgreSQL + pgvector only
- DO NOT use React Server Components with client-side hooks — check 'use client' directives
- DO NOT import from relative paths across package boundaries — use `@solarc/db` or `@solarc/types`
- DO NOT create new tables without a Drizzle migration
- DO NOT bypass the Gateway Router to call LLM APIs directly
<!-- @end -->
