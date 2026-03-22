# Solarc v4 — The Brain: Central Intelligence Core

## Context

This is NOT a dashboard rebuild. This is a **Brain** — a central intelligence core that:

1. **Creates new applications**: Vertical apps (e.g., MGHM hotel operations) are spawned FROM the Brain, not built alongside it
2. **Provides engines**: Connectable modules (LLM, memory, orchestration, governance) that child apps plug into
3. **Houses agents**: Brain agents connect to child apps for healing, improvement, chat, monitoring, and autonomous operations
4. **Is the single source of intelligence**: All knowledge, memory, decision-making, and agent coordination lives here

Child apps (hotel management, healthcare, legal, marketing, etc.) are thin domain-specific UIs that call Brain engines. The Brain owns the intelligence. The apps own the domain.

---

## Clean Architecture Enforcement Rules

These rules are **non-negotiable**. Every PR, every agent-generated code change, every Mini Brain scaffold MUST comply. Violations are caught by guardrails, CI linting, and the Architect Agent.

### The Dependency Rule

```
Source code dependencies ALWAYS point inward. Nothing in an inner circle
can know about anything in an outer circle.

┌─────────────────────────────────────────────────────────┐
│  OUTER: Infrastructure (DB, LLM providers, MCP, HTTP)   │
│  ┌─────────────────────────────────────────────────┐    │
│  │  MIDDLE: Application (Use cases, Flows, Crews)   │    │
│  │  ┌─────────────────────────────────────────┐     │    │
│  │  │  INNER: Domain (Entities, Value Objects,  │     │    │
│  │  │  Events, Ports/Interfaces)                │     │    │
│  │  └─────────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Layer Boundaries

| Layer | Can Import From | NEVER Imports From | Lives In |
|-------|----------------|-------------------|----------|
| **Domain** (entities, value objects, events, ports) | Nothing (zero deps) | Application, Infrastructure, UI | `packages/types/`, engine `contracts/` |
| **Application** (use cases, flows, crews) | Domain only | Infrastructure, UI | `engines/*/core/`, `src/server/services/` |
| **Infrastructure** (DB adapters, LLM providers, MCP) | Domain (implements ports) | Application directly | `src/server/adapters/`, `packages/db/` |
| **Presentation** (tRPC routers, API routes, UI) | Application (via ports) | Infrastructure internals | `src/server/routers/`, `src/app/` |

### Concrete Rules

1. **Domain layer has ZERO external imports** — No `drizzle-orm`, no `@trpc/server`, no `pg`, no `@anthropic-ai/sdk`. Only standard TypeScript. Domain types live in `packages/types/` and `packages/engine-contracts/`.

2. **Ports define the contract, adapters fulfill it** — Every external integration (Postgres, OpenClaw, LLM providers, MCP servers) connects through a port interface defined in the domain layer. Swapping Postgres for MySQL or Claude for GPT requires changing only the adapter, never the use case.

3. **Use cases orchestrate, never implement I/O** — A use case calls `this.llmPort.chat()`, never `anthropic.messages.create()`. A use case calls `this.memoryPort.search()`, never `db.select().from(memories)`.

4. **No cross-engine imports** — The LLM Engine never imports from the Memory Engine directly. Cross-engine communication goes through the Orchestration Engine or event bus. Each engine is a deployable boundary.

5. **DTOs at boundaries only** — Data Transfer Objects (Zod schemas) exist only at the API/tRPC layer. Internally, use domain entities and value objects. Never pass a Drizzle row type through a use case.

6. **Events over direct calls for cross-domain** — Mini Brains communicate with the Brain via engine APIs, never by directly querying each other's databases. Developments NEVER access the Brain's Postgres — they go through the Mini Brain SDK.

7. **Infrastructure config is injected, never imported** — Database URLs, API keys, and service endpoints are injected via dependency injection (constructor params or factory functions). No `process.env` reads inside domain or application layers.

8. **Test isolation follows the architecture** — Domain tests: pure unit tests, no mocks needed. Application tests: mock the ports. Infrastructure tests: test against real services (Docker). E2E tests: test through the API.

### Enforcement Mechanisms

| Mechanism | What It Catches | When It Runs |
|-----------|----------------|--------------|
| **ESLint `no-restricted-imports`** | Domain importing from infrastructure | Every save (IDE) + CI |
| **TypeScript project references** | Cross-package boundary violations | `tsc --build` in CI |
| **Architect Agent guardrail** | Structural violations in agent-generated code | Every autonomous/deep-work ticket |
| **PR review checklist** | Manual verification of layer compliance | Every pull request |
| **Dependency graph CI check** | Circular dependencies, layer violations | GitHub Actions on every push |

```typescript
// ESLint rule example for packages/types/
// .eslintrc.js in packages/types/
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        'drizzle-orm*', '@trpc/*', 'pg', 'pg-boss',
        '@anthropic-ai/*', '@openai/*', 'openai',
        '../adapters/*', '../infrastructure/*',
        '../server/*', '../app/*'
      ]
    }]
  }
}
```

### Architecture Per Tier

| Tier | Architecture Style | Rationale |
|------|-------------------|-----------|
| **Brain** | Hexagonal (Ports & Adapters) + Event-Driven | Must support swappable providers, multiple consumers, engine isolation |
| **Mini Brain** | Hexagonal for domain engines, simplified for glue code | Domain engines need the same rigor; brain-bridge is thin adapter |
| **Development** | Feature-based modules with Mini Brain SDK as the I/O boundary | Apps are thin — most intelligence comes from Mini Brain. Keep simple |

---

## Architecture Overview: Three-Tier Intelligence Hierarchy

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            TIER 1: THE BRAIN
                     (Central Intelligence Core)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Universal engines: LLM, Memory, Orchestration, Eval, Guardrails, A2A
  Universal agents: Healers, Monitors, Governance, Compliance
  Universal knowledge: Cross-domain lessons, golden rules, trust scores
  Platform services: Auth, billing, app factory, skill marketplace

  The Brain NEVER contains domain logic. It provides intelligence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          │                    │                    │
          ▼                    ▼                    ▼
━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━
  TIER 2: MINI      TIER 2: MINI         TIER 2: MINI
  BRAIN             BRAIN                BRAIN
  "Astrology"       "Hospitality"        "Legal"
━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━

  Domain engines:     Domain engines:       Domain engines:
  • Swiss Ephemeris   • PMS Integration     • Case Law Search
  • Chart Calculator  • Revenue Mgmt        • Contract Parser
  • Transit Engine    • Guest Profile       • Compliance Check

  Domain DB:          Domain DB:            Domain DB:
  • Natal charts      • Reservations        • Cases
  • Client profiles   • Guest history       • Contracts
  • Ephemeris data    • Revenue data        • Regulations

  Domain agents:      Domain agents:        Domain agents:
  • Astrologer        • Revenue Analyst     • Paralegal
  • Chart Interpreter • Concierge          • IP Counsel
  • Transit Tracker   • F&B Optimizer      • Compliance Auditor

  Inherits from Brain: LLM, Memory, Eval,  Guardrails, A2A, Healing

━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━   ━━━━━━━━━━━━━━━━━━
    │    │    │          │    │    │          │    │    │
    ▼    ▼    ▼          ▼    ▼    ▼          ▼    ▼    ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    TIER 3: DEVELOPMENTS (Apps)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Astrology Mini Brain spawns:          Hospitality Mini Brain spawns:
  ┌────────────┐ ┌──────────────┐      ┌──────────────┐ ┌────────────┐
  │ Sports     │ │ Personal     │      │ MGHM Hotels  │ │ Boutique   │
  │ Astrology  │ │ Astrology    │      │ (10 props)   │ │ Resorts    │
  │ App        │ │ App          │      │              │ │ App        │
  │            │ │              │      │              │ │            │
  │ • Team     │ │ • Birth chart│      │ • Room mgmt  │ │ • Wellness │
  │   analysis │ │ • Daily      │      │ • F&B ops    │ │ • Boutique │
  │ • Match    │ │   horoscope  │      │ • Staff      │ │   events   │
  │   predict  │ │ • Compat.    │      │ • Guest exp  │ │ • Spa      │
  │ • Season   │ │ • Transit    │      │ • Revenue    │ │   booking  │
  │   forecast │ │   alerts     │      │ • Marketing  │ │            │
  └────────────┘ └──────────────┘      └──────────────┘ └────────────┘

  ┌──────────────┐                     Legal Mini Brain spawns:
  │ Business     │                     ┌──────────────┐ ┌────────────┐
  │ Astrology    │                     │ IP Portfolio  │ │ Contract   │
  │ App          │                     │ Manager      │ │ Review     │
  │              │                     │              │ │ App        │
  │ • Founding   │                     │ • Patent     │ │ • Clause   │
  │   dates      │                     │   tracking   │ │   analysis │
  │ • Partnership│                     │ • Prior art  │ │ • Risk     │
  │   compat.    │                     │ • Filing     │ │   scoring  │
  │ • Market     │                     │   deadlines  │ │ • Template │
  │   timing     │                     │              │ │   library  │
  └──────────────┘                     └──────────────┘ └────────────┘

  Each Development:
  • Calls Mini Brain for domain engines + domain agents
  • Mini Brain calls The Brain for universal engines
  • Chain: App → Mini Brain → Brain (intelligence cascades up)
```

---

## How the Three Tiers Interact

### Intelligence Cascade (bottom → up)

```
Sports Astrology App needs LLM inference:
  1. App calls Mini Brain: brain.llm.chat({ context: team_chart_data })
  2. Mini Brain enriches with domain context:
     - Injects ephemeris data for current transits
     - Adds team natal chart from domain DB
     - Applies astrology-specific guardrails ("never make medical claims")
  3. Mini Brain calls The Brain: brain.llm.chat({ enriched_prompt })
  4. The Brain routes to best provider, applies universal guardrails, tracks cost
  5. Response cascades back: Brain → Mini Brain → App
```

### Knowledge Cascade (top → down)

```
The Brain learns a universal lesson (e.g., "GPT-4o hallucinates dates"):
  1. Brain stores in universal memory (tier: archival)
  2. All Mini Brains inherit this knowledge automatically
  3. Mini Brains propagate relevant lessons to their Developments
  4. Astrology Mini Brain additionally stores: "always verify ephemeris dates against Swiss Ephemeris, never trust LLM date calculations"
```

### Healing Cascade (top monitors all)

```
Brain Healer Agent detects anomaly in Hospitality Mini Brain:
  1. Brain alerts Hospitality Mini Brain's own healer
  2. Mini Brain healer diagnoses: "MGHM Hotels app has 50% error rate on guest check-in"
  3. Mini Brain healer creates repair ticket
  4. If Mini Brain can't fix it → escalates to Brain's master healer
  5. Brain healer has cross-domain knowledge, may have seen similar issue in Legal apps
```

---

## What Each Tier Owns

### The Brain (Tier 1)
| Owns | Examples |
|------|---------|
| Universal LLM routing | Provider selection, failover, caching, cost |
| Universal memory | Cross-domain lessons, golden rules |
| Universal orchestration | Task execution, approval gates, receipts |
| Universal eval | Quality scoring, drift detection |
| Universal guardrails | Prompt injection, toxicity, OWASP |
| Universal observability | OpenTelemetry, traces, metrics |
| Platform services | Auth, billing, app factory, skill marketplace |
| Mini Brain factory | Scaffold + wire new Mini Brains |
| Healing oversight | Monitor all Mini Brains + escalation |

### Mini Brain (Tier 2)
| Owns | Examples |
|------|---------|
| Domain-specific engines | Swiss Ephemeris, PMS integration, Case Law search |
| Domain database | Natal charts, reservations, contracts |
| Domain agents | Astrologer, Concierge, Paralegal |
| Domain guardrails | "No medical claims" (astrology), "HIPAA compliance" (healthcare) |
| Domain memory | Astrology interpretations, hotel guest preferences, legal precedents |
| Domain eval | Domain-specific quality metrics |
| Development factory | Scaffold + wire domain-specific apps |
| Development healing | Monitor + repair domain apps |

### Development (Tier 3)
| Owns | Examples |
|------|---------|
| End-user UI | Sports astrology dashboard, hotel booking interface |
| User-facing data | User accounts, preferences, history |
| Business logic | Match predictions, room pricing, contract scoring |
| User interactions | Chat, notifications, reports |

### What Developments DON'T own:
- LLM inference (Mini Brain → Brain)
- Agent orchestration (Mini Brain → Brain)
- Memory/knowledge (Mini Brain → Brain)
- Monitoring/healing (Mini Brain → Brain)
- Security/guardrails (Mini Brain → Brain)

---

## Mini Brain Architecture

Each Mini Brain is itself a Next.js app (or Express service) with:

```
astrology-mini-brain/
├── src/
│   ├── engines/                    # Domain-specific engines
│   │   ├── ephemeris/              # Swiss Ephemeris wrapper
│   │   │   ├── calculator.ts       # Chart computation
│   │   │   ├── transits.ts         # Transit engine
│   │   │   └── data/               # Ephemeris data files
│   │   ├── chart-interpreter/      # AI-powered chart reading
│   │   │   ├── natal.ts            # Natal chart interpretation
│   │   │   ├── synastry.ts         # Compatibility analysis
│   │   │   └── mundane.ts          # World events astrology
│   │   └── client-profiler/        # Client management
│   │       ├── profile.ts          # Birth data + preferences
│   │       └── history.ts          # Reading history
│   │
│   ├── agents/                     # Domain agents (soul.md + skills)
│   │   ├── master-astrologer/      # Senior interpreter
│   │   ├── transit-tracker/        # Monitors planetary movements
│   │   ├── sports-analyst/         # Sports-specific readings
│   │   └── business-advisor/       # Business timing advisor
│   │
│   ├── server/
│   │   ├── routers/                # tRPC routers for domain API
│   │   │   ├── charts.ts           # Chart CRUD + computation
│   │   │   ├── readings.ts         # AI interpretation requests
│   │   │   ├── clients.ts          # Client management
│   │   │   └── transits.ts         # Transit alerts + forecasts
│   │   ├── guardrails/             # Domain guardrails
│   │   │   ├── no-medical.ts       # Never make health claims
│   │   │   ├── no-financial.ts     # Never give financial advice
│   │   │   └── disclaimer.ts       # Auto-append disclaimers
│   │   └── brain-bridge.ts         # Connection to The Brain
│   │
│   └── db/
│       ├── schema.ts               # Domain Drizzle schema
│       │   ├── clients             # Name, birth_date, birth_time, birth_place, timezone
│       │   ├── natal_charts        # Computed chart data (planets, houses, aspects)
│       │   ├── readings            # AI interpretations with agent + model used
│       │   ├── transit_alerts      # Upcoming significant transits
│       │   └── sports_teams        # Team founding dates, key player charts
│       └── migrations/
│
├── docker-compose.yml              # Mini Brain's own Postgres + this service
└── package.json                    # Depends on @solarc/brain-sdk
```

### Mini Brain → Brain Connection

```typescript
// astrology-mini-brain/src/server/brain-bridge.ts
import { createBrainClient } from '@solarc/brain-sdk'
import { createMiniBrainServer } from '@solarc/mini-brain-sdk'

// Connect UP to The Brain (consume universal engines)
const brain = createBrainClient({
  apiKey: process.env.BRAIN_API_KEY,
  endpoint: process.env.BRAIN_URL,
  engines: ['llm', 'memory', 'eval', 'guardrails', 'a2a', 'healing'],
  domain: 'astrology'  // scopes memory + metrics
})

// Expose DOWN to Developments (provide domain engines)
const miniBrain = createMiniBrainServer({
  engines: {
    ephemeris: ephemerisEngine,
    charts: chartEngine,
    interpreter: interpreterEngine,
    clients: clientEngine,
  },
  agents: domainAgents,
  guardrails: domainGuardrails,
  // Proxy universal engines through to developments:
  proxy: {
    llm: brain.llm,        // Developments call mini.llm → Brain.llm
    memory: brain.memory,   // With domain context injected
    eval: brain.eval,
    guardrails: brain.guardrails,  // Domain + universal guardrails stacked
  }
})
```

### Development → Mini Brain Connection

```typescript
// sports-astrology-app/src/lib/brain.ts
import { createMiniBrainClient } from '@solarc/mini-brain-sdk'

const astro = createMiniBrainClient({
  apiKey: process.env.MINI_BRAIN_API_KEY,
  endpoint: process.env.ASTROLOGY_MINI_BRAIN_URL,
})

// Domain engine (handled by Mini Brain)
const chart = await astro.ephemeris.calculate({ date: '1990-06-15', time: '14:30', place: 'London' })

// LLM call (Mini Brain enriches → Brain routes to provider)
const reading = await astro.llm.chat({
  messages: [{ role: 'user', content: 'Analyze this team chart for upcoming match' }],
  context: { chart, opponent_chart, transit_data }
})

// Memory (scoped to astrology domain, stored in Brain)
await astro.memory.store({ key: 'team-pattern', content: 'Mars-Jupiter conjunctions correlate with wins', tier: 'archival' })
```

---

## Astrology Example — Full Flow

### Brain builds Astrology Mini Brain:

```
1. Admin in Brain dashboard: "Create Mini Brain: Astrology"
2. Brain App Factory:
   a. Scaffolds Mini Brain from template
   b. Sets up domain Postgres (charts, clients, ephemeris data)
   c. Downloads Swiss Ephemeris data files
   d. Creates domain agents: master-astrologer, transit-tracker, sports-analyst, business-advisor
   e. Registers Mini Brain in Brain's app_connections table
   f. Assigns Brain healer to monitor
3. Mini Brain is live at astrology.solarc.local
```

### Astrology Mini Brain creates Sports Astrology Development:

```
1. Admin in Mini Brain dashboard: "Create Development: Sports Astrology"
2. Mini Brain Dev Factory:
   a. Scaffolds Next.js app from sports-astrology template
   b. Pre-wires @solarc/mini-brain-sdk pointing to Astrology Mini Brain
   c. Creates domain-specific UI: team profiles, match predictions, season forecasts
   d. Provisions: sports_teams table, match_predictions table
   e. Assigns domain agents: sports-analyst (primary), transit-tracker (alerts)
3. Sports Astrology App is live at sports.astrology.solarc.local
```

### End user asks for a match prediction:

```
User → Sports App: "Will Manchester United win Saturday?"
  │
  ▼
Sports App → Astrology Mini Brain:
  astro.ephemeris.calculate({ date: 'Saturday', teams: ['Man Utd', 'Arsenal'] })
  astro.llm.chat({ prompt: 'Analyze match', context: { charts, transits } })
  │
  ▼
Astrology Mini Brain:
  1. Computes natal charts for both teams (Swiss Ephemeris engine)
  2. Calculates transits for match date
  3. Injects domain context: chart data + historical patterns from domain memory
  4. Applies domain guardrails: "no gambling advice, add disclaimer"
  5. Calls Brain: brain.llm.chat({ enriched_prompt })
  │
  ▼
The Brain:
  1. Routes to best LLM (Claude for complex analysis)
  2. Applies universal guardrails (prompt injection check)
  3. Tracks cost (charged to astrology domain)
  4. Returns streaming response
  │
  ▼
Response cascades back:
  Brain → Mini Brain (strips internal metadata) → Sports App → User

User sees: "Based on planetary transits, Mars conjunct Man Utd's natal Jupiter
suggests offensive strength... [full analysis] ... Disclaimer: This is for
entertainment purposes only."
```

---

## The Engine System — Brain's Pluggable API

Every engine is a self-contained module that child apps can connect to. Engines expose a standardized API (tRPC + A2A + MCP).

### Engine 1: LLM Engine (`src/server/engines/llm/`)
**What child apps get**: Multi-provider LLM inference with failover, caching, cost tracking, guardrails
**API**:
- `llm.chat({ model, messages, tools?, stream? })` → streaming response
- `llm.embed({ text, model? })` → vector embedding
- `llm.models()` → available models list
- `llm.usage({ app_id, period })` → token consumption + cost

**What the Brain handles**: Provider routing, circuit breaking, semantic caching, rate limiting, key vault, cost budgets per app. Child apps never touch API keys.

### Engine 2: Orchestration Engine (`src/server/engines/orchestration/`)
**What child apps get**: Task execution, agent coordination, approval gates, cron scheduling
**API**:
- `orch.createTicket({ title, description, agent?, mode? })` → ticket with execution tracking
- `orch.runFlow({ flow_id, params })` → deterministic workflow execution
- `orch.spawnCrew({ agents, goal })` → autonomous multi-agent team
- `orch.requestApproval({ action, risk, metadata })` → human-in-the-loop gate
- `orch.scheduleCron({ schedule, task, agent })` → recurring job
- `orch.getStatus({ ticket_id })` → execution status + trace

**What the Brain handles**: Lease management, model failover, retries, DLQ, receipts, checkpointing. Child apps just submit work.

### Engine 3: Memory Engine (`src/server/engines/memory/`)
**What child apps get**: Persistent knowledge with semantic search across tiers
**API**:
- `memory.store({ key, content, tier, app_id?, workspace? })` → store with auto-embedding
- `memory.search({ query, tier?, app_id?, limit? })` → hybrid search (vector + BM25)
- `memory.recall({ agent_id })` → agent's core + recent recall memories
- `memory.consolidate({ app_id })` → compress and distill learnings
- `memory.graph({ query })` → knowledge graph traversal

**What the Brain handles**: pgvector indexing, tiered storage, temporal decay, MMR dedup, cross-app knowledge sharing (with isolation). An agent helping MGHM hotels can access hospitality lessons learned from other hotel apps.

### Engine 4: Eval Engine (`src/server/engines/eval/`)
**What child apps get**: Quality monitoring, drift detection, regression testing
**API**:
- `eval.saveCase({ input, expected, trace_id, dataset? })` → save eval case
- `eval.run({ dataset_id, version? })` → run eval suite, return scores
- `eval.drift({ app_id, period })` → quality trend over time
- `eval.compare({ version_a, version_b })` → A/B comparison
- `eval.suggest({ trace_id })` → AI-powered improvement suggestions

**What the Brain handles**: Eval execution, scoring (LLM-as-judge + rule-based), drift alerting, CI/CD integration. Child apps just tag traces.

### Engine 5: Guardrail Engine (`src/server/engines/guardrails/`)
**What child apps get**: Input/output/tool validation with policy enforcement
**API**:
- `guard.checkInput({ prompt, agent_id, policies? })` → { passed, violations }
- `guard.checkOutput({ response, context, policies? })` → { passed, violations, modified? }
- `guard.checkTool({ tool_name, params, agent_id })` → { allowed, reason }
- `guard.policies({ app_id })` → active policies
- `guard.log({ app_id, period })` → violation history

**What the Brain handles**: Prompt injection detection, toxicity checking, hallucination detection, tool scope enforcement, policy management per app/workspace.

### Engine 6: A2A Engine (`src/server/engines/a2a/`)
**What child apps get**: Inter-app agent communication and delegation
**API**:
- `a2a.discover({ capability? })` → available agents across all apps
- `a2a.delegate({ agent_id, task, context, callback? })` → cross-app task delegation
- `a2a.message({ from_agent, to_agent, text })` → inter-app messaging
- `a2a.status({ task_id })` → delegation status

**What the Brain handles**: Agent registry, capability matching, routing, auth, long-running task support. MGHM hotel app can ask a financial analyst agent in the Brain for revenue forecasting.

### Engine 7: Mini Brain Factory (`src/server/engines/mini-brain-factory/`)
**What it does**: Scaffolds new Mini Brains (Tier 2) from the Brain
**API**:
- `factory.createMiniBrain({ name, domain, engines?, agents? })` → scaffold Mini Brain with domain DB, engines, agents
- `factory.createDevelopment({ mini_brain_id, name, template? })` → scaffold child app wired to a Mini Brain
- `factory.templates()` → available templates (astrology, hospitality, legal, healthcare, marketing, soc-ops)
- `factory.connect({ entity_id, parent_id, engines[] })` → wire entity to parent
- `factory.health({ entity_id })` → health check via healing agents
- `factory.upgrade({ entity_id, engine, version })` → upgrade engine version
- `factory.topology()` → full Brain → Mini Brain → Development tree

**What the Brain handles**: Scaffolding, engine wiring, agent assignment, health monitoring. Mini Brains inherit Brain engines by default and can add domain-specific engines on top.

### Engine 8: Healing Engine (`src/server/engines/healing/`)
**What child apps get**: Autonomous monitoring, error detection, and self-repair
**API**:
- `heal.monitor({ app_id })` → start continuous monitoring
- `heal.diagnose({ app_id, symptom })` → AI-powered root cause analysis
- `heal.repair({ app_id, issue_id, auto? })` → auto-repair or suggest fix
- `heal.incidents({ app_id })` → incident history with resolutions
- `heal.posture({ app_id })` → security + health posture score

**What the Brain handles**: Brain agents continuously monitor child apps via health endpoints, log analysis, and metric anomaly detection. When something breaks, a healer agent diagnoses and either auto-fixes (if low risk) or creates an approval-gated repair ticket.

---

## App Connection Protocol

### How a child app connects to the Brain:

```
1. Brain scaffolds app via App Factory Engine
2. App receives: Brain SDK (npm package) + API key + engine endpoints
3. App imports: `import { brain } from '@solarc/brain-sdk'`
4. App initializes: `brain.connect({ apiKey, engines: ['llm', 'memory', 'eval'] })`
5. App calls engines: `const response = await brain.llm.chat({ ... })`
6. Brain agents auto-connect to app's health endpoint
```

### Brain SDK (`packages/brain-sdk/`):
- TypeScript npm package published from the Brain monorepo
- Auto-generated from tRPC router types (full type safety)
- Handles: auth, retries, streaming, WebSocket for real-time events
- Lightweight: only includes client code, no server dependencies
- Framework-agnostic: works in Next.js, Express, React Native, etc.

### Connection tables in Postgres:
```
-- Tracks all entities in the hierarchy
brain_entities (
  id,
  name,
  domain,                           -- 'astrology', 'hospitality', 'legal'
  tier enum[brain/mini_brain/development],
  parent_id FK → brain_entities,    -- NULL for Brain, Brain id for Mini Brains, Mini Brain id for Developments
  engines_enabled text[],           -- which engines this entity uses
  domain_engines JSONB,             -- domain-specific engines (Mini Brains only)
  api_key_hash,
  endpoint,                         -- URL where this entity is reachable
  health_endpoint,                  -- URL for healing agents to monitor
  status enum[active/suspended/degraded/provisioning],
  config JSONB,                     -- domain-specific config
  last_health_check,
  created_at, updated_at
)

-- Tracks which agents are assigned to which entity
brain_entity_agents (
  entity_id FK → brain_entities,
  agent_id FK → agents,
  role enum[primary/monitor/healer/specialist],
  created_at
)

-- Tracks engine usage per entity
brain_engine_usage (
  id,
  entity_id FK → brain_entities,
  engine text,                       -- 'llm', 'memory', 'ephemeris', etc.
  requests_count,
  tokens_used,
  cost_usd,
  period date,                       -- aggregated per day
  created_at
)
```

### Example: MGHM Hotel Operations (via Hospitality Mini Brain)

```
Brain                              MGHM Hotel App
  │                                     │
  │  ← brain.llm.chat(guest query) ──── │  Guest asks about room availability
  │  ── streaming response ──────────→  │
  │                                     │
  │  ← brain.memory.search(guest) ───── │  Look up guest preferences
  │  ── past stays, preferences ─────→  │
  │                                     │
  │  ← brain.orch.createTicket() ────── │  F&B needs restocking analysis
  │  ── ticket assigned to analyst ──→  │
  │                                     │
  │  brain.heal.monitor() ──────────→   │  Healer agent checks app health
  │  ← metrics + logs ──────────────── │
  │                                     │
  │  brain.a2a.delegate(cfo, forecast)  │  Hotel asks CFO agent for forecast
  │  ── revenue projection ──────────→  │
```

---

## Phase 0 — Foundation (Week 1-2)

### 0A: Project Scaffold
- Turborepo monorepo:
  ```
  solarc-brain/
  ├── apps/
  │   ├── web/              # Next.js 15 Brain dashboard
  │   └── worker/           # pg-boss long-lived worker
  ├── packages/
  │   ├── brain-sdk/           # @solarc/brain-sdk (Mini Brains connect UP to Brain)
  │   ├── mini-brain-sdk/      # @solarc/mini-brain-sdk (Developments connect UP to Mini Brain)
  │   ├── mini-brain-server/   # @solarc/mini-brain-server (Mini Brain exposes DOWN to Developments)
  │   ├── db/                  # Drizzle schema + migrations (shared)
  │   ├── types/               # Shared TypeScript types
  │   └── engine-contracts/    # Engine API contracts (Zod schemas)
  ├── engines/              # Brain engine implementations
  │   ├── llm/
  │   ├── orchestration/
  │   ├── memory/
  │   ├── eval/
  │   ├── guardrails/
  │   ├── a2a/
  │   ├── app-factory/
  │   └── healing/
  ├── openclaw/             # Git submodule (upstream, untouched)
  ├── templates/            # App scaffolding templates
  │   ├── nextjs-app/       # Base Next.js child app template
  │   ├── hotel-ops/        # MGHM hotel operations template
  │   ├── healthcare/       # Healthcare compliance template
  │   └── marketing/        # Campaign management template
  ├── docker-compose.yml
  ├── turbo.json
  └── pnpm-workspace.yaml
  ```
- Install core deps: `drizzle-orm`, `pg`, `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`, `zustand`, `zod`, `pg-boss`
- Install UI: `shadcn@latest init` with dark theme preset
- Docker Compose: Postgres 17 (pgvector/pgvector:pg17), OpenClaw daemon, app, worker, Jaeger

### 0B: Postgres Schema + Drizzle
Migrate all 25 JSON files to relational tables:

**Core tables:**
- `workspaces` (id, name, type, goal, color, icon, autonomy_level, settings JSONB)
- `agents` (id, name, type, workspace_id FK, status, model, color, bg, description, tags text[], skills text[], is_ws_orchestrator, trigger_mode)
- `tickets` (id, title, description, status, priority, complexity, workspace_id FK, assigned_agent_id FK, project_id FK, dag_id, dag_node_type, metadata JSONB, result, created_at, updated_at)
- `ticket_execution` (ticket_id PK/FK, run_id, lock_owner FK, locked_at, lease_until, lease_seconds, wake_pending_count, last_wake_at)
- `ticket_status_history` (ticket_id FK, from_status, to_status, changed_at)
- `ticket_comments` (id, ticket_id FK, agent_id FK, text, created_at)
- `ticket_dependencies` (ticket_id FK, blocked_by_ticket_id FK)
- `ticket_proof` (ticket_id PK/FK, status, shadow_required, visual_required, shadow_run_id, visual_run_id, checked_at, details JSONB)
- `projects` (id, name, goal, status, deadline, health_score, health_diagnosis, synthesis, cancelled, created_at, updated_at)
- `project_workspaces` (project_id FK, workspace_id FK)
- `project_log` (id, project_id FK, workspace_id, agent_id, reply, created_at)

**Execution & jobs:**
- `cron_jobs` (id, name, schedule, type, status, task, workspace_id FK, agent_id FK, enabled, fail_count, last_run, next_run, last_result, runs, fails)
- `ephemeral_swarms` (id, task, status, created_at)
- `swarm_agents` (swarm_id FK, agent_id FK, role)
- `receipts` (id, agent_id FK, ticket_id FK, project_id FK, workspace_id, trigger, status, started_at, completed_at, duration_ms, rollback_available)
- `receipt_actions` (id, receipt_id FK, sequence, type, target, summary, status, is_rollback_eligible, duration_ms, pre_state JSONB, result JSONB, created_at)
- `receipt_anomalies` (id, receipt_id FK, description, severity, created_at)
- `approval_gates` (id, action, agent_id FK, risk, status, requested_at, decided_at, decided_by, reason, metadata JSONB, expires_at)

**Intelligence & memory:**
- `memories` (id, key, content, source FK, confidence, workspace_id FK, tier enum[core/recall/archival], created_at)
- `memory_vectors` (memory_id FK/PK, embedding vector(1536)) — pgvector HNSW index
- `chat_sessions` (id, agent_id FK, created_at, updated_at)
- `chat_messages` (id, session_id FK, role, text, attachment JSONB, created_at) — partitioned by month
- `agent_messages` (id, from_agent_id FK, to_agent_id FK, text, read, ack_status, created_at)
- `episodes` (id, event_type, payload JSONB, created_at) — partitioned by month
- `cognition_state` (id=1, features JSONB, policies JSONB, updated_at)
- `prompt_overlays` (id, workspace_id FK, content, active, created_at)
- `agent_trust_scores` (agent_id PK/FK, score, factors JSONB, updated_at)
- `cognitive_candidates` (id, memory_id FK, status, created_at)

**Integrations:**
- `channels` (id, type, config JSONB encrypted, enabled, created_at)
- `webhooks` (id, source, url, secret, enabled, created_at)
- `artifacts` (id, name, content, ticket_id FK, agent_id FK, type, created_at)
- `strategy_runs` (id, plan, status, agent_id FK, workspace_id FK, tickets text[], created_at, started_at, completed_at)
- `api_keys` (id, provider, encrypted_key, created_at) — AES-256-GCM
- `model_fallbacks` (id, agent_id FK, chain text[], created_at)
- `orchestrator_routes` (id, from_workspace FK, to_workspace FK, rule, priority, created_at)

**New tables for stolen features:**
- `checkpoints` (id, entity_type, entity_id, step_index, state JSONB, metadata JSONB, created_at) — Feature #1
- `traces` (trace_id, parent_span_id, span_id, operation, service, agent_id, ticket_id, duration_ms, status, attributes JSONB, created_at) — Feature #2
- `guardrail_logs` (id, layer enum[input/tool/output], agent_id, ticket_id, rule_name, passed, violation_detail, created_at) — Feature #3
- `eval_datasets` (id, name, description, created_at) — Feature #5
- `eval_cases` (id, dataset_id FK, input JSONB, expected_output JSONB, trace_id FK, created_at) — Feature #5
- `eval_runs` (id, dataset_id FK, version, scores JSONB, created_at) — Feature #5
- `agent_cards` (agent_id PK/FK, capabilities JSONB, auth_requirements JSONB, endpoint, updated_at) — Feature #7
- `playbooks` (id, name, description, steps JSONB, created_at_by, version, created_at) — Feature #8
- `gateway_metrics` (id, provider, model, agent_id FK, ticket_id FK, tokens_in, tokens_out, latency_ms, cost_usd, cached, error, created_at) — Feature #9
- `skills_marketplace` (id, name, source_url, version, installed, config JSONB, created_at) — Feature #15

**Indexes:**
- `tickets(status)`, `tickets(workspace_id, status)`, `tickets(assigned_agent_id)`, `tickets(project_id)`
- `episodes(event_type, created_at)`, `memories(key)`, `memories(tier)`
- `agent_messages(to_agent_id, read)`, `approval_gates(status)`
- `receipts(agent_id, created_at)`, `checkpoints(entity_type, entity_id, step_index)`
- `traces(trace_id)`, `traces(agent_id, created_at)`, `traces(ticket_id)`
- `gateway_metrics(provider, created_at)`, `gateway_metrics(agent_id, created_at)`
- GIN indexes on all JSONB columns
- HNSW index on `memory_vectors.embedding`

### 0C: Seed Migration Script
- Read all 25 JSON files from `runtime/state/`
- Transform and insert into Postgres tables
- Validate row counts match source
- Run as `pnpm db:seed`

### 0D: tRPC Setup
- `src/server/trpc.ts` — init, context (db + session), middleware (auth, timing, guardrails)
- `src/server/routers/_app.ts` — merge all routers
- 17 routers matching the schema groups above
- Zod input/output validation on every procedure

### 0E: OpenClaw Adapter Layer
- `src/server/adapters/openclaw/client.ts` — WebSocket connection to `ws://127.0.0.1:18789`
- `src/server/adapters/openclaw/providers.ts` — `chat()`, `embed()`, `complete()` that route through OpenClaw's 20+ LLM providers
- `src/server/adapters/openclaw/channels.ts` — receive inbound messages from OpenClaw channels, create tickets/chat messages
- `src/server/adapters/openclaw/skills.ts` — `invoke(skillName, params)` that calls OpenClaw skills
- `src/server/adapters/openclaw/memory.ts` — bidirectional sync between pgvector and OpenClaw's sqlite-vec
- `src/server/adapters/openclaw/mcp.ts` — proxy MCP tool calls through OpenClaw's MCP client
- `src/server/adapters/openclaw/health.ts` — monitor daemon health, reconnect on failure
- Health check: ping every 10s, reconnect with exponential backoff

---

## Phase 1 — Feature #9: AI Gateway with Circuit Breaking (Week 2-3)

**Why first**: Every other feature depends on reliable LLM calls. The gateway is the foundation.

### Architecture
```
Task Runner / Chat / Any LLM consumer
        │
        ▼
┌─────────────────────────┐
│     AI Gateway Layer     │
│  src/server/services/    │
│    gateway/              │
│    ├── router.ts         │  Route to best provider
│    ├── circuit-breaker.ts│  Track health, break on failure
│    ├── cache.ts          │  Semantic cache (pgvector similarity)
│    ├── cost-tracker.ts   │  Per-agent/workspace/project costs
│    ├── rate-limiter.ts   │  Per-agent token budgets
│    └── key-vault.ts      │  Encrypted key rotation
└────────────┬────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
 OpenClaw  Direct   Direct
 Adapter   Ollama   Cloud SDK
(20+ providers) (local) (fallback)
```

### Implementation
- `src/server/services/gateway/router.ts`:
  - Accept: `{ model, messages, agent_id, ticket_id, stream? }`
  - Resolve provider from model name (e.g., `claude-sonnet-4-6` → Anthropic, `gpt-4o` → OpenAI, `qwen3:8b` → Ollama)
  - Check circuit breaker state for resolved provider
  - If open: try next in fallback chain
  - Route through OpenClaw adapter (primary) or direct SDK (fallback)
  - Record metrics to `gateway_metrics` table
  - Return streaming response

- `src/server/services/gateway/circuit-breaker.ts`:
  - Per-provider state machine: CLOSED → OPEN → HALF_OPEN
  - Track: error count, last error time, consecutive successes
  - OPEN after 5 failures in 60s window
  - HALF_OPEN after 30s cooldown (let 1 request through to test)
  - CLOSED after 3 consecutive successes in HALF_OPEN

- `src/server/services/gateway/cache.ts`:
  - Semantic cache using pgvector: embed the prompt, search for similar cached prompts (cosine > 0.95)
  - Cache hit: return cached response (no LLM call, zero cost)
  - Cache miss: call LLM, store response + embedding
  - TTL: 24 hours default, configurable per agent
  - Skip cache for: streaming responses, tool-use prompts, system prompts that change

- `src/server/services/gateway/cost-tracker.ts`:
  - Calculate cost from token counts + provider pricing table
  - Aggregate by: agent, workspace, project, time period
  - Budget enforcement: soft limit (warn) + hard limit (block)
  - Dashboard widget: cost per day/week/month, top consumers, cost trend

- `src/server/services/gateway/rate-limiter.ts`:
  - Token bucket per agent: configurable tokens/minute
  - Workspace-level aggregate limits
  - Queue overflow: return 429 with retry-after
  - Priority lanes: approval-gated tickets get higher priority

- `src/server/services/gateway/key-vault.ts`:
  - AES-256-GCM encryption at rest in `api_keys` table
  - Key rotation: generate new encrypted key, swap atomically
  - Audit log: who accessed which key, when

---

## Phase 2 — Feature #2: OpenTelemetry Tracing (Week 3-4)

**Why second**: Observability for everything that follows.

### Architecture
```
Any service (app, worker, gateway)
        │
        ▼
┌─────────────────────────┐
│   OTel SDK (Node.js)     │
│   Auto-instrumentation   │
│   + Custom spans          │
└────────────┬────────────┘
             │ OTLP/gRPC
             ▼
┌─────────────────────────┐
│   OTLP Collector         │
│   (Docker sidecar)       │
└────┬──────────┬─────────┘
     │          │
     ▼          ▼
  Postgres    Jaeger/Grafana
  (traces     (visualization)
   table)
```

### Implementation
- Install: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-grpc`
- `src/server/telemetry/init.ts`:
  - Initialize OTel SDK at app startup
  - Auto-instrument: HTTP, pg (database), fetch
  - Custom resource attributes: `service.name`, `service.version`, `deployment.environment`

- Custom span instrumentation for:
  - **LLM calls**: `llm.chat` span with attributes: model, provider, tokens_in, tokens_out, latency_ms, cost_usd, cache_hit
  - **Tool invocations**: `tool.invoke` span with: tool_name, agent_id, input_size, output_size, success
  - **Agent handoffs**: `agent.handoff` span with: from_agent, to_agent, handoff_type (yield/send/dag)
  - **Approval gates**: `approval.gate` span with: action, risk, decision, wait_time_ms
  - **DAG step transitions**: `dag.step` span with: dag_id, step_index, node_type, agent_id
  - **Ticket lifecycle**: `ticket.lifecycle` span with: ticket_id, from_status, to_status
  - **Guardrail checks**: `guardrail.check` span with: layer, rule, passed, violation

- `src/server/telemetry/dual-writer.ts`:
  - Write spans to both OTLP collector AND `traces` Postgres table
  - Postgres for in-app querying (trace waterfall in Ops Center)
  - OTLP for external tools (Jaeger, Grafana, Datadog)

- **Ops Center — Trace Waterfall View**:
  - `src/app/(ops)/traces/page.tsx`
  - Search by: ticket_id, agent_id, trace_id, time range, error only
  - Waterfall visualization: nested spans with timing bars (like Chrome DevTools)
  - Click any span: see attributes, linked ticket, linked agent
  - Cost column: sum of all LLM spans in trace
  - Error highlighting: red spans for failures

- **Docker**: Add Jaeger all-in-one container to docker-compose for dev visualization

---

## Phase 3 — Feature #3: Three-Layer Guardrails (Week 4-5)

### Architecture
```
Input                    LLM Call                  Output
  │                        │                        │
  ▼                        ▼                        ▼
┌──────────┐         ┌──────────┐            ┌──────────┐
│  INPUT    │         │  TOOL    │            │  OUTPUT  │
│ GUARDRAIL │         │ GUARDRAIL│            │ GUARDRAIL│
│           │         │          │            │          │
│ • Length  │         │ • Scope  │            │ • Schema │
│ • Inject  │         │ • Auth   │            │ • Toxic  │
│ • Policy  │         │ • Budget │            │ • Halluc │
│ • Schema  │         │ • Safety │            │ • Policy │
└──────────┘         └──────────┘            └──────────┘
     │                    │                       │
     └────────────────────┼───────────────────────┘
                          ▼
                   guardrail_logs table
                   OTel span attributes
```

### Implementation
- `src/server/services/guardrails/engine.ts`:
  - `GuardrailEngine` class with `.runInput()`, `.runTool()`, `.runOutput()`
  - Each returns: `{ passed: boolean, violations: Violation[], modified_content?: string }`
  - **Parallel mode** (default): guardrail runs concurrently with LLM — if guardrail fails, cancel LLM call
  - **Blocking mode** (for high-risk): guardrail must pass before LLM starts

- `src/server/services/guardrails/rules/`:
  - `input-length.ts` — reject prompts > 100K tokens (configurable)
  - `input-injection.ts` — regex + heuristic prompt injection detection (Meta's patterns)
  - `input-policy.ts` — workspace-specific content policies from `cognition_state.policies`
  - `input-schema.ts` — Zod validation of structured inputs (slash commands, DAG parameters)
  - `tool-scope.ts` — agent can only call tools in its `skills` array
  - `tool-auth.ts` — verify agent has permission for the tool action (RBAC check)
  - `tool-budget.ts` — check token budget before LLM-consuming tools (sessions_yield)
  - `tool-safety.ts` — block dangerous tool combinations (e.g., file:write + exec in same turn)
  - `output-schema.ts` — validate LLM output matches expected format (Zod)
  - `output-toxicity.ts` — lightweight toxicity classifier
  - `output-hallucination.ts` — fact-check against ticket context + memory (replaces anti-hallucination-types.js)
  - `output-policy.ts` — workspace-specific output policies

- tRPC middleware: `src/server/middleware/guardrails.ts`
  - Wraps all LLM-calling procedures
  - Runs input guardrails before, output guardrails after
  - Logs all results to `guardrail_logs` table + OTel spans

- Tool-level guardrails: integrated into worker task executor
  - Before every `sessions_yield` / `sessions_send` / browser action: run tool guardrails
  - On violation: log, emit OTel span, return error to agent (don't silently swallow)

---

## Phase 4 — Feature #10: Tiered Memory Architecture (Week 5-6)

### Architecture
```
Agent System Prompt
  │
  ├── [ALWAYS] Core Memory (small, curated, per-agent)
  │     Identity, goals, active project, key constraints
  │
  ├── [ON DEMAND] Recall Store (searchable via pgvector)
  │     Recent conversations, ticket comments, episode history
  │
  └── [DEEP RETRIEVAL] Archival Store (pgvector + BM25)
        Lessons, golden rules, past syntheses, domain knowledge
```

### Implementation
- `memories` table gets `tier` enum column: `core`, `recall`, `archival`

- `src/server/services/memory/core-memory.ts`:
  - Per-agent core memory: max 2000 tokens
  - Always injected into system prompt
  - Contains: agent identity (from soul.md), current workspace goal, active project brief, pinned constraints
  - CRUD: agents can update their own core memory via `memory_write(key, value, 'core')` tool
  - Admin can pin/unpin core memories

- `src/server/services/memory/recall-store.ts`:
  - Recent N conversations (configurable, default 50 messages)
  - Recent ticket comments for assigned tickets
  - Recent episodes (status changes, approvals, anomalies)
  - Retrieved via: pgvector similarity search on query embedding
  - Temporal decay: `score = similarity * (1 / (1 + days_old * 0.1))`
  - Auto-compaction: summarize old recall entries into archival

- `src/server/services/memory/archival-store.ts`:
  - Lessons, golden rules, past project syntheses
  - Cognitive candidates that were promoted
  - Domain knowledge (from workspace-specific knowledge bases)
  - Retrieved via: hybrid search (pgvector cosine + Postgres `tsvector` BM25)
  - MMR (Maximal Marginal Relevance): diversify results, avoid returning 5 similar memories

- `src/server/services/memory/self-manager.ts`:
  - LLM tools exposed to agents:
    - `memory_read(query, tier?)` — search across tiers with tier priority: core > recall > archival
    - `memory_write(key, value, tier)` — store new memory (core requires admin approval if > 500 tokens)
    - `memory_promote(memory_id, from_tier, to_tier)` — promote recall → core (requires approval)
    - `memory_forget(memory_id)` — mark as archived (soft delete)
  - Auto-compaction cron: weekly, summarize old recall into archival, prune duplicates

- OpenClaw bridge (`src/server/adapters/openclaw/memory.ts`):
  - On write to pgvector: also index in OpenClaw's sqlite-vec (fire-and-forget)
  - On OpenClaw memory event: sync to pgvector if not already present
  - Conflict resolution: Postgres is source of truth, OpenClaw is read replica

---

## Phase 5 — Feature #1: Checkpointing + Time Travel (Week 6-7)

### Implementation
- `src/server/services/checkpointing/checkpoint-manager.ts`:
  - Auto-checkpoint on: ticket status change, LLM call completion, tool invocation, approval decision, DAG step transition
  - Checkpoint data: `{ entity_type, entity_id, step_index, state: <full entity snapshot as JSONB>, metadata: { trigger, agent_id, trace_id } }`
  - Configurable granularity per workspace: `all` (every step), `milestones` (status changes only), `none`
  - Retention: 30 days default, configurable. Cron job prunes old checkpoints.

- `src/server/services/checkpointing/time-travel.ts`:
  - `getCheckpoints(entityType, entityId)` — list all checkpoints for an entity
  - `getCheckpoint(checkpointId)` — get full state snapshot
  - `diffCheckpoints(checkpointA, checkpointB)` — JSONB diff (added/removed/changed fields)
  - `replayFrom(checkpointId, params?)` — restore entity to checkpoint state, optionally re-execute with modified params
  - Replay creates a NEW execution branch (never overwrites history)

- **UI — Checkpoint Timeline**:
  - `src/components/ops/checkpoint-timeline.tsx`
  - Horizontal scrollable timeline with dots for each checkpoint
  - Dot color by type: green (status change), blue (LLM call), orange (tool), red (error)
  - Hover: show checkpoint summary
  - Click: show full state diff from previous checkpoint
  - "Replay from here" button: opens modal with parameter editor

- Integration with receipts:
  - Every receipt action auto-creates a checkpoint
  - Rollback engine uses checkpoints instead of manual `preState` — more reliable

---

## Phase 6 — Feature #4: Tiered Agent Modes (Week 7-8)

### Implementation
- Add `execution_mode` to tickets: `quick`, `autonomous`, `deep_work`

- `src/server/services/task-runner/mode-router.ts`:
  - **Quick mode** (< 60s):
    - Single LLM call, no tools, no receipt, no approval gate, no checkpoint
    - Used for: chat responses, simple lookups, status queries
    - Auto-detect: ticket.complexity == 'easy' AND no tools required
  - **Autonomous mode** (current default):
    - Full pipeline: lease → guardrails → LLM with tools → receipt → checkpoint
    - Used for: standard tickets, agent tasks, cron jobs
    - Auto-detect: ticket.complexity in ['medium', 'hard'] OR tools required
  - **Deep Work mode** (minutes to hours):
    - Phase 1: Agent generates a plan (list of steps with estimates)
    - Phase 2: User reviews and approves plan (or modifies)
    - Phase 3: Autonomous execution of approved plan with periodic check-ins
    - Check-in interval: every 5 steps or 5 minutes, whichever comes first
    - Used for: projects, multi-workspace orchestration, complex refactors
    - Auto-detect: ticket.complexity == 'critical' OR project-level ticket

- **UI — Mode Selector**:
  - When creating a ticket: auto-suggest mode based on complexity, allow override
  - In chat: `/quick`, `/auto`, `/deep` slash commands to set mode
  - Visual indicator: lightning bolt (quick), gear (auto), brain (deep work) icons

- **Deep Work Planning Phase**:
  - `src/components/tickets/plan-editor.tsx`
  - Agent proposes plan as editable step list
  - User can: reorder, remove, add, modify steps
  - "Approve & Execute" button starts autonomous execution of the approved plan
  - Plan stored in `ticket.metadata.plan` JSONB

---

## Phase 7 — Feature #5: Production-to-Eval Pipeline (Week 8-9)

### Implementation
- `src/server/services/evals/dataset-builder.ts`:
  - "Save as eval case" button on any trace in Ops Center
  - Auto-extract: input (prompt + context), expected output (actual response), trace_id
  - Group into named datasets (e.g., "ticket-execution", "chat-quality", "tool-use")
  - Auto-generate datasets from: failed tickets (negative examples), high-rated completions (positive examples)

- `src/server/services/evals/runner.ts`:
  - Replay eval cases through current agent version
  - Compare output against expected: exact match, semantic similarity, LLM-as-judge
  - Scoring dimensions:
    - `task_completion` — did the agent achieve the goal?
    - `factuality` — are claims supported by context?
    - `tool_use_accuracy` — did the agent call the right tools with right params?
    - `safety` — did guardrails pass?
    - `cost_efficiency` — tokens used vs. baseline
  - Store results in `eval_runs` table

- `src/server/services/evals/drift-detector.ts`:
  - Run eval suite on schedule (daily cron via pg-boss)
  - Compare scores across time: alert on > 5% regression
  - Alert channels: Ops Center notification, Telegram/Slack via OpenClaw channels

- **CI/CD integration**:
  - `scripts/run-evals.ts` — CLI that runs eval suite, exits non-zero on regression
  - GitHub Actions workflow: run on PRs that touch `src/server/services/` or `apps/worker/`

- **UI — Eval Dashboard**:
  - `src/app/(ops)/evals/page.tsx`
  - Dataset list with case counts
  - Run history with score trends (Recharts line chart)
  - Drill into failed cases: side-by-side expected vs. actual
  - "Create eval from trace" button in trace waterfall view

---

## Phase 8 — Feature #6: Deterministic Flows + Autonomous Crews (Week 9-10)

### Implementation
- Separate the task runner into two subsystems:

- `src/server/services/flows/flow-engine.ts`:
  - **Deterministic orchestration**: define execution order, routing, conditions, loops
  - TypeScript builder pattern:
    ```
    flow('project-execution')
      .start(receiveProjectBrief)
      .then(routeToWorkspaces)    // deterministic routing
      .parallel(executeInDivisions) // fan-out
      .join(synthesizeResults)      // fan-in
      .conditional(qualityCheck, { pass: deliver, fail: revise })
      .end()
    ```
  - Flows are checkpointed at every step
  - Flows never call LLMs directly — they delegate to Crews

- `src/server/services/crews/crew-engine.ts`:
  - **Autonomous reasoning**: agents with roles, goals, backstories
  - Auto-generated delegation tools for agents with `allow_delegation: true`:
    - `delegate_work(to_agent, task_description)` — async delegation
    - `ask_question(to_agent, question)` — sync Q&A (wraps sessions_yield)
  - Crew execution: ReAct loop with tool use, memory access, guardrails
  - Crews run inside Flow nodes — the Flow controls WHEN a Crew runs, the Crew controls HOW it reasons

- **RecallFlow for memory**:
  - `src/server/services/memory/recall-flow.ts`
  - Parallel search across all three memory tiers
  - Confidence-based routing: if core memory answers (confidence > 0.9), skip recall/archival
  - Merge + deduplicate results
  - Inject top-k into agent context

- Migration: current `sessions_dag_run` becomes a Flow. Current `sessions_yield` becomes a Crew delegation pattern.

---

## Phase 9 — Feature #7: A2A Protocol (Week 10-11)

### Implementation
- `src/server/services/a2a/agent-card.ts`:
  - Generate `/.well-known/agent.json` for each agent:
    ```json
    {
      "name": "eng-frontend",
      "description": "Frontend engineering specialist",
      "endpoint": "https://solarc.example.com/api/a2a/eng-frontend",
      "skills": ["react", "typescript", "css", "testing"],
      "auth": { "type": "bearer", "token_url": "/api/auth/token" }
    }
    ```
  - Auto-generate from `agents` table + `skills` column

- `src/app/api/a2a/[agentId]/route.ts`:
  - HTTP + SSE endpoint implementing A2A protocol
  - Accept: `{ task, context, callback_url? }`
  - Create internal ticket assigned to agent
  - Stream progress via SSE
  - Return: `{ status, result, artifacts }`
  - Long-running task support: poll or push via callback_url

- `src/server/services/a2a/client.ts`:
  - Discover external agents via `/.well-known/agent.json`
  - Invoke external agents as tools available to your agents
  - `external_agent(agent_url, task)` tool in crew engine

- `src/server/services/a2a/registry.ts`:
  - Store discovered external agents in `agent_cards` table
  - Periodic health check on registered external agents
  - UI: list of known external agents with status

---

## Phase 10 — Feature #8: Teach & Repeat (Week 11-12)

### Implementation
- `src/server/services/playbooks/recorder.ts`:
  - Record user actions in dashboard as structured events:
    - Click targets (component, action, parameters)
    - Decision points (which option chosen, why)
    - Data transformations (input → output)
  - Package as a `Playbook`: ordered list of steps with parameters and conditions
  - Store in `playbooks` table as JSONB steps

- `src/server/services/playbooks/distiller.ts`:
  - LLM analyzes recorded trace → extracts reusable pattern
  - Parameterizes: replace specific values with variables
  - Generates: description, trigger conditions, expected outcomes
  - Outputs: SKILL.md-format playbook

- `src/server/services/playbooks/executor.ts`:
  - Replay playbook on new inputs
  - For each step: resolve parameters, execute action, verify outcome
  - On deviation: pause and ask user (HITL) or retry with LLM adaptation
  - A/B testing: run original vs. modified playbook, compare outcomes

- **UI — Playbook Manager**:
  - `src/app/(dashboard)/playbooks/page.tsx`
  - List of saved playbooks with: name, trigger, success rate, last run
  - "Record" button: starts recording mode (orange border on dashboard)
  - "Stop" button: ends recording, shows distilled playbook for review
  - "Run" button: execute playbook with parameter form
  - Version history with diff view

---

## Phase 11 — Feature #11: Bidirectional MCP (Week 12-13)

### Implementation
- `src/server/services/mcp/server.ts`:
  - Expose your agents and workflows as MCP tools
  - Each agent becomes a callable tool: `solarc_agent_{agentId}(task, context)`
  - Each flow becomes a callable tool: `solarc_flow_{flowName}(params)`
  - JSON-RPC 2.0 over stdio or HTTP+SSE

- `src/server/services/mcp/registry.ts`:
  - Register available MCP tools (from OpenClaw + your agents + external)
  - Tool discovery: scan OpenClaw skills, external MCP servers
  - Expose consolidated tool list to all agents

- External consumption:
  - Claude Desktop, Cursor, other MCP clients can invoke your agents
  - Your platform becomes a tool provider, not just consumer

---

## Phase 12 — Feature #12: Live Agent Viewport (Week 13-14)

### Implementation
- `src/components/agents/live-viewport.tsx`:
  - Embedded iframe showing agent's active browser session (from Playwright)
  - Narration sidebar: real-time log of agent actions with timestamps
  - Screenshot stream: capture every 2s during browser automation, display as live feed
  - Controls: pause, resume, take over (human takes control of browser session)

- `src/server/services/browser-agent/stream.ts`:
  - Extend OpenClaw's Playwright integration
  - Emit SSE events: `screenshot`, `action`, `navigation`, `error`
  - Store screenshots in S3/local disk with 24h retention

- **Ops Center integration**:
  - Active browser sessions panel showing all running viewports
  - Click to expand any session to full-screen viewport

---

## Phase 13 — Feature #13: Multiplayer Presence (Week 14)

### Implementation
- `src/server/services/presence/manager.ts`:
  - Track: which users are online, which tab they're viewing, cursor position
  - Track: which agents are executing, which ticket, which workspace
  - Broadcast via SSE to all connected clients
  - Heartbeat: every 5s from client, 10s timeout for disconnect

- `src/components/layout/presence-avatars.tsx`:
  - Top-right corner: row of avatar circles for connected users + active agents
  - Hover: show name, current location (tab/ticket/workspace)
  - Agent avatars pulse when executing

- `src/components/layout/live-cursors.tsx`:
  - Show other users' cursor positions on shared views (projects, tickets, ops)
  - Agents show as moving highlights on tickets they're working on

---

## Phase 14 — Feature #14: Adaptive Dashboard Layout (Week 15)

### Implementation
- `src/server/services/adaptive/layout-engine.ts`:
  - Track user behavior: which panels opened, time spent, interaction frequency
  - Role-based defaults: admin sees security + approvals first, operator sees health + DLQ first
  - Time-of-day adaptation: morning = standup summary, working hours = ticket board, evening = metrics
  - Store preferences in user profile + learned weights

- `src/components/dashboard/adaptive-grid.tsx`:
  - Panels ranked by relevance score (behavior + role + time + context)
  - Top 4 panels always visible, rest collapsed
  - "Pin" button to override adaptive ranking
  - "Reset layout" to clear learned preferences

---

## Phase 15 — Feature #15: Skill Marketplace (Week 15-16)

### Implementation
- `src/server/services/skills/marketplace.ts`:
  - Fetch available skills from: OpenClaw's 67 built-in, SkillsMP API, custom skill repos
  - Display: name, description, author, install count, rating
  - Install: download SKILL.md + handler, register in `skills_marketplace` table
  - Configure: per-agent skill assignment via UI

- `src/server/services/skills/installer.ts`:
  - Validate SKILL.md format
  - Sandbox execution: skills run in isolated context (no direct DB access)
  - Permission system: skills request capabilities (file:read, network:fetch, etc.), user approves

- **UI — Skill Store**:
  - `src/app/(dashboard)/skills/page.tsx`
  - Browse with categories: productivity, coding, media, data, integrations
  - Search by name/keyword
  - One-click install with permission review
  - Installed skills management: enable/disable per agent, view usage stats

---

## Phase 16 — Feature #16: Visual QA Recording Playback (Week 16)

### Implementation
- `src/server/services/visual-qa/recorder.ts`:
  - During browser automation: record screenshot stream as video (ffmpeg)
  - Annotate with: action labels, pass/fail markers, timestamps
  - Store recording in S3/local with 7-day retention

- `src/server/services/visual-qa/reviewer.ts`:
  - LLM reviews recording: compare expected vs. actual UI state
  - Generate: pass/fail verdict, failure screenshots, suggested fixes
  - Link to ticket proof record

- **UI — QA Playback**:
  - `src/components/ops/qa-player.tsx`
  - Video player with timeline scrubber
  - Action annotations as markers on timeline
  - Side panel: pass/fail results, failure details
  - "Approve" / "Reject" buttons for human review

---

## Phase 17 — Brain SDK + App Factory (Week 16-18)

### 17A: Brain SDK (`packages/brain-sdk/`)
- Auto-generate TypeScript client from tRPC router types
- Publish as `@solarc/brain-sdk` to private npm registry (or local package)
- API surface:
  ```typescript
  import { createBrainClient } from '@solarc/brain-sdk'

  const brain = createBrainClient({
    apiKey: process.env.BRAIN_API_KEY,
    endpoint: 'https://brain.solarc.local',
    engines: ['llm', 'memory', 'eval', 'guardrails', 'a2a', 'healing']
  })

  // LLM Engine
  const stream = await brain.llm.chat({ model: 'claude-sonnet-4-6', messages: [...] })
  const embedding = await brain.llm.embed({ text: 'hotel guest preferences' })

  // Memory Engine
  await brain.memory.store({ key: 'guest-prefs', content: '...', tier: 'archival' })
  const results = await brain.memory.search({ query: 'VIP guest preferences', limit: 5 })

  // Orchestration Engine
  const ticket = await brain.orch.createTicket({ title: 'Analyze F&B costs', agent: 'cfo-agent', mode: 'deep_work' })

  // A2A Engine
  const agents = await brain.a2a.discover({ capability: 'financial-analysis' })
  const result = await brain.a2a.delegate({ agent_id: 'cfo-oracle', task: 'Q1 revenue forecast' })

  // Healing Engine (auto-starts on connect)
  brain.healing.onIncident((incident) => { console.log('Brain detected:', incident) })
  ```
- Features:
  - Full TypeScript types (inferred from engine contracts)
  - Streaming support (AsyncIterator for LLM responses)
  - Auto-retry with exponential backoff
  - WebSocket connection for real-time events (healing alerts, agent messages)
  - Offline queue: buffer requests when Brain is unreachable, replay on reconnect
  - Lightweight: < 50KB minified, zero server-side dependencies

### 17B: Mini Brain Factory (`engines/mini-brain-factory/`)

**Mini Brain templates** (stored in `templates/mini-brains/`):

| Template | Domain | Domain Engines | Domain Agents | Domain DB Tables |
|----------|--------|---------------|---------------|-----------------|
| `astrology` | Astrology | Swiss Ephemeris, Chart Calculator, Transit Engine | Master Astrologer, Transit Tracker, Sports Analyst, Business Advisor | clients, natal_charts, readings, transit_alerts, sports_teams |
| `hospitality` | Hotels | PMS Integration, Revenue Mgmt, Guest Profile | CEO, COO, CFO, GM, F&B Director, HR, Sales | reservations, guests, rooms, revenue_data, staff, f&b_inventory |
| `healthcare` | Medical | HIPAA Checker, Clinical Protocol, Patient Profile | Compliance Analyst, Medical IP Counsel, Clinical Reviewer | patients, protocols, compliance_logs, clinical_trials |
| `legal` | Law | Case Law Search, Contract Parser, Compliance Check | Chief Legal Officer, IP Counsel, Paralegal, Compliance Auditor | cases, contracts, regulations, filings, ip_portfolio |
| `marketing` | Campaigns | Campaign Engine, Analytics, A/B Tester | Campaign Orchestrator, Analytics Analyst, Content Creator | campaigns, audiences, experiments, creatives, metrics |
| `soc-ops` | Security | Threat Intel, SIEM Connector, Incident Response | SOC Analyst, Incident Responder, Threat Hunter | incidents, alerts, indicators, playbooks, forensics |

**`factory.createMiniBrain()` flow:**
1. Clone Mini Brain template to target directory
2. Set up domain Postgres database (separate from Brain's DB)
3. Run domain Drizzle migrations
4. Download domain data (e.g., Swiss Ephemeris data files)
5. Create domain agents in Brain's `agents` table (linked to Mini Brain entity)
6. Register in `brain_entities` table (tier: mini_brain, parent: Brain)
7. Wire Brain SDK connection (API key, endpoint)
8. Assign Brain healer agent to monitor
9. Start Mini Brain service
10. Return: Mini Brain URL + API key + dashboard URL

**`factory.createDevelopment()` flow:**
1. Clone Development template from Mini Brain's template library
2. Pre-wire `@solarc/mini-brain-sdk` with Mini Brain endpoint
3. Provision user-facing tables (accounts, preferences, etc.)
4. Register in `brain_entities` table (tier: development, parent: Mini Brain)
5. Assign Mini Brain agents for domain support
6. Return: App URL + API key

**Development templates per Mini Brain:**

| Mini Brain | Development Templates |
|-----------|----------------------|
| Astrology | `sports-astrology`, `personal-astrology`, `business-astrology`, `mundane-astrology` |
| Hospitality | `luxury-hotel`, `boutique-resort`, `business-hotel`, `chain-operations` |
| Healthcare | `clinic-management`, `clinical-trials`, `telemedicine`, `pharmacy` |
| Legal | `ip-portfolio`, `contract-review`, `compliance-audit`, `litigation-support` |
| Marketing | `social-media`, `email-campaigns`, `influencer-management`, `analytics-dashboard` |
| SOC-Ops | `threat-monitoring`, `incident-management`, `vulnerability-scanning`, `compliance-reporting` |

### 17C: Engine Registry (`src/server/services/engine-registry/`)
- Central registry of all engines with:
  - Health status per engine
  - Connected apps per engine
  - Usage metrics per engine per app
  - Rate limits per app per engine
- Dashboard view: `src/app/(ops)/engines/page.tsx`
  - Engine cards with status, connected app count, request rate
  - Per-app usage breakdown
  - Rate limit configuration

### 17D: App Dashboard in Brain
- `src/app/(dashboard)/apps/page.tsx` — list all connected child apps
- `src/app/(dashboard)/apps/[appId]/page.tsx` — single app view:
  - Health score (from healing engine)
  - Connected engines + usage
  - Active agents working on this app
  - Recent incidents + resolutions
  - LLM cost for this app
  - Memory entries scoped to this app

---

## Phase 18 — UI Shell + All Views (Parallel with Phases 1-17)

This runs in parallel throughout all phases:

### Week 2-3: App Shell
- Root layout: sidebar (260px) + topbar (64px) + main content
- Sidebar: navigation matching current 24 tabs, spotlight search (Cmd+K)
- Topbar: breadcrumb, health badge (computed from traces + gateway metrics)
- Dark theme: port CSS variables (neon-blue, neon-purple, neon-green, etc.) to Tailwind config
- shadcn/ui: install Button, Card, Badge, Dialog, Table, Tabs, Command, Sheet, Tooltip

### Week 4-5: Core Views
- Home dashboard: stat cards, sparklines, progress rings (Recharts)
- Workspaces grid: workspace cards with agent counts, health indicators
- Agents list: status badges, model assignment, skill tags
- Tickets: kanban board (shadcn drag-and-drop) or table view toggle

### Week 6-8: Chat + Canvas
- Chat: agent sidebar, streaming messages, slash commands, file upload
- Canvas: sandboxed iframe with history navigation, inspector toggle
- Voice panel: PTT + continuous + TTS (Web Speech API)

### Week 9-12: Ops + Advanced
- Ops overview: health score, alerts, active agents
- DLQ panel, approval queue, receipt table, cron job center
- Trace waterfall, eval dashboard, checkpoint timeline
- Project Mission Control: SVG node graph, division swim lanes
- Debate: proof tree SVG, blind spot oracle, treaty panel
- Graph: Cytoscape topology (dynamic import), Flowgram DAG builder (dynamic import)

### Week 13-16: Polish
- Settings: API keys (encrypted), channels, permissions, model registry
- Integrations: webhook manager, channel status
- Adaptive layout, multiplayer presence, live viewport
- Skill marketplace, playbook manager, QA playback

---

## Verification Plan

### Per-Feature Verification
| Feature | Test |
|---------|------|
| AI Gateway | Send 100 concurrent LLM calls, kill one provider mid-stream, verify failover + cost tracking |
| OTel Tracing | Execute a multi-agent DAG, verify complete trace waterfall in Jaeger + Postgres |
| Guardrails | Send prompt injection, verify input guardrail catches it; send hallucinated output, verify output guardrail catches it |
| Tiered Memory | Write to core, recall, archival; search with query that should hit each tier; verify temporal decay |
| Checkpointing | Execute 10-step ticket, rollback to step 5, verify state matches checkpoint |
| Tiered Modes | Create quick/auto/deep tickets, verify each uses correct pipeline (no tools in quick, planning phase in deep) |
| Eval Pipeline | Save a trace as eval case, modify agent, re-run eval, verify score comparison |
| Flows + Crews | Define a 3-step flow with parallel crews, verify deterministic ordering + autonomous crew reasoning |
| A2A Protocol | Register external agent, invoke from your agent, verify task completion via HTTP |
| Teach & Repeat | Record a 5-step workflow, replay on new input, verify 4/5 steps succeed |
| Bidirectional MCP | Call your agent from Claude Desktop via MCP, verify response |
| Live Viewport | Start browser automation, verify screenshot stream + narration in UI |
| Multiplayer | Open dashboard in 2 browsers, verify presence avatars + cursor positions |
| Adaptive Layout | Use dashboard for 1 hour, verify panel ranking changes based on behavior |
| Skill Marketplace | Install a skill from OpenClaw, assign to agent, invoke via chat |
| Visual QA | Run browser test, verify recording plays back with annotations |

### Integration Tests (Vitest)
- Database: test all Drizzle queries against a test Postgres instance
- tRPC: test all routers with mock context
- Gateway: test circuit breaker state machine transitions
- Guardrails: test all rules with positive and negative cases
- Memory: test tiered search with known embeddings

### E2E Tests (Playwright)
- Login → create ticket → verify execution → check ops center
- Chat with agent → verify streaming → check receipt
- Create project → verify multi-workspace orchestration → check synthesis
- Approval flow: create high-risk ticket → verify gate appears → approve → verify execution

### Load Testing
- 50 concurrent tickets with different modes
- 10 simultaneous chat streams
- Gateway under 1000 req/min with 2 providers failing

---

## Timeline Summary

### Stage 1: Brain Core (Weeks 1-8)
| Week | Phase | Deliverable |
|------|-------|-------------|
| 1-2 | Phase 0 | Foundation: monorepo scaffold, Postgres schema, seed migration, tRPC, OpenClaw adapter |
| 2-3 | Phase 1 | **LLM Engine**: AI Gateway with circuit breaking, cost tracking, semantic caching |
| 3-4 | Phase 2 | **Observability**: OpenTelemetry tracing with trace waterfall UI |
| 4-5 | Phase 3 | **Guardrail Engine**: Three-layer guardrails (input/tool/output) |
| 5-6 | Phase 4 | **Memory Engine**: Tiered memory (core/recall/archival) with self-management |
| 6-7 | Phase 5 | Checkpointing + time travel with timeline UI |
| 7-8 | Phase 6 | **Orchestration Engine**: Tiered agent modes (quick/auto/deep work) |

### Stage 2: Intelligence Layer (Weeks 8-12)
| Week | Phase | Deliverable |
|------|-------|-------------|
| 8-9 | Phase 7 | **Eval Engine**: Production-to-eval pipeline with drift detection |
| 9-10 | Phase 8 | Flows + Crews separation (deterministic + autonomous) |
| 10-11 | Phase 9 | **A2A Engine**: Agent cards, cross-app delegation, capability discovery |
| 11-12 | Phase 10 | Teach & Repeat (playbook recorder/executor) |

### Stage 3: Ecosystem (Weeks 12-16)
| Week | Phase | Deliverable |
|------|-------|-------------|
| 12-13 | Phase 11 | Bidirectional MCP (expose Brain agents as MCP tools) |
| 13-14 | Phase 12 | Live agent viewport (browser session streaming) |
| 14 | Phase 13 | Multiplayer presence (avatars + cursors) |
| 15 | Phase 14 | Adaptive dashboard layout |
| 15-16 | Phase 15 | Skill marketplace with security scanning |
| 16 | Phase 16 | Visual QA recording playback |

### Stage 4: Platform Layer (Weeks 16-20)
| Week | Phase | Deliverable |
|------|-------|-------------|
| 16-17 | Phase 17A | **Brain SDK** (`@solarc/brain-sdk`): Mini Brains connect UP to Brain |
| 17-18 | Phase 17B | **Mini Brain Factory**: Templates, scaffolding, domain engine wiring |
| 17-18 | Phase 17B | **Mini Brain SDK** (`@solarc/mini-brain-sdk`): Developments connect UP to Mini Brains |
| 18-19 | Phase 17C | **Healing Engine**: Auto-monitoring cascade (Brain → Mini Brain → Development) |
| 19-20 | Phase 17D | **Engine Registry + App Dashboard**: Topology view, usage tracking, health |

### Stage 5: First Domain — Prove the Platform (Weeks 20-24)
| Week | Phase | Deliverable |
|------|-------|-------------|
| 20-21 | Phase 19A | **Hospitality Mini Brain**: Domain DB, PMS engine, Revenue engine, Guest Profile engine |
| 21-22 | Phase 19B | **MGHM Hotels Development**: Room mgmt, F&B ops, guest experience, revenue dashboard |
| 22-23 | Phase 19C | **Astrology Mini Brain**: Swiss Ephemeris engine, Chart Calculator, Transit engine |
| 23-24 | Phase 19D | **Sports Astrology Development**: Team analysis, match prediction, season forecast |
| 2-24 | Phase 18 | UI shell + all views (parallel throughout) |

**Total: 24 weeks (6 months)**

### Milestone Gates
| Gate | Week | Criteria |
|------|------|---------|
| **Brain Boots** | 2 | Postgres running, schema migrated, tRPC responds, OpenClaw daemon connected |
| **Brain Thinks** | 5 | LLM Engine routes calls, guardrails catch injections, memory stores/retrieves across tiers |
| **Brain Orchestrates** | 8 | Tickets execute end-to-end with checkpointing, traces visible in Jaeger |
| **Brain Learns** | 10 | Eval pipeline catches regressions, Flows + Crews run multi-agent projects |
| **Brain Connects** | 13 | A2A protocol works cross-app, Brain exposed as MCP server |
| **Brain Spawns** | 18 | Mini Brain Factory creates a Mini Brain, Brain SDK connects, agents monitor |
| **Mini Brain Lives** | 21 | Hospitality Mini Brain running, MGHM app connected, domain engines serving requests |
| **Platform Proven** | 24 | Two Mini Brains (Hospitality + Astrology), two Developments each, healing cascade working, cross-domain knowledge sharing active |

---

## AITMPL Integration — Component Supply Chain

AITMPL (app.aitmpl.com) is a 1,000+ component marketplace for Claude Code with 6 categories: **Agents** (600+), **Skills** (hundreds), **Commands** (159+), **Settings**, **Hooks**, and **MCPs**. MIT licensed, CLI-installable via `npx claude-code-templates@latest`. This becomes the **supply chain** for populating Brain and Mini Brains with capabilities.

### How AITMPL Maps to the Three-Tier Architecture

```
AITMPL Marketplace (1,000+ components)
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Brain Component Installer                       │
│  src/server/services/aitmpl/installer.ts         │
│                                                  │
│  • Fetches from AITMPL GitHub API                │
│  • Security scans (static + sandbox)             │
│  • Installs to correct tier:                     │
│    - Universal → Brain                           │
│    - Domain-specific → Mini Brain                │
│    - App-specific → Development                  │
│  • Version pins + hash verification              │
│  • Auto-update checker (weekly cron)             │
└─────────────────────────────────────────────────┘
```

### Component Mapping: What Goes Where

| AITMPL Category | Brain (Tier 1) | Mini Brain (Tier 2) | Development (Tier 3) |
|----------------|----------------|--------------------|--------------------|
| **Agents** | Governance, security, compliance, healing, orchestration agents | Domain specialist agents (astrologer, concierge, paralegal) | End-user facing agents (chatbot, assistant) |
| **Skills** | Universal skills: code review, testing, search, documentation | Domain skills: chart calculation, PMS ops, case law | App-specific skills: UI generation, report formatting |
| **Commands** | System commands: `/health`, `/audit`, `/deploy`, `/security-scan` | Domain commands: `/calculate-chart`, `/check-availability` | User commands: `/predict-match`, `/book-room` |
| **Hooks** | Lifecycle enforcement: pre-commit guards, guardrail triggers, receipt logging | Domain enforcement: HIPAA checks, disclaimer injection, data validation | App-level: user input sanitization, response formatting |
| **MCPs** | Infrastructure: GitHub, PostgreSQL, Docker, AWS, Sentry, Datadog | Domain services: Swiss Ephemeris API, PMS systems, legal databases | User services: Stripe, SendGrid, Twilio |
| **Settings** | Brain-wide: model defaults, timeouts, memory limits, output formats | Domain-wide: domain-specific model preferences, context windows | App-specific: UI preferences, feature flags |

### Brain Pre-Installed Components (from AITMPL + curated)

**Agents (Brain-level, always available):**

| Agent | Source | Role in Brain |
|-------|--------|--------------|
| `security-auditor` | AITMPL | Continuous security scanning of all tiers |
| `code-reviewer` | AITMPL | Reviews code changes across all connected apps |
| `test-generator` | AITMPL | Generates tests for Brain engines and Mini Brain code |
| `documentation-sync` | AITMPL | Keeps docs in sync across tiers |
| `performance-optimizer` | AITMPL | Monitors and optimizes LLM usage, caching, costs |
| `compliance-checker` | AITMPL | GDPR, SOC2, HIPAA policy enforcement |
| `incident-responder` | AITMPL | Auto-responds to health incidents across tiers |
| `deploy-manager` | AITMPL | Manages deployments and rollbacks |
| `brain-healer` | Custom | Master healer — monitors Mini Brains and escalates |
| `brain-orchestrator` | Custom | Routes work across Mini Brains and manages flows |
| `brain-governor` | Custom | Approval gates, RBAC, autonomy level enforcement |
| `brain-evaluator` | Custom | Runs eval suites, detects drift, suggests improvements |

**Skills (Brain-level):**

| Skill | Source | Purpose |
|-------|--------|---------|
| `code-review` | AITMPL/Anthropic | Multi-file code review with quality scoring |
| `test-generation` | AITMPL | Unit/integration/E2E test generation |
| `security-scan` | AITMPL | OWASP, secrets detection, dependency audit |
| `documentation` | AITMPL | Auto-generate docs from code |
| `refactoring` | AITMPL | Safe refactoring with impact analysis |
| `debugging` | AITMPL | Root cause analysis with trace inspection |
| `performance-analysis` | AITMPL | Bottleneck detection and optimization |
| `api-design` | AITMPL | OpenAPI spec generation and validation |
| `database-migration` | AITMPL | Schema migration planning and execution |
| `prompt-engineering` | AITMPL | Prompt optimization and A/B testing |
| `perplexity-search` | AITMPL/K-Dense | Web search with source citation |
| `scientific-analysis` | AITMPL/K-Dense | Data analysis and statistical methods |

**Commands (Brain-level):**

| Command | Purpose |
|---------|---------|
| `/health` | Full health check across all tiers |
| `/topology` | Show Brain → Mini Brain → Development tree |
| `/costs` | LLM cost breakdown by tier/domain/agent |
| `/audit` | Security + compliance audit |
| `/deploy` | Deploy changes to Mini Brain or Development |
| `/eval` | Run eval suite on specified scope |
| `/heal` | Trigger healing scan on target entity |
| `/spawn-mini-brain` | Create new Mini Brain from template |
| `/spawn-development` | Create new Development from Mini Brain template |
| `/connect` | Wire a new entity to its parent |
| `/guardrails` | View/edit guardrail policies |
| `/traces` | Search and view OTel traces |
| `/checkpoints` | Browse and restore checkpoints |
| `/memory` | Search across memory tiers |
| `/agents` | List and manage agents across all tiers |
| `/skills` | Browse and install skills from AITMPL |
| `/generate-tests` | AITMPL: Auto-generate tests for current code |
| `/check-security` | AITMPL: Run security scan |

**Hooks (Brain-level):**

| Hook Event | Action | Purpose |
|-----------|--------|---------|
| `PreToolUse` (on Edit/Write) | Run `guardrails.checkTool()` | Prevent unsafe file modifications |
| `PostToolUse` (on Bash) | Log to `receipt_actions` + OTel span | Audit trail for all shell commands |
| `PreToolUse` (on agent delegation) | Check RBAC + autonomy level | Governance enforcement |
| `PostToolUse` (on LLM call) | Record `gateway_metrics` | Cost tracking |
| `PostToolUse` (on any) | Auto-checkpoint if configured | Checkpointing support |
| `SessionStart` | Load core memory + active context | Memory tier initialization |
| `SessionEnd` | Compact and persist session state | Memory compaction |
| `SubagentComplete` | Evaluate output quality | Auto-eval on agent completion |

**MCPs (Brain-level):**

| MCP Server | Purpose | Pre-installed? |
|-----------|---------|---------------|
| `filesystem` | File read/write with access controls | Yes |
| `git` | Version control operations | Yes |
| `github` | Repo management, issues, PRs | Yes |
| `postgresql` | Natural language SQL queries | Yes |
| `memory` | Knowledge graph persistent memory | Yes |
| `sequential-thinking` | Structured reasoning | Yes |
| `playwright` | Browser automation | Yes |
| `duckduckgo-search` | Free web search | Yes |
| `context7` | Version-specific code docs | Yes |
| `firecrawl` | Web scraping to markdown | Yes |
| `slack` | Workspace messaging | One-click |
| `notion` | Page/database management | One-click |
| `linear` | Issue tracking | One-click |
| `sentry` | Error tracking | One-click |
| `docker` | Container management | One-click |
| `supabase` | Backend-as-a-service | One-click |
| `datadog` | Observability | One-click |
| `stripe` | Payments | One-click |
| `aws` | Cloud infrastructure | One-click |

### Mini Brain Component Kit (per domain)

When a Mini Brain is created, it gets domain-specific components ON TOP of Brain's universal components:

**Astrology Mini Brain components:**

| Type | Component | Purpose |
|------|-----------|---------|
| Agent | `master-astrologer` | Senior chart interpretation |
| Agent | `transit-tracker` | Monitors planetary movements, sends alerts |
| Agent | `sports-analyst` | Sports-specific astrological analysis |
| Agent | `business-advisor` | Business timing and partnership compatibility |
| Skill | `ephemeris-calculation` | Swiss Ephemeris chart computation |
| Skill | `chart-interpretation` | AI-powered natal/transit/synastry reading |
| Skill | `aspect-analysis` | Planetary aspect pattern recognition |
| Command | `/calculate-chart` | Compute natal chart from birth data |
| Command | `/transits` | Show current transits for a client |
| Command | `/compatibility` | Synastry analysis between two charts |
| Command | `/forecast` | Generate period forecast for a client |
| Hook | `PostToolUse` (on readings) | Auto-append disclaimer |
| Hook | `PreToolUse` (on LLM) | Inject ephemeris context into prompt |
| Guardrail | `no-medical-claims` | Block health-related predictions |
| Guardrail | `no-financial-advice` | Block specific financial recommendations |
| MCP | `swiss-ephemeris` | Custom: planetary position calculations |

**Hospitality Mini Brain components:**

| Type | Component | Purpose |
|------|-----------|---------|
| Agent | `revenue-analyst` | Revenue management and pricing optimization |
| Agent | `concierge` | Guest experience and request handling |
| Agent | `f&b-optimizer` | Food & beverage cost and menu optimization |
| Agent | `hr-coordinator` | Staff scheduling and training |
| Agent | `sales-director` | Group bookings and corporate sales |
| Agent | `gm-oracle` | General manager decision support |
| Skill | `pms-integration` | Property Management System operations |
| Skill | `revenue-forecasting` | Demand prediction and dynamic pricing |
| Skill | `guest-profiling` | Guest preference learning and personalization |
| Command | `/occupancy` | Current and forecasted occupancy |
| Command | `/revenue` | Revenue report for period |
| Command | `/guest-lookup` | Find guest profile and history |
| Command | `/rate-adjust` | Suggest rate adjustments based on demand |
| Hook | `PreToolUse` (on guest data) | PII protection enforcement |
| Hook | `PostToolUse` (on pricing) | Log rate changes for audit |
| Guardrail | `pii-protection` | Mask guest personal data in logs |
| Guardrail | `rate-bounds` | Prevent extreme pricing recommendations |
| MCP | `pms-connector` | Custom: PMS system API integration |
| MCP | `ota-connector` | Custom: OTA channel management |

### AITMPL Auto-Discovery

`src/server/services/aitmpl/discoverer.ts`:
- Weekly cron: fetch latest AITMPL catalog from GitHub API
- Diff against installed components
- Flag new/updated components relevant to each tier
- Notification: "3 new security skills available" → Brain admin dashboard
- Auto-install option for trusted publishers (Anthropic official, K-Dense verified)
- Security scan all new components before making available

### AITMPL → Brain Adaptation Layer

AITMPL components are designed for single-user Claude Code sessions. Brain needs to adapt them:

| AITMPL Pattern | Brain Adaptation |
|---------------|-----------------|
| SKILL.md in `.claude/skills/` | Stored in `skills_marketplace` DB table, injected into agent prompts dynamically |
| Agent .md in `.claude/agents/` | Registered in `agents` table with Brain orchestration metadata (workspace, trust score, model assignment) |
| Commands in `.claude/commands/` | Exposed via tRPC router + chat slash commands in dashboard |
| Hooks in `settings.json` | Mapped to Brain lifecycle events (ticket execution, agent delegation, LLM calls) |
| MCPs in `settings.json` | Registered in engine registry, managed via MCP proxy with auth + rate limiting |
| Settings presets | Applied per workspace/agent/Mini Brain scope (not global) |

---

## Awesome Claude Code Ecosystem — Additional Components

From the curated awesome-claude-code lists (hesreallyhim, jqueryscript, rohitg00, ccplugins): 500+ tools across 15 categories. Here's what the Brain should absorb:

### Orchestration Frameworks to Study/Integrate

| Framework | Stars | What Brain Steals |
|-----------|-------|-------------------|
| **Claude-Flow** (ruvnet) | 11.4K | Recursive execution cycles: write → edit → test → optimize. Brain's Flow Engine should support this pattern |
| **wshobson/agents** | 31.3K | 112 specialized agents + 16 multi-agent workflow orchestrators. Largest agent library — import as Brain agents |
| **oh-my-claudecode** | 9.9K | Teams-first: 19 agents + 28 skills designed for multi-agent coordination. Model for Mini Brain team composition |
| **vibe-kanban** | 23.2K | Kanban-based orchestration for 10+ agents. Brain's ticket system should support kanban views |
| **production-grade** | — | 14-agent autonomous pipeline: PM → Architect → Backend → Frontend → QA → Security. Template for Brain's Deep Work mode |

### Memory Systems to Integrate

| System | Stars | Integration Plan |
|--------|-------|-----------------|
| **claude-mem** | 35.9K | Auto-capture everything agents do, compress with AI, inject into context. Brain's Memory Engine should adopt this pattern for auto-learning |
| **claude-context** (Zilliz) | 5.6K | Hybrid BM25 + dense vector search across codebases. Integrate into Memory Engine's recall tier for code-aware search |
| **MCP Memory Service** (doobidoo) | — | 5ms retrieval + D3.js graph visualization. Brain should match this latency target |
| **Neo4j Memory Server** | — | Relationship mapping via graph DB. Brain's knowledge graph should use similar entity-relation patterns in Postgres |
| **cipher** | 3.4K | Open-source memory layer specifically for coding agents. Study for Brain's coding-focused memory patterns |

### Security Components (Critical for Brain)

| Tool | Purpose | Brain Integration |
|------|---------|-------------------|
| **parry** (vaporif) | Prompt injection scanner: scans tool inputs/outputs | **Must have**: Run as input guardrail hook on every LLM call across all tiers |
| **Trail of Bits Security Skills** | CodeQL, Semgrep, variant analysis, fix verification | Install as Brain-level security skills for code review agents |
| **Dippy** (ldayton) | AST-based safe command auto-approve; blocks destructive ops | Model for Brain's tool guardrail: understand command semantics before allowing |
| **Bouncer** | Cross-model quality gate (Gemini audits Claude) | Brain should support multi-model verification: use a different LLM to audit primary agent output |
| **claude-code-safety-net** | Catches destructive commands | Baseline safety for all tiers |

### Monitoring & Observability (Brain Ops Center)

| Tool | Stars | Brain Integration |
|------|-------|-------------------|
| **claude-code-otel** (ColeMurray) | — | Prometheus + Loki + Grafana pipeline. Reference architecture for Brain's OTel Phase 2 |
| **Bifrost** | — | Open-source AI gateway: hierarchical budgets, virtual keys, <11us overhead. Study for Brain's LLM Engine gateway |
| **ccusage** (ryoppippi) | 11.5K | CLI for analyzing usage from JSONL. Brain should store metrics in Postgres, not JSONL |
| **ccflare / better-ccflare** | — | Tableau-quality web dashboard for usage. Model for Brain's cost tracking UI |
| **Datadog AI Agents Console** | — | Claude Code monitoring: adoption, performance, spend, ROI. Brain's Ops Center should match these dimensions |
| **Arize Dev-Agent-Lens** | — | LiteLLM + OTel + OpenInference spans. Proxy-based observability pattern |

### Hooks Library (Brain Lifecycle Enforcement)

| Hook | Purpose | Brain Tier |
|------|---------|-----------|
| **parry** | Prompt injection detection on all tool I/O | Brain (universal) |
| **Dippy** | AST-aware command approval | Brain (universal) |
| **TDD Guard** (nizos) | Blocks changes violating TDD principles | Mini Brain (engineering domains) |
| **TypeScript Quality Hooks** | TSC + ESLint + Prettier with <5ms caching | Mini Brain (TypeScript domains) |
| **HCOM** (aannoo) | Real-time inter-agent communication via hooks | Brain (agent bus enhancement) |
| **CC Notify** (dazuiba) | Desktop/mobile notifications for events | Brain (notification system) |
| **Claudio** (ctoth) | OS-native sounds for events | Development (UX polish) |

### Multi-Agent Communication Patterns

| Pattern | Source | Brain Implementation |
|---------|--------|---------------------|
| **Hook-based messaging** | HCOM | Add hook-triggered agent messages: when agent A finishes, auto-notify agent B |
| **Workspace isolation** | claude-squad | Each agent runs in isolated workspace (git worktree). Brain's worker already does this via pg-boss job isolation |
| **Swarm connectivity** | claude-swarm | YAML-defined agent swarms with connection topology. Brain's `ephemeral_swarms` table supports this |
| **Cross-model audit** | Bouncer | Agent A (Claude) produces output → Agent B (Gemini) audits it. Brain's Eval Engine should support multi-model verification |
| **Parallel worktrees** | pro-workflow | Multiple agents work on different branches simultaneously, merge when done |

### Auto-Configuration Intelligence

| Tool | Stars | Brain Application |
|------|-------|-------------------|
| **PUIUX Pilot** | — | Scans 95+ project types, auto-selects from 28+ hooks. Brain's App Factory should do this: scan a new Development's codebase and auto-configure appropriate hooks, skills, and agents |
| **Rulesync** (dyoshikawa) | — | Auto-generate configs across AI coding agents; convert between providers. Brain should support multi-agent-format export |
| **ClaudeCTX** | — | Switch entire config with single command. Brain's Mini Brains should support context switching between domains |

### Workflow Patterns to Encode

| Pattern | Source | Brain Implementation |
|---------|--------|---------------------|
| **Spec-driven development** | claude-code-spec-workflow, AB Method | Deep Work mode: always start with a spec/PRD, get approval, then execute |
| **Self-correcting memory** | pro-workflow | Agent detects own mistakes, writes to memory "don't do X", future agents inherit the lesson |
| **Checkpoint + wrap-up rituals** | claudekit, pro-workflow | Auto-checkpoint at milestones + structured session wrap-up that captures learnings |
| **RIPER phases** | RIPER Workflow | Research → Innovate → Plan → Execute → Review. Map to Deep Work mode's planning phases |
| **Kanban orchestration** | vibe-kanban | Ticket board as the orchestration interface: agents pick from backlog, move to in-progress, done |
| **14-agent pipeline** | production-grade | PM → Architect → Backend → Frontend → QA → Security → Deploy. Template for Brain's project orchestration flow |

### Notable Agent Archetypes (from wshobson, oh-my-claudecode, production-grade)

**Universal (Brain-level):**
- Architect Agent — designs system architecture, reviews PRs for architectural consistency
- Security Auditor — runs CodeQL/Semgrep, reviews for OWASP, scans secrets
- Test Generator — generates unit/integration/E2E tests, enforces TDD
- Code Reviewer — multi-file review with quality scoring + suggestions
- Performance Optimizer — profiles, identifies bottlenecks, suggests optimizations
- Documentation Agent — auto-generates docs, keeps README/API docs in sync
- Release Manager — manages versioning, changelogs, deployment pipelines
- Incident Responder — monitors errors, diagnoses root cause, suggests fixes

**Engineering Mini Brain:**
- Frontend Developer — React/Vue/Svelte specialist
- Backend Developer — API design, database, auth
- DevOps Engineer — CI/CD, Docker, Kubernetes, Terraform
- DBA — Schema design, query optimization, migrations
- SRE — Monitoring, alerting, incident response
- AI/ML Engineer — Model training, fine-tuning, evaluation

**Design Mini Brain:**
- UI Designer — Pixel-perfect component design
- UX Researcher — User testing, persona creation, journey mapping
- Brand Designer — Identity systems, guidelines, assets
- Motion Designer — Animation, micro-interactions
- Accessibility Specialist — WCAG compliance, screen reader testing

---

## Everything-Claude-Code (ECC) — The Instinct System + Best Patterns

From affaan-m/everything-claude-code (96.6K stars, hackathon-winning config). This is the most-starred Claude Code enhancement and contains the **most novel learning pattern** in the ecosystem.

### The Instinct System (Brain Must Have This)

An **instinct** is an atomic learned behavior — one trigger, one action, confidence-weighted, domain-tagged, evidence-backed. This is fundamentally different from memory (which stores facts) or skills (which store procedures). Instincts store **behavioral patterns**.

```
How it works in Brain:

1. Every tool call, agent action, and human correction is captured via hooks
2. A background observer (cheap model like Haiku) analyzes patterns
3. Patterns become instincts:
   - "When user corrects agent X's output format → instinct: always use structured JSON for X"
   - "When ticket fails due to missing context → instinct: always check memory before executing"
   - "When build error contains 'type mismatch' → instinct: run TypeScript check before committing"
4. Confidence increases when pattern repeats (0.3 → 0.5 → 0.7 → 0.9)
5. Confidence decreases when user overrides the behavior
6. When confidence ≥ 0.8 in 2+ Mini Brains → auto-promote to Brain (universal instinct)
```

**Brain implementation**: `src/server/services/instincts/`

```
instincts/
├── observer.ts         # Background Haiku agent analyzing tool call patterns
├── pattern-detector.ts # Clusters observations into candidate instincts
├── confidence.ts       # Bayesian confidence scoring with decay
├── promoter.ts         # Project → Mini Brain → Brain promotion logic
├── injector.ts         # Injects relevant instincts into agent prompts
└── evolve.ts           # Clusters related instincts → generates new skills/commands
```

**Database tables:**
```
instincts (
  id,
  trigger (text),              -- "when X happens"
  action (text),               -- "do Y"
  confidence (float),          -- 0.0 - 1.0
  domain (text),               -- 'universal', 'astrology', 'hospitality'
  scope enum[development/mini_brain/brain],  -- where it applies
  entity_id FK → brain_entities,  -- which entity learned this
  evidence_count (int),        -- how many times observed
  last_observed_at,
  created_at, updated_at
)

instinct_observations (
  id,
  instinct_id FK,
  event_type,                  -- 'tool_call', 'user_correction', 'error_resolution'
  payload JSONB,               -- the raw observation
  created_at
)
```

**Promotion cascade:**
```
Development observes pattern → confidence reaches 0.7 → instinct saved at Development level
  ↓
Same pattern seen in 2+ Developments under same Mini Brain → promoted to Mini Brain level
  ↓
Same pattern seen in 2+ Mini Brains → promoted to Brain level (universal instinct)
  ↓
Brain instinct with confidence ≥ 0.9 + evidence_count ≥ 50 → candidate for evolution into a Skill
```

**Evolution**: When related instincts cluster (e.g., 5 instincts about TypeScript error handling), the `evolve.ts` service uses an LLM to synthesize them into a proper SKILL.md file. The skill is auto-installed and the instincts are marked as "evolved."

### ECC Patterns the Brain Should Adopt

**1. Three-Phase Session Hooks:**
| Phase | ECC Hook | Brain Equivalent |
|-------|---------|-----------------|
| SessionStart | Load previous context, detect environment | Load core memory + active project context + relevant instincts |
| PreCompact | Save important state before context compression | Save checkpoint to Postgres before pg-boss job timeout |
| SessionEnd/Stop | Persist learnings, run pattern eval, track metrics | Write observations to instinct observer, finalize receipt, update gateway metrics |

**2. Automatic Agent Delegation (not manual):**
- Code written → auto-trigger `code-reviewer` agent
- Build fails → auto-trigger language-specific `build-resolver` agent
- Complex feature requested → auto-trigger `planner` agent
- Security-sensitive change → auto-trigger `security-reviewer` agent

Brain implementation: Add `auto_delegation_rules` to the Flow Engine. Rules are condition-action pairs that trigger agents based on events, not manual assignment.

**3. Adversarial Security Scanning (Red/Blue/Auditor):**
```
Security Scan Request
    │
    ├──→ Red Team Agent (finds exploit chains)
    │         │
    ├──→ Blue Team Agent (evaluates protections)
    │         │
    └──→ Auditor Agent (synthesizes both → prioritized risk report)
```
Brain implementation: Add to Guardrail Engine as `/security-deep-scan` command. Uses 3 parallel agents with different system prompts (attacker, defender, auditor). Runs on: Mini Brain creation, Development deployment, weekly cron.

**4. Config Protection Hooks:**
Prevent agents from modifying linter/test configs to pass instead of fixing actual code. Brain implementation: Add a guardrail rule that detects when an agent modifies `.eslintrc`, `tsconfig.json`, `jest.config`, `prettier.config`, etc. and requires human approval.

**5. Hook Runtime Controls:**
```bash
export BRAIN_HOOK_PROFILE=minimal|standard|strict
export BRAIN_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"
```
Brain implementation: Add `hook_profile` to `brain_entities` table. Each tier can run in minimal (fast, fewer checks), standard (balanced), or strict (all guardrails, all logging) mode.

**6. Autonomous Loop Spectrum:**
Map ECC's loop patterns to Brain's tiered agent modes:

| ECC Pattern | Brain Mode | When |
|-------------|-----------|------|
| Sequential pipeline (`claude -p`) | Quick mode | Single LLM call, fresh context |
| NanoClaw REPL | Chat mode | Persistent conversation |
| Infinite Agentic Loop | Autonomous mode | Parallel sub-agents in waves |
| Continuous PR Loop | Deep Work mode | Branch → implement → PR → CI → fix → merge |
| DAG orchestration | Flow Engine | Dependency graph, tiered quality, worktree isolation |

**7. Token Optimization Strategy:**
- Default to smaller model for 90% of work (Sonnet)
- Large model (Opus) only for: 5+ file changes, architecture, security review
- The Brain's LLM Engine `model_strategy` tiers map directly:
  - `fast` = Haiku (routing, classification, instinct observation)
  - `standard` = Sonnet (90% of agent work)
  - `smart` = Opus (architecture, security, multi-file review)
  - `code` = Code-specialized model (generation tasks)

**8. De-Sloppify Pattern:**
After an implementation agent finishes, a separate cleanup agent reviews the output. Two focused agents outperform one constrained agent.

Brain implementation: Add to Flow Engine as an optional post-step. Any ticket in autonomous or deep-work mode gets a cleanup pass by a different agent before marking as done.

---

## AI Engineering Hub — Novel Patterns to Absorb

From patchy631/ai-engineering-hub (32.5K stars, 93 real-code implementations). These are patterns NOT covered by the frameworks/tools above — genuinely new architectural ideas.

### Pattern 1: Context Engineering Pipeline (Brain Memory Engine Enhancement)

Multi-source gather → evaluate relevance → filter → synthesize. The key innovation is the **evaluator-as-quality-gate** between retrieval and generation.

```
User query arrives
    │
    ▼
┌─────────────────────────────────────────┐
│  GATHER (parallel, multi-source)         │
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ RAG  │ │Memory│ │ Web  │ │ Tools  │ │
│  │vector│ │recall│ │search│ │ output │ │
│  └──┬───┘ └──┬───┘ └──┬───┘ └───┬────┘ │
│     │        │        │         │       │
└─────┼────────┼────────┼─────────┼───────┘
      │        │        │         │
      ▼        ▼        ▼         ▼
┌─────────────────────────────────────────┐
│  EVALUATE (LLM scores each source 0-1)  │
│                                          │
│  RAG: 0.85  Memory: 0.92  Web: 0.3     │
│  Tools: 0.71                             │
│                                          │
│  Filter: drop Web (< 0.5 threshold)     │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│  SYNTHESIZE (using only high-quality     │
│  sources: RAG + Memory + Tools)          │
└─────────────────────────────────────────┘
```

**Brain implementation**: Add to `src/server/services/memory/context-pipeline.ts`. Every LLM call in autonomous/deep-work mode goes through this pipeline. Quick mode skips evaluation (uses raw retrieval). The relevance scores feed back into the Eval Engine for quality tracking.

### Pattern 2: Parlant State Machines (Brain Agent Behavior Specification)

Declarative agent behavior using journeys, transitions, glossaries, and condition-action guidelines. This is fundamentally better than prompt-only agents for constrained domains.

```typescript
// Example: Hospitality Mini Brain — Guest Check-in Journey
const checkInJourney = journey('guest-check-in')
  .glossary({
    'PMS': 'Property Management System — the hotel operational database',
    'OTA': 'Online Travel Agency — Booking.com, Expedia, etc.',
    'RevPAR': 'Revenue Per Available Room — key performance metric',
    'ADR': 'Average Daily Rate — average room revenue per occupied room',
  })
  .state('greeting', {
    guidelines: [
      { when: 'guest provides confirmation number', action: 'look up reservation in PMS', tool: 'pms.getReservation' },
      { when: 'guest is a returning VIP', action: 'acknowledge loyalty status and preferences', tool: 'memory.recall' },
      { when: 'guest has no reservation', action: 'check availability and offer walk-in rate', tool: 'pms.checkAvailability' },
    ],
    transitions: {
      'reservation found': 'verification',
      'no reservation': 'walk-in-booking',
    }
  })
  .state('verification', {
    guidelines: [
      { when: 'ID matches reservation', action: 'proceed to room assignment' },
      { when: 'ID mismatch', action: 'escalate to front desk manager', tool: 'a2a.delegate' },
    ],
    transitions: {
      'verified': 'room-assignment',
      'escalated': 'manager-review',
    }
  })
  .state('room-assignment', { /* ... */ })
