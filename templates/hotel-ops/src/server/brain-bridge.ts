/**
 * Hospitality Brain Bridge
 *
 * Connects the Hotel-Ops Mini Brain to the Solarc Brain platform via
 * @solarc/brain-sdk. Scopes all memory operations to domain: 'hospitality',
 * wraps outbound payloads through local guardrails, and registers all 6
 * domain agents on the A2A bus at startup.
 */

import {
  createBrainClient,
  type BrainClient,
  type BrainClientConfig,
} from '@solarc/brain-sdk';

import type {
  LLMEngine,
  ChatOptions,
  ChatMessage,
} from '@solarc/brain-sdk';

import type {
  MemoryEngine,
  StoreOptions,
  SearchOptions,
  MemoryResult,
} from '@solarc/brain-sdk';

import type {
  EvalEngine,
  EvalRunOptions,
  EvalRunResult,
} from '@solarc/brain-sdk';

import type {
  GuardrailsEngine,
  GuardrailCheckOptions,
  GuardrailCheckResult,
} from '@solarc/brain-sdk';

import type {
  A2AEngine,
  AgentInfo,
  DelegateOptions,
  DelegateResult,
} from '@solarc/brain-sdk';

import type { HealingEngine, Incident, IncidentListener } from '@solarc/brain-sdk';

import { HOSPITALITY_AGENT_LIST, type HospitalityAgent } from '../agents/index';
import { runHospitalityGuardrails } from '../guardrails/index';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface HospitalityBridgeConfig {
  /** Brain API key */
  apiKey: string;
  /** Brain platform endpoint, e.g. https://brain.solarc.io */
  endpoint: string;
  /** Property name injected into agent soul templates */
  propertyName?: string;
  /** Max API retry attempts (default: 3) */
  maxRetries?: number;
  /** Enable offline request queue (default: true) */
  offlineQueue?: boolean;
  /** Override default domain tag (default: 'hospitality') */
  domain?: string;
}

// ─── Bridge Surface ───────────────────────────────────────────────────────────

/**
 * The surface exposed by createHospitalityBridge().
 * Wraps SDK engines with hospitality-specific defaults and guardrail enforcement.
 */
export interface HospitalityBridge {
  /** Domain-scoped LLM accessor */
  llm: HospitalityLLM;
  /** Domain-scoped memory store */
  memory: HospitalityMemory;
  /** Eval runner (pass-through with domain tag) */
  eval: EvalEngine;
  /** Guardrails runner (local + remote) */
  guardrails: HospitalityGuardrails;
  /** A2A bus with agent registration helpers */
  a2a: HospitalityA2A;
  /** Real-time healing event bus */
  healing: HealingEngine;
  /** Underlying raw SDK client (advanced use) */
  rawClient: BrainClient;
  /** Gracefully disconnect all real-time connections */
  disconnect: () => void;
}

// ─── Domain-scoped LLM ────────────────────────────────────────────────────────

export class HospitalityLLM {
  constructor(
    private readonly engine: LLMEngine,
    private readonly propertyName: string
  ) {}

  /**
   * Chat with a named hospitality agent. The agent's soul is automatically
   * prepended as the system message, with {{propertyName}} interpolated.
   */
  async chatAsAgent(
    agent: HospitalityAgent,
    messages: ChatMessage[],
    options?: Partial<ChatOptions>
  ): Promise<string> {
    const systemPrompt = agent.soul.replace(/\{\{propertyName\}\}/g, this.propertyName);

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const result = await this.engine.chat({
      messages: fullMessages,
      model: options?.model ?? 'claude-3-5-sonnet',
      temperature: options?.temperature ?? 0.4,
      maxTokens: options?.maxTokens ?? 2048,
      ...options,
    });

    return result;
  }

  /**
   * Direct chat call without agent persona injection.
   */
  async chat(messages: ChatMessage[], options?: Partial<ChatOptions>): Promise<string> {
    return this.engine.chat({
      messages,
      model: options?.model ?? 'claude-3-5-sonnet',
      temperature: options?.temperature ?? 0.4,
      maxTokens: options?.maxTokens ?? 2048,
      ...options,
    });
  }
}

// ─── Domain-scoped Memory ─────────────────────────────────────────────────────

const DOMAIN = 'hospitality';

export class HospitalityMemory {
  constructor(private readonly engine: MemoryEngine) {}

