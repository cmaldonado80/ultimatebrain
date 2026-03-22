# Ultimate Brain — Architecture & Development Blueprint

> An AI Agent Platform that orchestrates multiple AI agents to accomplish complex tasks autonomously.

---

## 1. Vision & Core Principles

**Ultimate Brain** is a modular, extensible AI agent orchestration platform. It enables the creation, coordination, and management of autonomous AI agents that collaborate to solve complex, multi-step tasks.

### Core Principles

- **Clean Architecture** — Strict separation of concerns with dependency inversion. Business logic never depends on frameworks, databases, or external services.
- **Domain-Driven Design (DDD)** — The codebase mirrors the problem domain. Ubiquitous language is enforced across layers.
- **SOLID Principles** — Every module follows Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion.
- **Hexagonal Architecture (Ports & Adapters)** — Core logic is isolated behind well-defined ports. External systems connect via swappable adapters.
- **Event-Driven** — Agents communicate through events, enabling loose coupling and horizontal scalability.
- **Token-Optimized Development** — Development phases are assigned to the appropriate Claude model to maximize quality while minimizing cost.

---

## 2. Project Structure & Organization

```
ultimatebrain/
├── .github/                          # CI/CD, issue templates, PR templates
│   ├── workflows/
│   │   ├── ci.yml                    # Lint, test, build pipeline
│   │   ├── deploy.yml                # Deployment pipeline
│   │   └── release.yml               # Semantic release
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── packages/                         # Monorepo packages (Turborepo)
│   ├── core/                         # Domain layer — pure business logic
│   │   ├── src/
│   │   │   ├── entities/             # Domain entities (Agent, Task, Brain, Memory)
│   │   │   ├── value-objects/        # Immutable value types
│   │   │   ├── events/              # Domain events
│   │   │   ├── errors/              # Domain-specific errors
│   │   │   ├── ports/               # Interfaces (inbound & outbound)
│   │   │   │   ├── inbound/         # Use-case interfaces
│   │   │   │   └── outbound/        # Repository & service interfaces
│   │   │   └── use-cases/           # Application use cases
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agents/                       # Agent implementations
│   │   ├── src/
│   │   │   ├── base/                # Base agent class & lifecycle
│   │   │   ├── orchestrator/        # Agent orchestration & coordination
│   │   │   ├── planner/             # Task planning agent
│   │   │   ├── executor/            # Task execution agent
│   │   │   ├── reviewer/            # Quality review agent
│   │   │   └── memory/             # Memory & context agent
│   │   └── tests/
│   │
│   ├── infrastructure/              # Adapters & external integrations
│   │   ├── src/
│   │   │   ├── persistence/         # Database adapters (repositories)
│   │   │   ├── messaging/           # Event bus, message queues
│   │   │   ├── llm/                # LLM provider adapters (Claude, etc.)
│   │   │   ├── tools/              # External tool integrations
│   │   │   ├── cache/              # Caching layer (Redis, in-memory)
│   │   │   └── config/             # Configuration management
│   │   └── tests/
│   │
│   ├── api/                         # API layer (REST/GraphQL/WebSocket)
│   │   ├── src/
│   │   │   ├── rest/               # REST endpoints
│   │   │   ├── ws/                 # WebSocket handlers (real-time)
│   │   │   ├── middleware/         # Auth, logging, rate limiting
│   │   │   ├── dto/               # Data transfer objects
│   │   │   └── validators/        # Request validation schemas
│   │   └── tests/
│   │
│   ├── dashboard/                   # Web UI (Next.js)
│   │   ├── src/
│   │   │   ├── app/               # Next.js app router
│   │   │   ├── components/        # UI components
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   ├── stores/            # State management (Zustand)
│   │   │   └── lib/               # Client utilities
│   │   └── tests/
│   │
│   └── shared/                      # Shared types, utils, constants
│       ├── src/
│       │   ├── types/              # Shared TypeScript types
│       │   ├── utils/              # Pure utility functions
│       │   └── constants/          # Shared constants
│       └── tests/
│
├── tools/                           # Dev tooling & scripts
│   ├── scripts/                     # Build, deploy, migration scripts
│   └── generators/                  # Code generators / scaffolding
│
├── docs/                            # Documentation
│   ├── architecture/               # ADRs (Architecture Decision Records)
│   ├── api/                        # API documentation
│   └── guides/                     # Developer guides
│
├── docker/                          # Docker configurations
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── turbo.json                       # Turborepo configuration
├── package.json                     # Root package.json
├── tsconfig.base.json              # Base TypeScript config
├── .eslintrc.js                    # ESLint configuration
├── .prettierrc                     # Prettier configuration
├── vitest.config.ts                # Test configuration
├── BRAIN-ARCHITECTURE.md           # This file
├── CLAUDE.md                       # Claude Code project instructions
└── README.md
```

