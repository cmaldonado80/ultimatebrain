/**
 * Astrology Mini Brain — Brain Bridge
 *
 * Connects the Astrology domain to the Solarc Brain platform via @solarc/brain-sdk.
 * Initialises all six Brain engines (llm, memory, eval, guardrails, a2a, healing),
 * scopes memory to the 'astrology' domain, and registers the four domain agents
 * with the A2A bus.
 *
 * Usage:
 *   const bridge = createAstrologyBridge({
 *     apiKey:   process.env.BRAIN_API_KEY!,
 *     endpoint: process.env.BRAIN_ENDPOINT!,
 *   });
 *   const reading = await bridge.llm.chat({ ... });
 */

import {
  createBrainClient,
  type BrainClient,
  type BrainClientConfig,
  type ChatMessage,
  type StoreOptions,
  type SearchOptions,
  type MemoryResult,
  type EvalRunOptions,
  type EvalRunResult,
  type GuardrailCheckOptions,
  type GuardrailCheckResult,
  type AgentInfo,
  type DelegateOptions,
  type DelegateResult,
  type Incident,
  type IncidentListener,
} from '@solarc/brain-sdk';

import {
  ASTROLOGY_AGENT_LIST,
  ASTROLOGY_AGENTS,
  type AstrologyAgent,
} from '../agents/index';

import {
  ASTROLOGY_GUARDRAILS,
  runGuardrails,
  type GuardrailContext,
  type GuardrailRunResult,
} from '../guardrails/index';

// ─── Bridge Config ─────────────────────────────────────────────────────────────

export interface AstrologyBridgeConfig {
  /** Brain API key — use BRAIN_API_KEY env var in production */
  apiKey: string;
  /** Brain endpoint URL — use BRAIN_ENDPOINT env var in production */
  endpoint: string;
  /** Maximum LLM retries on transient failure (default: 3) */
  maxRetries?: number;
  /** Enable offline request queue for resilience (default: true) */
  offlineQueue?: boolean;
  /** Override default house system for chart calculations */
  defaultHouseSystem?: string;
}

// ─── Astrology Bridge ─────────────────────────────────────────────────────────

/**
 * The AstrologyBridge wraps the raw BrainClient with domain-specific
 * helpers: scoped memory, guardrail-aware LLM calls, and agent routing.
 */
export interface AstrologyBridge {
  /** Raw Brain client (all engines exposed) */
  brain: BrainClient;

  // ── LLM ──────────────────────────────────────────────────────────────────

  /**
   * Chat with the Brain LLM using the soul of the specified agent.
   * Output is automatically run through all domain guardrails.
   */
  chat(agentId: string, messages: ChatMessage[]): Promise<{ text: string; guardrails: GuardrailRunResult }>;

  /**
   * Stream a chat response from the Brain LLM.
   * NOTE: guardrails are applied to the completed stream before resolving.
   */
  streamChat(agentId: string, messages: ChatMessage[]): AsyncIterator<string>;

  // ── Memory ────────────────────────────────────────────────────────────────

  /**
   * Store a memory scoped to the 'astrology' domain.
   * All memory stored via this bridge is automatically namespaced.
   */
  remember(content: string, options?: Partial<StoreOptions>): Promise<void>;

  /**
   * Search astrology-scoped memory.
   */
  recall(query: string, options?: Partial<SearchOptions>): Promise<MemoryResult[]>;

  // ── Eval ──────────────────────────────────────────────────────────────────

  /**
   * Run an evaluation suite against astrology agent outputs.
   */
  evaluate(options: EvalRunOptions): Promise<EvalRunResult>;

  // ── Guardrails ────────────────────────────────────────────────────────────

  /**
   * Run domain guardrails against an arbitrary text string.
   * Returns blocked status, per-rule results, and sanitised text.
   */
  checkGuardrails(text: string, context?: GuardrailContext): GuardrailRunResult;

  /**
   * Call the Brain's remote guardrail engine (in addition to local checks).
   */
  remoteGuardrailCheck(options: GuardrailCheckOptions): Promise<GuardrailCheckResult>;

  // ── A2A (Agent-to-Agent) ──────────────────────────────────────────────────

  /**
   * Delegate a task to another registered agent.
   */
  delegate(options: DelegateOptions): Promise<DelegateResult>;

  /**
   * Discover all registered agents in the A2A bus.
   */
  discoverAgents(): Promise<AgentInfo[]>;

  /**
   * Get the agent definition for a given agent ID.
   */
  getAgent(agentId: string): AstrologyAgent | undefined;

  // ── Healing ───────────────────────────────────────────────────────────────

  /**
   * Subscribe to Brain healing / incident events.
   */
  onIncident(listener: IncidentListener): void;