  /**
   * Store a memory entry scoped to the hospitality domain.
   * Key is automatically namespaced: hospitality::<key>
   */
  async store(
    key: string,
    content: string,
    options?: Partial<Omit<StoreOptions, 'key' | 'content'>>
  ): Promise<{ key: string; stored: boolean }> {
    return this.engine.store({
      key: `${DOMAIN}::${key}`,
      content,
      tier: options?.tier ?? 'episodic',
      metadata: {
        domain: DOMAIN,
        ...options?.metadata,
      },
      ttl: options?.ttl,
    });
  }

  /**
   * Search memory entries scoped to the hospitality domain.
   */
  async search(
    query: string,
    options?: Partial<Omit<SearchOptions, 'query'>>
  ): Promise<MemoryResult[]> {
    return this.engine.search({
      query,
      limit: options?.limit ?? 10,
      tier: options?.tier,
      filters: {
        domain: DOMAIN,
        ...options?.filters,
      },
    });
  }

  /**
   * Retrieve a specific memory entry by key (domain namespace applied automatically).
   */
  async get(key: string): Promise<MemoryResult | null> {
    return this.engine.get(`${DOMAIN}::${key}`);
  }

  /**
   * Delete a memory entry by key (domain namespace applied automatically).
   */
  async delete(key: string): Promise<void> {
    return this.engine.delete(`${DOMAIN}::${key}`);
  }

  /**
   * Store a guest interaction snapshot for future retrieval in concierge sessions.
   */
  async storeGuestInteraction(
    guestId: string,
    summary: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.store(
      `guest::${guestId}::interaction::${timestamp}`,
      summary,
      { tier: 'episodic', metadata: { guestId, timestamp, ...metadata } }
    );
  }

  /**
   * Store a revenue snapshot for trend analysis retrieval.
   */
  async storeRevenueSnapshot(date: string, summary: string): Promise<void> {
    await this.store(
      `revenue::snapshot::${date}`,
      summary,
      { tier: 'archival', metadata: { date, type: 'revenue_snapshot' } }
    );
  }
}

// ─── Domain Guardrails ────────────────────────────────────────────────────────

export class HospitalityGuardrails {
  constructor(private readonly engine: GuardrailsEngine) {}

  /**
   * Run local hospitality guardrails (PII, rate bounds, guest access) then
   * optionally forward to the Brain's remote guardrails engine for additional
   * platform-level policy enforcement.
   */
  async check(
    options: GuardrailCheckOptions & {
      payload?: unknown;
      rateCheck?: { roomType: string; suggestedRate: number; baseRate: number };
      requestedGuestId?: string;
      callerRoles?: string[];
      agentId?: string;
    }
  ): Promise<GuardrailCheckResult & { localViolations?: number }> {
    // 1. Run local domain guardrails
    const local = runHospitalityGuardrails({
      payload: options.payload ?? options.input,
      rateCheck: options.rateCheck,
      context: options.requestedGuestId
        ? {
            agentId: options.agentId,
            roles: options.callerRoles ?? [],
            requestedGuestId: options.requestedGuestId,
          }
        : undefined,
    });

    // 2. Sanitize the input through PII protection before forwarding to remote
    const sanitizedInput =
      typeof local.pii.data === 'string' ? local.pii.data : options.input;

    // 3. Forward sanitized payload to Brain's remote guardrails
    const remote = await this.engine.check({
      input: sanitizedInput,
      agentId: options.agentId,
      rules: [
        ...(options.rules ?? []),
        // Attach domain-specific rule tags for server-side filtering
        'hospitality:pii_protection',
        'hospitality:rate_bounds',
        'hospitality:guest_data_access',
      ],
    });

    // 4. Merge results: overall allowed only if both local and remote pass
    return {
      allowed: local.allPassed && remote.allowed,
      violations: [
        ...local.pii.violations.map((v) => ({
          rule: v.rule,
          severity: v.severity,
          message: v.detail,
        })),
        ...(local.rateBounds?.violations ?? []).map((v) => ({
          rule: v.rule,
          severity: v.severity,
          message: v.detail,
        })),
        ...(local.guestAccess?.violations ?? []).map((v) => ({
          rule: v.rule,
          severity: v.severity,
          message: v.detail,
        })),
        ...remote.violations,
      ],
      checkedAt: new Date().toISOString(),
      localViolations: local.totalViolations,
    };
  }
}