### Architecture Layer Rules

| Layer | Depends On | Never Depends On |
|---|---|---|
| **Entities / Domain** | Nothing | Infrastructure, API, UI |
| **Use Cases** | Entities, Ports | Infrastructure, API, UI |
| **Adapters / Infrastructure** | Ports (implements them) | Use Cases directly |
| **API / UI** | Use Cases (via ports) | Infrastructure internals |

> **The Dependency Rule**: Source code dependencies always point inward. Nothing in an inner circle can know about anything in an outer circle.

---

## 3. Key Domain Concepts

| Concept | Description |
|---|---|
| **Brain** | The top-level orchestrator. Manages the agent pool, task queue, and global memory. |
| **Agent** | An autonomous unit with a specific role (planner, executor, reviewer). Has its own context and capabilities. |
| **Task** | A unit of work with defined inputs, outputs, and acceptance criteria. |
| **TaskGraph** | A DAG (directed acyclic graph) of tasks that represents a complex workflow. |
| **Memory** | Short-term (conversation), working (current task), and long-term (vector store) memory layers. |
| **Tool** | An external capability an agent can invoke (API calls, file ops, code execution). |
| **Event** | An immutable record of something that happened in the system. Drives all inter-agent communication. |

---

## 4. Technology Stack

| Category | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js 22+ | Native TypeScript support, performance |
| **Language** | TypeScript 5.x (strict mode) | Type safety, developer experience |
| **Monorepo** | Turborepo + pnpm workspaces | Fast builds, dependency management |
| **API** | Fastify | High performance, schema validation |
| **Real-time** | WebSocket (ws / Socket.io) | Live agent status, streaming responses |
| **Frontend** | Next.js 15 + React 19 | Dashboard UI, SSR |
| **State (client)** | Zustand | Lightweight, TypeScript-friendly |
| **Database** | PostgreSQL + Drizzle ORM | Relational data, type-safe queries |
| **Vector Store** | pgvector (or Pinecone) | Agent long-term memory, RAG |
| **Cache** | Redis | Session state, rate limiting, pub/sub |
| **Queue** | BullMQ (Redis-backed) | Task queue, job scheduling |
| **LLM** | Claude API (Anthropic SDK) | Primary AI backbone |
| **Testing** | Vitest + Playwright | Unit, integration, E2E |
| **Linting** | ESLint + Prettier + Biome | Code consistency |
| **CI/CD** | GitHub Actions | Automated pipelines |
| **Containers** | Docker + Docker Compose | Reproducible environments |

---

## 5. Development Phases & Model Optimization

Each phase specifies which Claude model to use based on task complexity, maximizing quality while optimizing token cost.

### Token Cost Reference

| Model | Strength | Best For |
|---|---|---|
| **Opus** | Deep reasoning, architecture, complex logic | Phase 1, critical algorithms, debugging hard issues |
| **Sonnet** | Strong balance of speed and quality | Phase 2-3, feature implementation, code review |
| **Haiku** | Fast, cost-effective | Phase 4+, repetitive tasks, boilerplate, tests, docs |

---

### Phase 1 — Foundation & Core Architecture
**Model: Opus**
**Why Opus:** This phase defines the entire system's architecture. Mistakes here cascade everywhere. Opus's deep reasoning ensures correct abstractions from the start.

- [ ] Initialize monorepo (Turborepo + pnpm)
- [ ] Set up TypeScript configs (strict mode, path aliases)
- [ ] Define domain entities: `Brain`, `Agent`, `Task`, `Memory`, `Event`
- [ ] Define all port interfaces (inbound use cases + outbound repositories)
- [ ] Implement core use cases: `CreateAgent`, `SubmitTask`, `OrchestrateTaskGraph`
- [ ] Design the event system (domain events + event bus interface)
- [ ] Set up error hierarchy (domain errors, application errors)
- [ ] Write Architecture Decision Records (ADRs) for key decisions
- [ ] Create `CLAUDE.md` with project conventions for all future development