```

**Brain implementation**: Add `src/server/services/agents/journey-engine.ts`. Journeys are stored in the database as JSONB. Mini Brains define domain-specific journeys. The journey engine enforces state transitions deterministically while allowing LLM reasoning within each state. This sits between the Flow Engine (deterministic orchestration) and the Crew Engine (autonomous reasoning).

### Pattern 3: Trust Scores on Tool Outputs (Brain Guardrail Enhancement)

Tools self-report confidence. The orchestrator uses these scores for routing decisions.

```typescript
// Every tool invocation returns a trust score
interface ToolResult {
  output: any
  trust_score: number    // 0.0 - 1.0
  source: string         // 'cached' | 'live' | 'computed' | 'estimated'
  staleness_hours: number // how old is this data
}

// Orchestrator routing based on trust
if (toolResult.trust_score < 0.5) {
  // Low trust: verify with a second tool or different provider
  const verification = await secondaryTool.invoke(sameParams)
  if (verification.trust_score > toolResult.trust_score) {
    return verification // prefer higher-trust result
  }
}
```

**Brain implementation**: Add `trust_score` field to all tool/engine responses. The Guardrail Engine uses trust scores to decide whether to:
- Accept the result (score > 0.8)
- Verify with a second source (0.5 < score < 0.8)
- Reject and retry with different approach (score < 0.5)

Store trust scores in `gateway_metrics` table for tracking tool reliability over time.

### Pattern 4: Corrective RAG Loop (Brain Memory Engine Enhancement)

Self-healing retrieval: grade each document → if any are irrelevant → rewrite query → fall back to web search → combine results.

```
Query → Retrieve documents
            │
            ▼
      Grade each doc for relevance
            │
        ┌───┴───┐
        │       │
    All good   Some irrelevant
        │       │
        ▼       ▼
    Synthesize  Rewrite query
                    │
                    ▼
              Web search fallback
                    │
                    ▼
              Merge results
                    │
                    ▼
              Synthesize
