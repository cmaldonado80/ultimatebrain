# CLAUDE.md — Project Context for AI Sessions

## What This Is

**Solarc Brain / UltimateBrain** — An AI Corporation Operating System. A multi-agent platform where AI agents organize into departments (Engineering, Design, Security, etc.), execute work through sandboxed tools, self-heal via an OODA-loop cortex, and are governed by scope-based permissions.

This is NOT a simple CRUD app. It's a full operating system for autonomous AI agents.

## Tech Stack

| Layer           | Technology                                               |
| --------------- | -------------------------------------------------------- |
| Framework       | Next.js 15 (App Router)                                  |
| Language        | TypeScript (strict mode)                                 |
| Database        | PostgreSQL via Neon (Drizzle ORM)                        |
| Hosting         | Vercel                                                   |
| Package Manager | pnpm 10.29 (monorepo with Turborepo)                     |
| Testing         | Vitest (982+ tests)                                      |
| Styling         | Tailwind CSS v4 (dark theme, neon color palette)         |
| API             | tRPC (51 routers) + 39 REST/SSE routes                   |
| LLM Gateway     | Multi-provider (Anthropic, OpenAI, Google, Ollama cloud) |

## Monorepo Structure

```
ultimatebrain/
├── apps/
│   ├── web/              ← Main Next.js app (the OS)
│   ├── worker/           ← Background job processor
│   ├── astrology-app/    ← Astrology domain app
│   └── astrology-brain/  ← Astrology Mini Brain
├── packages/
│   ├── db/               ← Database schema + connection (Drizzle)
│   ├── brain-sdk/        ← SDK for Brain ↔ Mini Brain communication
│   ├── mini-brain-sdk/   ← SDK for Mini Brain clients
│   ├── mini-brain-server/← Hono HTTP server for Mini Brains
│   ├── engine-contracts/ ← Shared type contracts
│   ├── ephemeris/        ← Swiss Ephemeris wrapper (astrology)
│   ├── types/            ← Shared TypeScript types
│   └── eslint-config/    ← Shared ESLint configuration
├── templates/            ← Mini Brain + Development app templates
├── scripts/              ← Build scripts, template validation
├── CLAUDE.md             ← THIS FILE
├── .env.example          ← Environment variable documentation
└── .mcp.json             ← MCP server configuration
```

## How to Run Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and at least one LLM API key

# 3. Start dev server (starts web app with Turbopack)
pnpm dev

# 4. Run tests
pnpm test

# 5. Type check
pnpm typecheck