**Deliverable:** Compilable `core` and `shared` packages with 100% typed domain model.

---

### Phase 2 — Agent Framework & Orchestration
**Model: Sonnet**
**Why Sonnet:** Implementation of well-defined interfaces from Phase 1. Requires good coding but the architecture decisions are already made.

- [ ] Implement `BaseAgent` class with lifecycle hooks (init, execute, cleanup)
- [ ] Build `OrchestratorAgent` — routes tasks, manages agent pool
- [ ] Build `PlannerAgent` — decomposes goals into TaskGraphs
- [ ] Build `ExecutorAgent` — executes individual tasks with tool access
- [ ] Build `ReviewerAgent` — validates outputs against acceptance criteria
- [ ] Implement agent-to-agent communication via event bus
- [ ] Add agent state machine (idle, planning, executing, reviewing, error)
- [ ] Unit tests for all agent logic

**Deliverable:** Working agent framework that can plan, execute, and review tasks.

---

### Phase 3 — Infrastructure & Integrations
**Model: Sonnet**
**Why Sonnet:** Adapter implementations follow established patterns. Needs quality but not deep architectural reasoning.

- [ ] Implement PostgreSQL repositories (Drizzle ORM)
- [ ] Set up database migrations
- [ ] Implement Redis cache adapter
- [ ] Build BullMQ task queue adapter
- [ ] Build Claude LLM adapter (Anthropic SDK)
- [ ] Implement vector store adapter for long-term memory (pgvector)
- [ ] Add tool framework (web search, code execution, file operations)
- [ ] Integration tests with test containers

**Deliverable:** Fully wired infrastructure layer connecting domain to external services.

---

### Phase 4 — API Layer
**Model: Sonnet (endpoints) / Haiku (boilerplate)**
**Why mixed:** Endpoint logic needs Sonnet-level quality. DTOs, validators, and middleware are repetitive — Haiku handles them efficiently.

- [ ] Set up Fastify server with plugin architecture
- [ ] **[Sonnet]** Implement REST endpoints: agents, tasks, brain status
- [ ] **[Sonnet]** Implement WebSocket handlers for real-time streaming
- [ ] **[Haiku]** Create DTOs and request/response schemas (Zod)
- [ ] **[Haiku]** Add middleware: auth (JWT), rate limiting, CORS, logging
- [ ] **[Haiku]** Generate OpenAPI documentation
- [ ] API integration tests

**Deliverable:** Production-ready API with real-time capabilities.

---

### Phase 5 — Dashboard UI
**Model: Sonnet (complex components) / Haiku (UI scaffolding)**
**Why mixed:** Interactive components (agent visualization, task graph) need Sonnet. Static pages and basic components are Haiku territory.

- [ ] Initialize Next.js 15 app with app router
- [ ] **[Sonnet]** Build real-time agent monitoring dashboard
- [ ] **[Sonnet]** Build interactive TaskGraph visualizer (DAG)
- [ ] **[Sonnet]** Implement task submission & management UI
- [ ] **[Haiku]** Create layout, navigation, and static pages
- [ ] **[Haiku]** Build basic CRUD components (agent list, task list)
- [ ] **[Haiku]** Style with Tailwind CSS + shadcn/ui components
- [ ] E2E tests with Playwright

**Deliverable:** Functional dashboard for monitoring and controlling the Brain.

---

### Phase 6 — Hardening & Production Readiness
**Model: Sonnet (security, observability) / Haiku (config, docs)**

- [ ] **[Sonnet]** Add comprehensive error handling and recovery
- [ ] **[Sonnet]** Implement observability (structured logging, metrics, tracing)
- [ ] **[Sonnet]** Security audit: input validation, rate limiting, auth hardening
- [ ] **[Haiku]** Docker + Docker Compose production setup
- [ ] **[Haiku]** CI/CD pipeline (GitHub Actions)
- [ ] **[Haiku]** Write deployment documentation
- [ ] Load testing and performance optimization

**Deliverable:** Production-deployable system with monitoring and CI/CD.

---