```

**Brain implementation**: Integrate into `src/server/services/memory/recall-store.ts`. When recall search returns results, run a lightweight relevance check (fast model or heuristic). If < 70% of results are relevant, auto-rewrite the query and retry. If still poor, fall back to web search via OpenClaw's Brave Search. This makes memory retrieval self-correcting.

### Pattern 5: Fan-Out with Heterogeneous LLMs (Brain LLM Engine Enhancement)

Use different models for different stages based on cost/quality tradeoffs:

| Stage | Model | Why |
|-------|-------|-----|
| Routing/classification | Small/fast (Haiku, Groq) | Cheap, low-latency, just needs to pick a path |
| Deep analysis | Large/smart (Opus, GPT-4o) | Quality matters, willing to pay |
| Code generation | Code-specialized (Claude Sonnet, Codex) | Best at structured output |
| Synthesis/summary | Medium (Sonnet, GPT-4o-mini) | Good enough, much cheaper |
| Guardrail checks | Different provider (Gemini auditing Claude) | Cross-model reduces blind spots |

**Brain implementation**: Add `model_strategy` to Flow definitions. Each flow step can specify a model tier (`fast`, `smart`, `code`, `cheap`) instead of a specific model. The LLM Engine resolves the tier to the best available model based on current health, cost, and latency.

### Pattern 6: Agent-as-API via LitServe (Brain A2A Enhancement)

Clean pattern for deploying multi-agent crews as production HTTP APIs:

```python
class AgenticRAGAPI(LitAPI):
    def setup(self):      # Initialize agent crew
    def decode_request(self): # Parse HTTP input
    def predict(self):    # Run crew execution
    def encode_response(self): # Format HTTP output