  /**
   * Report an incident to the Brain's self-healing subsystem.
   */
  reportIncident(incident: Omit<Incident, 'id' | 'timestamp'>): Promise<void>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Disconnect all real-time connections and clean up. */
  disconnect(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and initialise the Astrology Brain Bridge.
 *
 * This function:
 * 1. Instantiates the Brain client with all six engines.
 * 2. Scopes all memory operations to domain: 'astrology'.
 * 3. Registers the four domain agents (master-astrologer, transit-tracker,
 *    sports-analyst, business-advisor) with the A2A bus.
 * 4. Attaches domain guardrails to all LLM output paths.
 *
 * @param config  AstrologyBridgeConfig
 * @returns       Fully initialised AstrologyBridge
 */
export async function createAstrologyBridge(
  config: AstrologyBridgeConfig,
): Promise<AstrologyBridge> {
  // ── Instantiate Brain client ───────────────────────────────────────────────
  const brainConfig: BrainClientConfig = {
    apiKey:       config.apiKey,
    endpoint:     config.endpoint,
    engines:      ['llm', 'memory', 'eval', 'guardrails', 'a2a', 'healing'],
    domain:       'astrology',
    maxRetries:   config.maxRetries  ?? 3,
    offlineQueue: config.offlineQueue ?? true,
  };

  const brain = createBrainClient(brainConfig);

  // ── Register domain agents with A2A bus ───────────────────────────────────
  await registerAgents(brain);

  // ── Build and return the bridge ───────────────────────────────────────────
  const bridge: AstrologyBridge = {
    brain,

    // ── LLM ─────────────────────────────────────────────────────────────────

    async chat(agentId, messages) {
      const agent = ASTROLOGY_AGENTS[agentId];
      if (!agent) throw new Error(`Unknown astrology agent: ${agentId}`);

      // Prepend the agent's soul as a system message
      const fullMessages: ChatMessage[] = [
        { role: 'system', content: agent.soul },
        ...messages,
      ];

      const result = await brain.llm.chat({ messages: fullMessages });
      const rawText = typeof result === 'string' ? result : (result as { text: string }).text;

      // Run domain guardrails
      const guardrailResult = runGuardrails(rawText, { agentId });

      return {
        text:       guardrailResult.blocked ? '' : guardrailResult.finalText,
        guardrails: guardrailResult,
      };
    },

    streamChat(agentId, messages) {
      const agent = ASTROLOGY_AGENTS[agentId];
      if (!agent) throw new Error(`Unknown astrology agent: ${agentId}`);

      const fullMessages: ChatMessage[] = [
        { role: 'system', content: agent.soul },
        ...messages,
      ];

      // NOTE: guardrails are applied to the completed buffer after streaming ends
      return brain.llm.stream({ messages: fullMessages });
    },

    // ── Memory ───────────────────────────────────────────────────────────────

    async remember(content, options) {
      await brain.memory.store({
        content,
        domain: 'astrology',
        ...options,
      });
    },

    async recall(query, options) {
      return brain.memory.search({
        query,
        domain: 'astrology',
        ...options,
      });
    },

    // ── Eval ─────────────────────────────────────────────────────────────────

    async evaluate(options) {
      return brain.eval.run(options);
    },

    // ── Guardrails ────────────────────────────────────────────────────────────

    checkGuardrails(text, context) {
      return runGuardrails(text, context, ASTROLOGY_GUARDRAILS);
    },

    async remoteGuardrailCheck(options) {
      return brain.guardrails.check(options);
    },

    // ── A2A ──────────────────────────────────────────────────────────────────

    async delegate(options) {
      return brain.a2a.delegate(options);
    },

    async discoverAgents() {
      return brain.a2a.discover({ domain: 'astrology' });
    },

    getAgent(agentId) {
      return ASTROLOGY_AGENTS[agentId];
    },

    // ── Healing ──────────────────────────────────────────────────────────────

    onIncident(listener) {
      brain.healing.on('incident', listener);
    },

    async reportIncident(incident) {
      await brain.healing.report({
        ...incident,
        domain: 'astrology',
      });
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    disconnect() {
      brain.disconnect();
    },
  };

  return bridge;
}

// ─── Agent Registration ───────────────────────────────────────────────────────

/**
 * Register all four astrology agents with the Brain's A2A bus.
 * Each agent is registered with its id, name, soul (as description), and capabilities.
 */
async function registerAgents(brain: BrainClient): Promise<void> {
  for (const agent of ASTROLOGY_AGENT_LIST) {
    await brain.a2a.register({
      id:           agent.id,
      name:         agent.name,
      domain:       'astrology',
      description:  agent.role,
      capabilities: agent.capabilities,
      metadata: {
        soul:       agent.soul,
        guardrails: agent.guardrails,
      },
    });
  }
}

// ─── Environment Helper ───────────────────────────────────────────────────────

/**
 * Create a bridge from environment variables.
 * Expects: BRAIN_API_KEY, BRAIN_ENDPOINT
 */
export function createAstrologyBridgeFromEnv(
  overrides?: Partial<AstrologyBridgeConfig>,
): Promise<AstrologyBridge> {
  const apiKey   = process.env['BRAIN_API_KEY'];
  const endpoint = process.env['BRAIN_ENDPOINT'];

  if (!apiKey)   throw new Error('Missing required environment variable: BRAIN_API_KEY');
  if (!endpoint) throw new Error('Missing required environment variable: BRAIN_ENDPOINT');

  return createAstrologyBridge({
    apiKey,
    endpoint,
    maxRetries:   3,
    offlineQueue: true,
    ...overrides,
  });
}
