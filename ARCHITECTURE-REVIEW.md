# Solarc Brain — Architecture Review

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-03-24
**Scope:** Full codebase review — architecture, code quality, security, performance, testing

---

## Executive Summary

Solarc Brain is an ambitious AI agent orchestration platform built on solid architectural foundations. The **design vision** (hexagonal architecture, clean layer boundaries, engine isolation) described in `BRAIN-ARCHITECTURE.md` is excellent. However, the **implementation reality** has significant gaps between aspiration and execution. This review identifies 7 critical issues, 12 high-priority findings, and several areas of strength.

**Overall Grade: B-** — Strong vision, solid service implementations, but critical gaps in security, engine packaging, and architectural compliance.

---

## 1. Architecture Compliance

### 1.1 Engine Packages Are Empty Shells (CRITICAL)

All 8 engine packages under `engines/` are **completely empty stubs**:

```typescript
// engines/llm/src/index.ts
// LLM Engine — AI Gateway with circuit breaking, cost tracking, semantic caching
// Implementation: Phase 1
export {}
```

Every engine (`llm`, `memory`, `orchestration`, `guardrails`, `healing`, `a2a`, `eval`, `app-factory`) follows this pattern. The **actual implementations live inside `apps/web/src/server/services/`**, not in the engine packages.

**Impact:** This directly violates the stated architecture:

- Engines are declared as "deployable boundaries" but are non-functional packages
- The `packages/engine-contracts/` defines contracts, but no engine implements them as a separate boundary
- All logic is monolithically coupled inside the Next.js app

**Recommendation:** Either:

1. Move service implementations into their respective engine packages and import them from the app, OR
2. Remove the empty engine packages and update BRAIN-ARCHITECTURE.md to reflect the actual monolith-first approach (honest and pragmatic)

### 1.2 Clean Architecture Layer Violations

The architecture doc states: _"Domain layer has ZERO external imports"_. In practice:

- `packages/engine-contracts/src/index.ts` imports `zod` — a runtime library — in what should be a domain-layer package. Engine contracts are supposed to be pure domain interfaces, not Zod schemas.
- `packages/types/src/index.ts` correctly has zero external deps (good), but `engine-contracts` conflates domain contracts with DTO validation.

**Recommendation:** Split engine-contracts into:

- Pure TypeScript interfaces (domain layer, zero deps)
- Zod schemas (presentation/API layer)

### 1.3 Cross-Engine Communication

The architecture mandates: _"No cross-engine imports — Cross-engine communication goes through the Orchestration Engine or event bus."_

In reality, services directly import each other:

- `flow-engine.ts` imports `CheckpointManager` directly
- `gateway/router.ts` is used directly by routers without going through an orchestration boundary
- There is no event bus implementation anywhere in the codebase

The monolithic structure makes this inevitable. This is fine for the current stage, but the architecture doc should reflect reality.

---

## 2. Security Issues

### 2.1 Authentication is Completely Disabled (CRITICAL)

```typescript
// apps/web/src/server/trpc.ts:24-31
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  // Auth not yet wired — allow requests through so the app is usable.
  return next({ ctx: { ...ctx, session: ctx.session ?? { userId: 'anonymous' } } })
})
```

**Every "protected" endpoint is publicly accessible.** This includes:

- `gateway.storeKey` — Store LLM API keys
- `gateway.rotateKey` — Rotate API keys
- `gateway.chat` — Make LLM calls (at your expense)
- All CRUD operations on agents, tickets, workspaces, etc.

Any user hitting the tRPC endpoint can drain your LLM budget or exfiltrate stored API keys.

**Recommendation:** Wire up authentication (NextAuth, Clerk, or Supabase Auth) before any deployment. Add a middleware that rejects all requests in production if auth is not configured.

### 2.2 Workspace Access Check is Incomplete (HIGH)

```typescript
// apps/web/src/server/trpc.ts:34-45
const workspaceAccess = middleware(async ({ ctx, input, next }) => {
  const workspaceId = (input as Record<string, unknown>)?.workspaceId
  if (typeof workspaceId === 'string' && ctx.session?.userId) {
    const membership = await ctx.db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    })
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this workspace' })
    }
  }
  return next({ ctx })
})
```

Issues:

1. It checks if the **workspace exists**, not if the **user has access** to it — there's no user-workspace membership table
2. If `workspaceId` is not provided, the check is skipped entirely
3. With auth disabled, `ctx.session?.userId` is always 'anonymous', so the check is meaningless

### 2.3 API Keys Accessible via Process Environment (MEDIUM)