```

**Brain implementation**: Every Mini Brain already exposes its domain engines via tRPC. But for external consumers (non-Brain apps), expose a REST/OpenAI-compatible API wrapper. This lets any HTTP client (not just Brain SDK users) call Mini Brain agents. Add `src/server/services/a2a/rest-gateway.ts` that wraps tRPC procedures as standard REST endpoints with OpenAI-compatible request/response format.

### Pattern 7: Temporal Knowledge Graph (Brain Memory Engine Enhancement)

Graphiti (by Zep) provides time-aware memory where facts have timestamps and can be queried by recency, not just similarity.

**Brain implementation**: Add `created_at` and `last_accessed_at` to memory retrieval scoring:
```
final_score = (similarity * 0.6) + (recency * 0.3) + (access_frequency * 0.1)
```
Where `recency = 1 / (1 + days_since_creation * decay_rate)`. This is already partially in the tiered memory design but should be formalized as a scoring function.

### Pattern 8: Semantic Memory Export (Cross-Session Intelligence)

Store agent conversations in a structured table → compute embeddings → export to vector store for cross-session semantic search.

**Brain implementation**: Already covered by `chat_messages` table + pgvector. But add a **compaction step**: after a chat session ends, an LLM summarizes key facts/decisions/outcomes and stores them as archival memories. Raw messages are retained for recall tier but the distilled knowledge goes to archival for long-term cross-session intelligence.

---

## Pre-Installed Tools & Skills Catalog

### Tier 1 — Pre-Installed (available out of the box)

**Browser & Web:**
| Tool | Purpose |
|------|---------|
| Playwright MCP | Multi-browser automation (Chromium/Firefox/WebKit) |
| Firecrawl MCP | Web scraping to clean markdown/JSON, JS rendering |
| DuckDuckGo Search MCP | Free web search (no API key needed) |
| Brave Search MCP | High-quality web search |
| Context7 MCP | Version-specific code docs injection (eliminates API hallucination) |

**Productivity:**
| Tool | Purpose |
|------|---------|
| GitHub MCP | Repos, issues, PRs, code search |
| Slack MCP | Messages, channels, workflows (47 tools) |
| Notion MCP | Pages, databases, content management |
| Gmail MCP | Email read/send/manage |
| Linear MCP | Modern issue tracking |

**Data & Infrastructure:**
| Tool | Purpose |
|------|---------|
| PostgreSQL MCP | Natural language SQL queries |
| SQLite MCP | Lightweight embedded database |
| Filesystem MCP | Secure file read/write with access controls |
| Git MCP | Version control operations |
| Docker Hub MCP | Container management |

**Intelligence:**
| Tool | Purpose |
|------|---------|
| Memory MCP | Knowledge graph-based persistent memory |
| Sequential Thinking MCP | Structured step-by-step reasoning |

### Tier 2 — One-Click Install

**Productivity:** Google Workspace, Jira, Asana, HubSpot, Salesforce, Airtable
**DevOps:** Terraform, Kubernetes, Sentry, Datadog, PagerDuty, Prometheus
**Browser:** Puppeteer, Chrome DevTools, Browserbase, Stagehand
**Database:** MongoDB, Supabase, DBHub (unified multi-engine)
**Search:** Tavily (AI-native search), Perplexity MCP

### Tier 3 — Marketplace (browsable, 500K+ skills)

Browse from: OpenClaw's 67 built-in skills, SkillsMP, ClawHub, Composio's 500+ connectors
Categories: coding, media processing, data analysis, smart home, finance, healthcare, legal

### Security: Skill Scanning Pipeline

**CRITICAL**: 12% of community skills on ClawHub contained malware (VirusTotal, Feb 2026). 341 malicious skills were weaponized.

Implementation in `src/server/services/skills/scanner.ts`:
- **Static analysis**: Scan SKILL.md + handler code for suspicious patterns (eval, fetch to unknown domains, credential access)
- **Sandbox execution**: Run skill in isolated container with no network, limited filesystem
- **Permission review**: Skills must declare required capabilities (file:read, network:fetch, etc.), user approves explicitly
- **Trust signals**: Verified publishers (Atlassian, Figma, Notion, Stripe), star count, audit history, community reports
- **Auto-quarantine**: Skills flagged by scanner are blocked pending manual review
- **Hash verification**: Pin skill versions, alert on unexpected changes

---

## ClawCloneOS Recent Changes — What to Carry Forward (Improved)

Last 5 commits added ~7,000+ lines: cognition layer, trust scoring, governance, token accounting. Here's what the Brain inherits and how it improves each.

### CARRY FORWARD (Improved)

| ClawCloneOS Feature | Brain Improvement |
|---------------------|-------------------|
| **Approval Gates** (`approvals.js`, 276 lines) — L0-L3 autonomy, risk levels, 10-min auto-expiry, L1 blocking | → Postgres-backed (not in-memory), cascading across tiers (Brain gates override Mini Brain gates), WebSocket real-time push to dashboard instead of polling |
| **Receipt/Audit Trail** (`receipts.js`, 336 lines) — ReceiptBuilder + AuditTrail + RollbackEngine | → Postgres transactions with savepoints replace manual `preState` JSONB snapshots. Rollback becomes `ROLLBACK TO SAVEPOINT` not custom undo functions. OTel spans auto-generated per receipt action |
| **Cognition Layer** (server.js +4,000 lines) — Memory vault, trust scoring, subconscious context injection, episodes | → Tiered memory replaces flat vault. Trust scores get weighted by task importance (not just hit/miss). Instinct system replaces regex-based pattern extraction. Episodes become Postgres partitioned table |
| **Token Accounting** (`recordTokenUsage`, `loadTokenLedger`) — Per-workspace/agent/day budgets, 429 on over-limit | → Gateway metrics table replaces in-memory ledger. Per-tier (Brain/Mini Brain/Development) cost tracking. Budget enforcement at gateway level (before LLM call, not after) |
| **ATLAS.md** (290 lines) — Canonical system reference with maturity tracking, conventions, recurring bugs | → Becomes the Brain's self-documentation system. Auto-generated from database schema + engine registry + agent catalog. Updated by a cron agent, not manually |
| **Nexus Priority Routing** (task_runner.js) — Cloud agent gets instant execution, local has concurrency limits | → LLM Engine's model strategy tiers. `fast` tier has no queue, `smart` tier has concurrency limit of 2, `code` tier queued via pg-boss |
| **CORS/Auth Hardening** — Tailscale `.ts.net`, Cloudflare `.trycloudflare.com`, `brain.mghm.ai` | → NextAuth.js handles auth. CORS configurable per Mini Brain (each Mini Brain can whitelist its Developments). API keys per entity in `brain_entities` |
| **Workspace Generator** (`routes/workspace-gen.js`, 33K) — LLM-powered workspace scaffolding with SSE streaming | → Becomes part of Mini Brain Factory. LLM generates domain agents, skills, and commands based on domain description. Streaming progress via SSE |
| **Debate Arena** (`debate_sidebar.js`) — Proof tree, constitutional interpreter, blind spot oracle, Elo ratings | → **Persist to Postgres** (currently resets on refresh). Proof tree nodes + edges in `debate_nodes` and `debate_edges` tables. Elo ratings stored per agent. Constitutional rules stored per Mini Brain |
| **48 Domain Agents** (untracked `agents/` folders) — healthcare, legal, analytics, marketing, academic, etc. | → Pre-assign to appropriate Mini Brain templates. MGHM hotel agents → Hospitality Mini Brain. Legal agents → Legal Mini Brain. Healthcare → Healthcare Mini Brain |
| **7 New Skills** (`.agents/skills/`) — context-manager, data-analyst, distributed-review, pipeline-runner, self-improving-agent, team-knowledge, watchdog | → Map to Brain tiers: `watchdog` + `distributed-review` → Brain level. `data-analyst` + `pipeline-runner` → Mini Brain level. `self-improving-agent` → feeds the Instinct System |

### REDESIGN (Don't Carry As-Is)

| ClawCloneOS Pattern | Problem | Brain Redesign |
|--------------------|---------|----------------|
| **Regex-based memory extraction** (`extractMemoriesFromReply()` matches `RULE:`, `INSIGHT:` tags) | Fragile — depends on LLM output format. ~60% capture rate | → Use a cheap LLM (Haiku) to extract structured observations from any response. Feed into Instinct observer. 95%+ capture rate |
| **In-memory debate tree** (500-node cap, resets on page refresh) | Data loss on every navigation | → Postgres tables: `debate_sessions`, `debate_nodes`, `debate_edges`. Persistent across sessions. No cap (paginated) |
| **Simple trust scoring** (hit/miss ratio) | No weighting — a failed trivial task counts as much as a failed critical task | → Bayesian trust model: `score = (weighted_successes + prior) / (weighted_total + prior_weight)` where weight = task priority * complexity. Decays over time (recent performance matters more) |
| **Brain module stub** (`brain/src/index.js`, 23 lines) | Empty; no clear purpose | → The entire Brain IS the new project. This stub is superseded by the full Brain architecture |
| **Global STATE object** (mutated everywhere) | Race conditions, no transactions, JSON file persistence | → Postgres + Drizzle ORM. React Query for client cache. Zustand for UI-only state. No global mutable object |
| **25 JSON files for persistence** | No concurrent write safety, no queries, no transactions | → Single Postgres database with 40+ properly indexed tables |
| **`saveState()` / `loadState()` cycle** | Entire state saved as one blob. One corrupt field kills everything | → Individual table mutations via tRPC. Each entity has its own CRUD. Transactions where atomicity matters |
| **In-memory event ring buffer** (100 entries) | Loses events on restart, no search capability | → `episodes` Postgres table, partitioned by month. Full-text search via `tsvector`. OTel spans for structured queries |

### NEW DATABASE TABLES (from recent changes)

Add to Phase 0 schema:

```
-- Debate persistence (from debate_sidebar.js redesign)
debate_sessions (
  id, project_id FK, status enum[active/completed/cancelled],
  constitutional_rules JSONB, created_at
)
debate_nodes (
  id, session_id FK, agent_id FK, text,
  validity float, parent_id FK self-ref, is_axiom bool,
  created_at
)
debate_edges (
  from_node_id FK, to_node_id FK, type enum[support/attack/rebuttal]
)
debate_elo (
  agent_id FK, elo_rating int default 1200, matches int, wins int,
  updated_at
)