### Phase 7 — Advanced Features
**Model: Opus (novel algorithms) / Sonnet (implementation)**

- [ ] **[Opus]** Design & implement advanced task planning (multi-step reasoning, backtracking)
- [ ] **[Opus]** Design agent learning/adaptation system (feedback loops)
- [ ] **[Sonnet]** Implement multi-brain federation (Brain-to-Brain communication)
- [ ] **[Sonnet]** Add plugin system for custom agents and tools
- [ ] **[Sonnet]** Build agent marketplace/registry
- [ ] Performance optimization with Opus for complex bottleneck analysis

**Deliverable:** Advanced AI orchestration capabilities beyond basic task execution.

---

## 6. Token Optimization Strategy

### Development Workflow

```
┌─────────────────────────────────────────────────┐
│              TOKEN OPTIMIZATION FLOW             │
├─────────────────────────────────────────────────┤
│                                                   │
│   OPUS (Use sparingly, high impact)              │
│   ├── Architecture decisions                      │
│   ├── Complex algorithm design                    │
│   ├── Debugging hard/subtle issues                │
│   ├── Code review of critical paths               │
│   └── Novel feature design                        │
│                                                   │
│   SONNET (Primary workhorse)                     │
│   ├── Feature implementation                      │
│   ├── Non-trivial business logic                  │
│   ├── Integration work                            │
│   ├── Test writing for complex scenarios          │
│   └── Code review (standard)                      │
│                                                   │
│   HAIKU (Volume tasks, fast iteration)           │
│   ├── Boilerplate generation (DTOs, schemas)      │
│   ├── Simple CRUD implementations                 │
│   ├── Documentation writing                       │
│   ├── Config files and setup                      │
│   ├── Simple unit tests                           │
│   ├── Rename/refactor (mechanical changes)        │
│   └── Formatting and linting fixes                │
│                                                   │
└─────────────────────────────────────────────────┘
```

### Rules of Thumb

1. **Start with Haiku** — If the task is clearly simple, use Haiku first. Escalate only if quality is insufficient.
2. **Default to Sonnet** — When unsure, Sonnet is the safe middle ground.
3. **Reserve Opus for decisions that compound** — Architecture, core algorithms, and debugging mysterious failures.
4. **Never use Opus for boilerplate** — It's like hiring an architect to paint walls.
5. **Batch Haiku tasks** — Group similar repetitive tasks into single sessions for efficiency.

---

## 7. Additional Recommendations

### What Else This Project Needs

1. **CLAUDE.md** — A project-level instruction file that tells Claude Code the project conventions, coding standards, test commands, and architecture rules. This ensures every session (regardless of model) follows the same standards.

2. **Architecture Decision Records (ADRs)** — Document every significant technical decision (e.g., "Why Fastify over Express", "Why event-driven over request/response"). Stored in `docs/architecture/`.

3. **Contribution Guidelines** — Even for solo projects, define commit message format (Conventional Commits), branch naming, and PR templates.

4. **Error Taxonomy** — Define a clear hierarchy of error types early: `DomainError > AgentError > TaskError > ToolError`. This prevents ad-hoc error handling.

5. **Observability from Day 1** — Structured logging (pino), distributed tracing (OpenTelemetry), and metrics. Don't bolt these on later.

6. **Contract Testing** — Since agents communicate via events, use contract tests to ensure event schemas stay compatible as the system evolves.

7. **Feature Flags** — For a system this complex, use feature flags (e.g., LaunchDarkly or a simple config-based system) to safely roll out new agent capabilities.

8. **Seed Data & Dev Environment** — Scripts to bootstrap a local dev environment with sample agents, tasks, and memory data so any developer can start immediately.

9. **Rate Limiting & Cost Controls** — Since this orchestrates LLM calls, build in cost tracking and budget limits from the start to prevent runaway API costs.

10. **Security Model** — Define agent permissions (what tools each agent can access), API authentication (JWT + API keys), and data encryption strategy early.

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Task completion rate | > 90% of submitted tasks reach completion |
| Agent response latency (p95) | < 5 seconds for simple tasks |
| System uptime | 99.9% |
| Test coverage | > 80% across all packages |
| Build time | < 60 seconds (incremental) |
| Cost per task | Tracked and optimized per agent type |

---

*This is a living document. Update it as the project evolves.*