`AnthropicAdapter` and `OpenAIAdapter` fall back to `process.env.ANTHROPIC_API_KEY` / `process.env.OPENAI_API_KEY` directly, bypassing the encrypted `KeyVault`. While the KeyVault with AES-256-GCM is well-implemented, the fallback path means keys in env vars are used unencrypted.

### 2.4 SQL Injection Surface (LOW)

Memory search uses `JSON.stringify(queryEmbedding)` interpolated into SQL:

```typescript
sql`1 - (${memoryVectors.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`
```

This is safe because `queryEmbedding` is a `number[]` from the embedding function, not user input. But it's worth noting for future changes.

---

## 3. Code Quality

### 3.1 Singleton Pattern in tRPC Router (HIGH)

```typescript
// apps/web/src/server/routers/gateway.ts:19-26
let gatewayInstance: GatewayRouter | null = null
function getGateway(db: Database): GatewayRouter {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayRouter(db)
  }
  return gatewayInstance
}
```

Module-level singletons are:

- Not testable (global state leaks between tests)
- Not safe for serverless (cold starts may create stale instances)
- Ignore the `db` parameter after first init (if a different db is passed, it's silently ignored)

**Recommendation:** Use a proper DI container or at minimum a per-request factory. The architecture doc actually calls for constructor injection — follow it.

### 3.2 Race Condition in Lock Acquisition (HIGH)

```typescript
// ticket-engine.ts:74-103 — acquireLock()
const existing = await this.db.query.ticketExecution.findFirst(...)
if (existing) {
  if (existing.lockOwner && existing.leaseUntil && existing.leaseUntil > now) {
    return existing.lockOwner === agentId
  }
  await this.db.update(ticketExecution).set({...})
} else {
  await this.db.insert(ticketExecution).values({...})
}
```

This is a classic **TOCTOU (Time-of-check-time-of-use) race condition**. Two agents can read the same expired lease simultaneously and both claim it. The fix is to use a single atomic SQL statement:

```sql
UPDATE ticket_execution SET lock_owner = $1, ...
WHERE ticket_id = $2 AND (lock_owner IS NULL OR lease_until < NOW())
```

### 3.3 Healing Log is In-Memory Only (MEDIUM)

```typescript
// healing-engine.ts:40
private healingLog: HealingRecord[] = []
```

Healing actions are logged to an in-memory array that:

- Is lost on process restart
- Grows unbounded (capped at 1000, but still in-memory)
- Is not visible across replicas in a multi-instance deployment

Should be persisted to the database alongside the existing `guardrail_logs` pattern.

### 3.4 Fire-and-Forget Patterns (MEDIUM)

Multiple places use `promise.catch(() => {})`:

- `memory-service.ts:137` — `trackAccess` errors silently swallowed
- `gateway/router.ts:582` — cache store errors swallowed
- `guardrails/engine.ts:74` — violation logging errors swallowed

While acceptable for non-critical paths, these should at minimum log errors, not silently discard them.

### 3.5 Duplicate Type Definitions (LOW)

`TicketStatus` is defined in:

- `packages/types/src/index.ts` (as a type alias)
- `packages/db/src/schema/core.ts` (as a pgEnum)
- `apps/web/src/server/services/orchestration/ticket-engine.ts` (as a local type)

Same for `MemoryTier`, `AgentStatus`, etc. These should have a single source of truth.

---

## 4. Performance

### 4.1 Memory Search Keyword Fallback Scans Full Table (HIGH)

```typescript
// memory-service.ts:157-160
const all = await this.db.query.memories.findMany({
  where: conditions.length > 0 ? and(...conditions) : undefined,
  orderBy: desc(memories.createdAt),
  limit: 200, // Pre-filter limit
})
```

When embeddings aren't available, keyword search loads up to 200 rows into memory, then does JavaScript-side string matching. With a growing memory table, this will degrade.

**Recommendation:** Use PostgreSQL full-text search (`tsvector`/`tsquery`) instead.

### 4.2 N+1 Query in Ticket Operations

`TicketExecutionEngine.assignAgent()` queries agents, then queries ticket counts per agent separately. This could be a single joined query.

`MemoryService.trackAccess()` updates each memory ID in a loop instead of a batched update.

### 4.3 Connection Pool Sizing (LOW)

```typescript
max: isServerless ? 3 : 20
```

Reasonable defaults, but with 30+ tRPC routers and concurrent requests, 20 connections may be insufficient under load. Consider using PgBouncer for connection pooling in production.

---

## 5. Testing

### 5.1 Good Coverage, Mock-Heavy (MEDIUM)

The test suite has **~4,500 lines across 24 router test files** plus additional service-level tests. This is solid breadth.

However, tests are heavily mock-based:

```typescript
const mockDb = { query: { ... }, insert: vi.fn()... } as any
```

This means tests verify router logic but don't catch:

- Schema mismatches (Drizzle query bugs)
- Transaction correctness
- Constraint violations

**Recommendation:** Add integration tests that run against a real PostgreSQL (the Docker setup is already there). The architecture doc already calls for this: _"Infrastructure tests: test against real services (Docker)"_.

### 5.2 No Tests for Several Service Files

Missing test coverage for:

- `instincts/` (observer, pattern-detector, promoter, evolve)
- `adaptive/layout-engine.ts`
- `browser-agent/stream.ts`
- `mini-brain-factory/factory.ts`
- `visual-qa/` (recorder, reviewer)
- `aitmpl/` (entire service)

---

## 6. Strengths

### 6.1 Gateway Router is Production-Quality

The `GatewayRouter` is the best-implemented component:

- Circuit breaker with proper state machine (CLOSED → OPEN → HALF_OPEN)
- Multi-provider fallback chains with model equivalence mapping
- Semantic caching with skip-cache logic for streaming/tools
- Cost tracking per agent/ticket with budget enforcement
- Rate limiting with token bucket algorithm
- Encrypted API key vault (AES-256-GCM with scrypt key derivation)
- OpenTelemetry tracing integration

### 6.2 Flow Engine is Well-Designed

The `FlowBuilder` provides a clean builder pattern with:

- Sequential, parallel (fan-out/fan-in), conditional, and loop steps
- Checkpoint-per-step for time travel / replay
- Clear separation between definition and execution

### 6.3 Memory Tier System

The three-tier memory (core/recall/archival) with:

- Automatic confidence decay over time
- Promotion pipeline with threshold checks
- Vector similarity search via pgvector
- Keyword fallback when embeddings unavailable

This is a thoughtful design that mirrors how biological memory consolidation works.

### 6.4 Instinct System is Novel

The observe → detect patterns → promote to instinct pipeline is a unique and creative approach to emergent agent behavior. The observer's buffer-and-flush architecture is well-implemented with proper back-pressure handling.

### 6.5 Environment Validation

The lazy-validated `env.ts` proxy pattern is elegant — validates on first access, works with Next.js static generation, fails fast with clear error messages.

### 6.6 Database Schema

Well-structured with:

- Proper foreign keys with appropriate `onDelete` behaviors
- Useful indexes on frequently-queried columns
- pgvector for vector search
- JSONB for flexible metadata

---

## 7. Recommendations (Priority Order)

| #   | Priority     | Action                                                    |
| --- | ------------ | --------------------------------------------------------- |
| 1   | **CRITICAL** | Wire up authentication before any deployment              |
| 2   | **CRITICAL** | Resolve engine-package vs. monolith discrepancy           |
| 3   | **HIGH**     | Fix TOCTOU race in lock acquisition (use atomic SQL)      |
| 4   | **HIGH**     | Replace module-level singletons with DI                   |
| 5   | **HIGH**     | Add integration tests against real PostgreSQL             |
| 6   | **HIGH**     | Use PostgreSQL full-text search for keyword memory search |
| 7   | **MEDIUM**   | Persist healing log to database                           |
| 8   | **MEDIUM**   | Add error logging to fire-and-forget paths                |
| 9   | **MEDIUM**   | Unify duplicate type definitions                          |
| 10  | **MEDIUM**   | Add tests for instincts, aitmpl, visual-qa, adaptive      |
| 11  | **LOW**      | Split engine-contracts into interfaces and Zod schemas    |
| 12  | **LOW**      | Batch N+1 queries (trackAccess, assignAgent)              |

---

## 8. Architecture Scorecard

| Dimension                   | Score | Notes                                                 |
| --------------------------- | ----- | ----------------------------------------------------- |
| **Vision & Design**         | 9/10  | Excellent clean architecture spec, novel concepts     |
| **Implementation Fidelity** | 5/10  | Empty engines, disabled auth, layer violations        |
| **Code Quality**            | 7/10  | Clean TypeScript, good patterns, some race conditions |
| **Security**                | 3/10  | No auth, open endpoints, env-var key fallback         |
| **Performance**             | 7/10  | Good patterns (caching, circuit breaking), some N+1   |
| **Testing**                 | 6/10  | Good breadth, mock-heavy, missing integration tests   |
| **Observability**           | 8/10  | OpenTelemetry, Jaeger, cost tracking, health checks   |
| **DevEx**                   | 8/10  | Turborepo, pnpm, Husky, good scripts, Docker          |

---

_This review was generated by analyzing the full codebase: 30+ tRPC routers, 25+ service modules, 8 engine packages, 7 shared packages, DB schema, tests, config, and the 135KB architecture document._