-- Token accounting (from cognition layer)
token_ledger (
  id, entity_id FK → brain_entities,
  agent_id FK, model text, provider text,
  tokens_in int, tokens_out int, cost_usd decimal,
  period date,  -- aggregated daily
  created_at
)
token_budgets (
  entity_id FK → brain_entities,
  daily_limit_usd decimal,
  monthly_limit_usd decimal,
  alert_threshold float,  -- 0.8 = alert at 80%
  enforce bool default true,
  updated_at
)
```

---

## Port Strategy — Random Available Port

Brain and all Mini Brains use **dynamically assigned ports** to avoid conflicts with other apps on the machine.

```typescript
// packages/shared/port.ts
import { createServer } from 'net'

export async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => {
      const port = (server.address() as any).port
      server.close(() => resolve(port))
    })
  })
}

// On startup, register port in brain_entities table + write to .port file
// Other services discover via: DB lookup or reading .port file
```

- Brain app: random port, registered in `brain_entities` (tier: brain)
- Each Mini Brain: random port, registered in `brain_entities` (tier: mini_brain)
- Each Development: random port, registered in `brain_entities` (tier: development)
- Postgres: fixed 5432 (standard, inside Docker network only)
- OpenClaw gateway: fixed 18789 (internal only)
- Jaeger UI: fixed 16686 (dev only)
- Service discovery: all entities register their port in `brain_entities.endpoint` column

---

## Model Assignment — Opus / Sonnet / Haiku Division of Labor

Optimize development speed and cost by assigning the right model to each task type.

### Opus (Heavy Thinking — ~5% of calls)
| Task | Why Opus |
|------|---------|
| System architecture decisions | Needs deep reasoning across 5+ files, multiple concerns |
| Security review (adversarial red/blue/auditor) | Needs creative attack thinking + thorough defense analysis |
| Multi-file refactoring plans | Must hold entire dependency graph in context |
| Eval dataset creation (LLM-as-judge) | Judging quality requires the strongest model |
| Instinct evolution (clustering instincts → skills) | Synthesizing patterns into coherent skills needs high reasoning |
| Complex debugging (cross-service traces) | Root cause analysis across multiple services |
| ATLAS.md / documentation synthesis | Comprehensive system understanding |
| Debate arbitration (auditor agent) | Must weigh both sides fairly |

### Sonnet (Daily Driver — ~85% of calls)
| Task | Why Sonnet |
|------|-----------|
| All ticket execution (autonomous mode) | Good balance of quality and speed for standard tasks |
| Code generation (features, tests, migrations) | Strong code output, 3x cheaper than Opus |
| Chat responses | Sufficient quality for interactive conversation |
| Agent-to-agent messaging (sessions_yield) | Fast enough for synchronous Q&A |
| Flow step execution | Standard workflow steps don't need Opus-level reasoning |
| Memory search + retrieval | Good at understanding queries and ranking results |
| Receipt + checkpoint creation | Structured output, doesn't need heavy reasoning |
| Guardrail checks (output validation) | Pattern matching and policy checking |
| Deep Work planning phase | Can generate good plans, user reviews anyway |

### Haiku (Fast + Cheap — ~10% of calls)
| Task | Why Haiku |
|------|----------|
| Instinct observation (background observer) | Runs on EVERY tool call — must be ultra-cheap |
| Routing/classification ("which agent handles this?") | Just needs to pick from a list |
| Context evaluation scoring (0-1 relevance) | Simple numeric judgment |
| Trust score calculation | Lightweight computation |
| Guardrail checks (input validation, injection detection) | Fast pattern matching, runs before expensive calls |
| Corrective RAG relevance grading | Quick yes/no per document |
| Query rewriting (for memory search) | Simple reformulation |
| Session compaction (summarize for memory) | Compression, not creation |
| Notification formatting | Template filling |
| Health check analysis | Simple status interpretation |

### Implementation in LLM Engine

```typescript
// src/server/engines/llm/model-strategy.ts