# 6. Lint
pnpm lint
```

## Required Environment Variables

```bash
DATABASE_URL=postgresql://...     # Required — PostgreSQL connection string
AUTH_SECRET=...                    # Required in production (≥16 chars)
VAULT_SECRET=...                  # Required for API key encryption (≥16 chars)
```

At least one LLM provider key is needed for agent chat:

```bash
ANTHROPIC_API_KEY=sk-ant-...      # Best tool calling support
OPENAI_API_KEY=sk-...             # Alternative
GOOGLE_API_KEY=AIza...            # Alternative
```

Default model is `qwen3-coder:480b-cloud` via Ollama/OpenClaw. Override with:

```bash
DEFAULT_MODEL=qwen3-coder-next:cloud
```

## Database

- **ORM**: Drizzle with `pg` driver
- **Schema**: 9 files in `packages/db/src/schema/` (103 tables total)
- **Migration**: Auto-sync via `ensureSchema()` on cold start — no manual migrations needed
- **Schema files**: auth.ts, core.ts, execution.ts, features.ts, intelligence.ts, integrations.ts, platform.ts, astrology.ts
- **Connection pool**: Serverless-aware (max=3 on Vercel/Lambda, max=20 otherwise)
- **Graceful shutdown**: pool.end() on SIGTERM/SIGINT

## Key Architecture: 36 Backend Services

Located in `apps/web/src/server/services/`:

| Service                 | Purpose                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **healing/**            | Self-Healing Cortex — OODA loop, predictive engine, recovery state machine, adaptive tuning, agent degradation, code repair orchestrator, degradation broadcaster                    |
| **sandbox/**            | Sandbox execution — per-agent isolation, policy enforcement, resource limits, audit bridge                                                                                           |
| **orchestration/**      | Work coordination — DAG engine, agent lifecycle, initiative engine, knowledge mesh (DB-backed), goal cascade, work market (DB-backed), codebase mapper, emergent roles, swarm engine |
| **intelligence/**       | AI reasoning — cognition, truth injection, snapshot builders, evidence memory pipeline, context effectiveness tracking                                                               |
| **gateway/**            | LLM routing — multi-provider, circuit breaker, rate limiter, cost tracking, key vault, semantic cache                                                                                |
| **chat/**               | Chat interface — tool executor (71 tools), tool envelopes, tiers, dry-run, disclosure, discovery, loop detection                                                                     |
| **memory/**             | Knowledge persistence — tiered memory, vector search, proof-weighted recall, context feedback, recall flow                                                                           |
| **instincts/**          | Pattern learning — observation → detection → confidence scoring → promotion → injection → outcome scoring → evolution                                                                |
| **evolution/**          | Agent evolution — soul mutation, gating, rollback, post-evolution validation                                                                                                         |
| **task-runner/**        | Autonomous execution — ModeRouter with agentic tool loop, deep work with checkpoints, guardrail gates                                                                                |
| **mini-brain-factory/** | Department creation — 7 templates (engineering, design, security, etc.) with pre-configured agents                                                                                   |
| **platform/**           | Infrastructure — notifications, heartbeat, deployment, financial reports, permissions, tracer                                                                                        |
| **agents/**             | Agent management — YAML soul loading, journey engine                                                                                                                                 |
| **a2a/**                | Agent-to-agent federation — delegation protocol with DB persistence, 11 Brain API endpoints for Mini Brains                                                                          |

## Key Architecture Patterns

### Truth Injection (Most Important)

Agents receive canonical runtime truth BEFORE responding. Located in `intelligence/truth-injection.ts`. Classifies user intent, selects relevant snapshots, injects anti-hallucination rules + structured system state into the system prompt. This prevents agents from "inventing topology."

### Self-Healing Cortex

OODA loop (Observe → Orient → Decide → Act → Learn) runs every 10 minutes via worker. Subsystems: predictive engine (percentile anomaly detection), recovery state machine (multi-path with rollback), adaptive resource tuner, instinct action executor, agent capability degradation (full → reduced → minimal → suspended), code repair orchestrator (detects recurring errors → creates repair tickets → agents fix bugs autonomously). 10 closed feedback loops connect instincts, memory, evolution, market reputation, context effectiveness, tool analytics, and degradation signals into a unified learning organism.

### Sandbox Execution

Every tool call routes through: permission check → policy check → sandbox execute → audit log. 3-tier tool classification: safe (anyone), privileged (logged), raw/admin (approval required). Dry-run mode for destructive operations.

### Scope-Based Permissions

OAuth 2.0-inspired scopes: `tools:read`, `tools:write`, `tools:execute`, `tools:admin`, `network:internal`, `network:external`, `data:query`, `data:mutate`, `comms:send`, `system:heal`. Role-based defaults. Full audit trail.

### Work Verification

Goal-backward verification (stolen from GSD): truths (async checks), artifacts (file existence + content), key links (cross-references between files).

## File Path Convention

The Next.js app working directory is `apps/web/`. File paths in tools should be relative to this:

- `src/server/services/healing/cortex.ts` (correct)
- `apps/web/src/server/services/healing/cortex.ts` (also works — auto-stripped)

## UI & Design System

- **Full design spec in `DESIGN.md`** — read it before generating any UI
- Dark theme with neon color palette (cyber aesthetic)
- Shared components in `apps/web/src/components/ui/` (13 components)
- Pages in `apps/web/src/app/(dashboard)/` (85+ pages)
- Nerve Center: real-time dashboard with SSE streaming + SVG sparklines
- Tool Catalog: browsable directory of all 43 classified tools
- Agent Forensics: deep-dive into agent health and transition history
- All grids use responsive breakpoints (never hardcode `grid-cols-N` without `sm:/md:/lg:`)
- Use `cyber-card`, `cyber-btn-primary`, `cyber-input` classes — not raw Tailwind

## Testing

```bash
pnpm test          # Run all 995+ tests
pnpm typecheck     # TypeScript strict check (18 packages)
pnpm lint          # ESLint (14 packages)
pnpm brain:validate # Template validation pipeline
```

## Current Default LLM Model

`qwen3-coder:480b-cloud` via Ollama (routed through OpenClaw). Supports tool calling. Configurable via `DEFAULT_MODEL` env var.

## Important: What NOT to Do

- Do NOT hardcode system state in agent prompts — use truth injection
- Do NOT assume file paths start from monorepo root — cwd is `apps/web/`
- Do NOT add `unsafe-eval` to CSP in production
- Do NOT push to main without PR (branch protection enabled)
- Do NOT commit `.env.local` (contains secrets)
- Do NOT generate UI without reading `DESIGN.md` first — follow the design system
- Do NOT use `console.log` in production — use `logger` from `@/lib/logger`
- Do NOT use `.catch(() => {})` — all catches must log via `logger.warn`
- Do NOT expose `err.message` to clients — use generic error messages