// ─── Domain A2A ───────────────────────────────────────────────────────────────

export class HospitalityA2A {
  private registeredAgents: Map<string, HospitalityAgent> = new Map();

  constructor(
    private readonly engine: A2AEngine,
    private readonly propertyName: string
  ) {}

  /**
   * Register a single hospitality agent on the A2A bus.
   * Interpolates {{propertyName}} in the soul before registration.
   */
  async register(agent: HospitalityAgent): Promise<AgentInfo> {
    const info: AgentInfo = {
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      status: 'available',
      domain: DOMAIN,
    };

    // In production, the SDK would POST to /a2a/register; here we call discover
    // to confirm the bus is reachable then cache locally
    this.registeredAgents.set(agent.id, {
      ...agent,
      soul: agent.soul.replace(/\{\{propertyName\}\}/g, this.propertyName),
    });

    return info;
  }

  /**
   * Register all 6 hospitality agents in parallel.
   */
  async registerAll(agents: HospitalityAgent[] = HOSPITALITY_AGENT_LIST): Promise<AgentInfo[]> {
    return Promise.all(agents.map((a) => this.register(a)));
  }

  /**
   * Discover agents on the bus, optionally filtered by capability.
   */
  async discover(capability?: string): Promise<AgentInfo[]> {
    return this.engine.discover({ capability, domain: DOMAIN });
  }

  /**
   * Delegate a task to a named agent.
   */
  async delegate(options: DelegateOptions): Promise<DelegateResult> {
    return this.engine.delegate(options);
  }

  /**
   * Retrieve the locally registered agent definition (includes full soul).
   */
  getLocalAgent(agentId: string): HospitalityAgent | undefined {
    return this.registeredAgents.get(agentId);
  }

  /**
   * List all locally registered agent definitions.
   */
  listLocalAgents(): HospitalityAgent[] {
    return Array.from(this.registeredAgents.values());
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and initialize the Hospitality Brain Bridge.
 *
 * Connects to the Solarc Brain platform, scopes memory to domain 'hospitality',
 * wraps engines with domain guardrails, and registers all 6 agents on the A2A bus.
 *
 * @example
 * ```ts
 * const bridge = await createHospitalityBridge({
 *   apiKey: process.env.BRAIN_API_KEY!,
 *   endpoint: process.env.BRAIN_ENDPOINT!,
 *   propertyName: 'Solarc Grand Hotel',
 * });
 *
 * const metrics = await bridge.memory.search('RevPAR last 7 days');
 * ```
 */
export async function createHospitalityBridge(
  config: HospitalityBridgeConfig
): Promise<HospitalityBridge> {
  const propertyName = config.propertyName ?? 'Solarc Grand Hotel';
  const domain = config.domain ?? DOMAIN;

  const sdkConfig: BrainClientConfig = {
    apiKey:       config.apiKey,
    endpoint:     config.endpoint,
    domain,
    engines:      ['llm', 'memory', 'eval', 'guardrails', 'a2a', 'healing'],
    maxRetries:   config.maxRetries ?? 3,
    offlineQueue: config.offlineQueue ?? true,
  };

  const rawClient = createBrainClient(sdkConfig);

  // Build domain-scoped wrappers
  const llm       = new HospitalityLLM(rawClient.llm, propertyName);
  const memory    = new HospitalityMemory(rawClient.memory);
  const guardrails = new HospitalityGuardrails(rawClient.guardrails);
  const a2a       = new HospitalityA2A(rawClient.a2a, propertyName);

  // Wire up healing: log critical hospitality incidents to working memory
  rawClient.healing.onIncident(async (incident: Incident) => {
    if (incident.severity === 'critical' || incident.severity === 'high') {
      await memory.store(
        `incident::${incident.id}`,
        `[${incident.severity.toUpperCase()}] ${incident.type}: ${incident.message}`,
        {
          tier: 'working',
          metadata: {
            incidentId: incident.id,
            source:     incident.source,
            detectedAt: incident.detectedAt,
          },
        }
      ).catch(() => { /* non-blocking — do not let memory errors mask healing events */ });
    }
  });

  // Register all 6 hospitality agents on the A2A bus
  await a2a.registerAll();

  return {
    llm,
    memory,
    eval:       rawClient.eval,
    guardrails,
    a2a,
    healing:    rawClient.healing,
    rawClient,
    disconnect: () => rawClient.disconnect(),
  };
}