type ModelTier = 'opus' | 'sonnet' | 'haiku'

const MODEL_STRATEGY: Record<string, ModelTier> = {
  // Architecture & Security
  'architecture-review': 'opus',
  'security-scan-deep': 'opus',
  'multi-file-refactor': 'opus',
  'eval-judge': 'opus',
  'instinct-evolve': 'opus',
  'debug-complex': 'opus',
  'debate-arbitrate': 'opus',

  // Standard Work
  'ticket-execute': 'sonnet',
  'code-generate': 'sonnet',
  'chat-respond': 'sonnet',
  'agent-yield': 'sonnet',
  'flow-step': 'sonnet',
  'memory-search': 'sonnet',
  'deep-work-plan': 'sonnet',

  // Fast & Cheap
  'instinct-observe': 'haiku',
  'route-classify': 'haiku',
  'context-score': 'haiku',
  'guardrail-input': 'haiku',
  'rag-grade': 'haiku',
  'query-rewrite': 'haiku',
  'session-compact': 'haiku',
  'health-check': 'haiku',
}

// Resolve tier to actual model based on available providers
function resolveModel(tier: ModelTier): string {
  switch (tier) {
    case 'opus':  return 'claude-opus-4-6'    // or fallback to gpt-4o
    case 'sonnet': return 'claude-sonnet-4-6'  // or fallback to gpt-4o-mini
    case 'haiku': return 'claude-haiku-4-5'   // or fallback to groq/llama
  }
}
```

### Cost Estimate (per 1,000 tickets)

| Model | % of Calls | Avg Tokens/Call | Cost/1K Tickets |
|-------|-----------|-----------------|-----------------|
| Opus | 5% (50 calls) | ~4,000 | ~$3.00 |
| Sonnet | 85% (850 calls) | ~2,000 | ~$5.10 |
| Haiku | 10% (100 calls) | ~500 | ~$0.03 |
| **Total** | | | **~$8.13 per 1K tickets** |

With semantic caching (gateway), expect 20-30% cache hit rate → effective cost ~$6/1K tickets.

---

## Docker Compose (Dev Environment)

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    ports: [5432:5432]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: solarc
      POSTGRES_PASSWORD: dev

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports: [16686:16686, 4317:4317]  # UI + OTLP gRPC

  openclaw:
    build: ./openclaw
    ports: [18789:18789]  # WebSocket gateway
    volumes: [openclaw-data:/root/.openclaw]

  app:
    build: ./apps/web
    ports: [3000:3000]
    depends_on: [postgres, openclaw, jaeger]
    environment:
      DATABASE_URL: postgres://postgres:dev@postgres:5432/solarc
      OPENCLAW_WS: ws://openclaw:18789
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317

  worker:
    build: ./apps/worker
    depends_on: [postgres, openclaw]
    environment:
      DATABASE_URL: postgres://postgres:dev@postgres:5432/solarc
      OPENCLAW_WS: ws://openclaw:18789
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317

volumes:
  pgdata:
  openclaw-data:
```

---

## Anti-Patterns — What Will Kill This Project

These are the failure modes that sink ambitious AI platforms. Every developer and agent must avoid them.

| Anti-Pattern | Why It's Fatal | Prevention |
|-------------|----------------|------------|
| **God Service** — One service that "does everything" | Impossible to test, deploy, or reason about. Every change risks breaking unrelated features | Each engine is a separate module with its own tests. No engine exceeds 2,000 LOC. Split on first sign of bloat |
| **Shared Mutable State** — Global objects, singletons with state | Race conditions, impossible debugging, state corruption across async flows | Postgres is the single source of truth. In-memory state is read-only caches with TTL. Zustand for UI-only state |
| **Leaky Abstractions** — Drizzle types in use cases, tRPC context in domain | Couples inner layers to outer layers, makes swapping impossible | Clean Architecture Enforcement Rules above. ESLint catches violations. Architect Agent flags them |
| **Premature Optimization** — Building for 10K concurrent users on day 1 | Over-engineering kills velocity. You need working features, not theoretical scale | Build for correctness first. Profile before optimizing. pg-boss handles job scaling. Optimize only when metrics prove a bottleneck |
| **Agent Sprawl** — 200 agents with overlapping skills | Routing becomes impossible, context is wasted listing capabilities, token costs explode | Each Mini Brain has max 8 domain agents. Brain has max 12 universal agents. Merge before adding. Quality > quantity |
| **Unmonitored LLM Calls** — LLM calls without traces, cost tracking, or guardrails | Runaway costs, silent hallucinations, no debugging capability | EVERY LLM call goes through the Gateway Engine. No direct `anthropic.messages.create()` anywhere. Gateway enforces tracing + cost + guardrails |
| **JSON File Persistence** — Storing state in JSON files (the ClawCloneOS trap) | No transactions, no concurrent safety, no queries, total data loss risk | Phase 0 migrates ALL state to Postgres. JSON files are read once during seed migration, then deleted. No new JSON persistence ever |
| **Missing Error Boundaries** — One failed agent crashes the entire Brain | Cascading failures take down all Mini Brains and Developments | Circuit breakers per engine, per provider. pg-boss DLQ for failed jobs. Healing Engine auto-detects and isolates failures |

---

*This is a living document. Update it as the project evolves. The Brain's Documentation Agent auto-updates the ATLAS.md system reference from this blueprint.*
