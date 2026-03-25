/**
 * Engine Registry
 *
 * Central registry of all Brain engines:
 * - Health status per engine
 * - Connected apps per engine
 * - Usage metrics per engine per app
 * - Rate limits per app per engine
 */

export type EngineId =
  | 'llm'
  | 'memory'
  | 'eval'
  | 'guardrails'
  | 'a2a'
  | 'healing'
  | 'orchestration'
  | 'gateway'
  | 'mcp'
  | 'playbooks'
  | 'visual-qa'
  | 'presence'
  | 'adaptive'
  | 'skills'

export type EngineStatus = 'healthy' | 'degraded' | 'down' | 'unknown'
export type EngineCategory = 'system' | 'domain' | 'custom'

export interface EngineEntry {
  id: string
  name: string
  description: string
  status: EngineStatus
  category: EngineCategory
  domain?: string
  /** Connected app/mini-brain IDs */
  connectedApps: string[]
  requestRate: number
  totalRequests: number
  errorRate: number
  avgResponseMs: number
  lastHealthCheck: Date
}

export interface AppUsage {
  appId: string
  appName: string
  engineId: EngineId
  requestCount: number
  errorCount: number
  avgResponseMs: number
  /** Rate limit (requests per minute) */
  rateLimit: number
  /** Current usage against rate limit (0-1) */
  rateLimitUsage: number
}

export interface RateLimitConfig {
  appId: string
  engineId: EngineId
  requestsPerMinute: number
}

// ── Registry ────────────────────────────────────────────────────────────

const ENGINE_DEFINITIONS: Omit<
  EngineEntry,
  | 'connectedApps'
  | 'requestRate'
  | 'totalRequests'
  | 'errorRate'
  | 'avgResponseMs'
  | 'lastHealthCheck'
>[] = [
  // System engines
  {
    id: 'llm',
    name: 'LLM Gateway',
    description: 'Multi-provider LLM routing with fallback',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Three-tier memory (working/episodic/archival)',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'eval',
    name: 'Evaluations',
    description: 'LLM-as-judge agent evaluation framework',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'guardrails',
    name: 'Guardrails',
    description: 'Input/output safety validation',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'a2a',
    name: 'A2A Protocol',
    description: 'Agent-to-agent discovery and delegation',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'healing',
    name: 'Self-Healing',
    description: 'Anomaly detection and auto-remediation',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'orchestration',
    name: 'Orchestration',
    description: 'Multi-agent workflow execution',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'gateway',
    name: 'API Gateway',
    description: 'Provider routing and cost tracking',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'mcp',
    name: 'MCP',
    description: 'Bidirectional Model Context Protocol',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'playbooks',
    name: 'Playbooks',
    description: 'Teach & Repeat automation',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'visual-qa',
    name: 'Visual QA',
    description: 'Browser automation recording and review',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'presence',
    name: 'Presence',
    description: 'Multiplayer user and agent tracking',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'adaptive',
    name: 'Adaptive Layout',
    description: 'Behavior-driven dashboard personalization',
    status: 'healthy',
    category: 'system',
  },
  {
    id: 'skills',
    name: 'Skills',
    description: 'Skill marketplace and sandbox execution',
    status: 'healthy',
    category: 'system',
  },
  // Domain engines — Astrology
  {
    id: 'swiss-ephemeris',
    name: 'Swiss Ephemeris',
    description: 'Planetary positions, house cusps, aspect calculations, transit tracking',
    status: 'healthy',
    category: 'domain',
    domain: 'Astrology',
  },
  {
    id: 'chart-calculator',
    name: 'Chart Calculator',
    description: 'Natal chart generation and interpretation',
    status: 'healthy',
    category: 'domain',
    domain: 'Astrology',
  },
  {
    id: 'transit-engine',
    name: 'Transit Engine',
    description: 'Real-time transit monitoring and alerts',
    status: 'healthy',
    category: 'domain',
    domain: 'Astrology',
  },
  // Domain engines — Hospitality
  {
    id: 'pms-integration',
    name: 'PMS Integration',
    description: 'Property Management System data sync',
    status: 'healthy',
    category: 'domain',
    domain: 'Hotels',
  },
  {
    id: 'revenue-mgmt',
    name: 'Revenue Management',
    description: 'Dynamic pricing and demand forecasting',
    status: 'healthy',
    category: 'domain',
    domain: 'Hotels',
  },
  {
    id: 'guest-profile',
    name: 'Guest Profile',
    description: 'Guest preference and loyalty tracking',
    status: 'healthy',
    category: 'domain',
    domain: 'Hotels',
  },
  // Domain engines — Healthcare
  {
    id: 'hipaa-checker',
    name: 'HIPAA Checker',
    description: 'Regulatory compliance validation',
    status: 'healthy',
    category: 'domain',
    domain: 'Medical',
  },
  {
    id: 'clinical-protocol',
    name: 'Clinical Protocol',
    description: 'Protocol review and trial design',
    status: 'healthy',
    category: 'domain',
    domain: 'Medical',
  },
  // Domain engines — Legal
  {
    id: 'case-law-search',
    name: 'Case Law Search',
    description: 'Legal precedent and case research',
    status: 'healthy',
    category: 'domain',
    domain: 'Legal',
  },
  {
    id: 'contract-parser',
    name: 'Contract Parser',
    description: 'Contract analysis and clause extraction',
    status: 'healthy',
    category: 'domain',
    domain: 'Legal',
  },
  // Domain engines — Marketing
  {
    id: 'campaign-engine',
    name: 'Campaign Engine',
    description: 'Marketing campaign orchestration',
    status: 'healthy',
    category: 'domain',
    domain: 'Marketing',
  },
  // Domain engines — SOC-Ops
  {
    id: 'threat-intel',
    name: 'Threat Intel',
    description: 'Threat intelligence feeds and correlation',
    status: 'healthy',
    category: 'domain',
    domain: 'Security',
  },
  {
    id: 'siem-connector',
    name: 'SIEM Connector',
    description: 'Security event ingestion and alerting',
    status: 'healthy',
    category: 'domain',
    domain: 'Security',
  },
]

export class EngineRegistry {
  private engines = new Map<string, EngineEntry>()
  private appUsage = new Map<string, AppUsage>() // key: `${appId}:${engineId}`
  private rateLimits = new Map<string, RateLimitConfig>()

  constructor() {
    for (const def of ENGINE_DEFINITIONS) {
      this.engines.set(def.id, {
        ...def,
        connectedApps: [],
        requestRate: 0,
        totalRequests: 0,
        errorRate: 0,
        avgResponseMs: 0,
        lastHealthCheck: new Date(),
      })
    }
  }

  // ── Engine Status ─────────────────────────────────────────────────────

  /** List all engines */
  listEngines(): EngineEntry[] {
    return Array.from(this.engines.values())
  }

  /** Get a single engine */
  getEngine(id: EngineId): EngineEntry | null {
    return this.engines.get(id) ?? null
  }

  /** Update engine health status */
  updateStatus(id: EngineId, status: EngineStatus): void {
    const engine = this.engines.get(id)
    if (engine) {
      engine.status = status
      engine.lastHealthCheck = new Date()
    }
  }

  // ── App Connection ────────────────────────────────────────────────────

  /** Register an app's connection to an engine */
  connectApp(appId: string, appName: string, engineId: EngineId): void {
    const engine = this.engines.get(engineId)
    if (engine && !engine.connectedApps.includes(appId)) {
      engine.connectedApps.push(appId)
    }

    const key = `${appId}:${engineId}`
    if (!this.appUsage.has(key)) {
      this.appUsage.set(key, {
        appId,
        appName,
        engineId,
        requestCount: 0,
        errorCount: 0,
        avgResponseMs: 0,
        rateLimit: 1000, // default
        rateLimitUsage: 0,
      })
    }
  }

  /** Disconnect an app from an engine */
  disconnectApp(appId: string, engineId: EngineId): void {
    const engine = this.engines.get(engineId)
    if (engine) {
      engine.connectedApps = engine.connectedApps.filter((a) => a !== appId)
    }
    this.appUsage.delete(`${appId}:${engineId}`)
  }

  // ── Usage Tracking ────────────────────────────────────────────────────

  /** Record a request from an app to an engine */
  recordRequest(appId: string, engineId: EngineId, responseMs: number, isError: boolean): void {
    const engine = this.engines.get(engineId)
    if (engine) {
      engine.totalRequests++
      engine.requestRate++ // simplified; real impl uses sliding window
      // EWMA with decay: blend toward zero when idle, blend toward sample when active
      const alpha = 0.05
      engine.avgResponseMs =
        engine.totalRequests === 1
          ? responseMs
          : engine.avgResponseMs * (1 - alpha) + responseMs * alpha
      if (isError) engine.errorRate = Math.min(engine.errorRate + 0.01, 1)
      else engine.errorRate = Math.max(engine.errorRate * (1 - alpha), 0)
    }

    const key = `${appId}:${engineId}`
    const usage = this.appUsage.get(key)
    if (usage) {
      usage.requestCount++
      if (isError) usage.errorCount++
      usage.avgResponseMs = usage.avgResponseMs * 0.95 + responseMs * 0.05
      usage.rateLimitUsage = usage.requestCount / usage.rateLimit // simplified
    }
  }

  /** Get usage for an app across all engines */
  getAppUsage(appId: string): AppUsage[] {
    return Array.from(this.appUsage.values()).filter((u) => u.appId === appId)
  }

  /** Get usage for an engine across all apps */
  getEngineUsage(engineId: EngineId): AppUsage[] {
    return Array.from(this.appUsage.values()).filter((u) => u.engineId === engineId)
  }

  // ── Rate Limits ───────────────────────────────────────────────────────

  /** Set rate limit for an app on an engine */
  setRateLimit(appId: string, engineId: EngineId, requestsPerMinute: number): void {
    const key = `${appId}:${engineId}`
    this.rateLimits.set(key, { appId, engineId, requestsPerMinute })
    const usage = this.appUsage.get(key)
    if (usage) usage.rateLimit = requestsPerMinute
  }

  /** Check if a request would exceed the rate limit */
  checkRateLimit(appId: string, engineId: EngineId): { allowed: boolean; remaining: number } {
    const key = `${appId}:${engineId}`
    const usage = this.appUsage.get(key)
    if (!usage) return { allowed: true, remaining: 1000 }
    const remaining = Math.max(0, usage.rateLimit - usage.requestCount)
    return { allowed: remaining > 0, remaining }
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  getStats(): {
    totalEngines: number
    healthyEngines: number
    totalApps: number
    totalRequests: number
  } {
    const engines = this.listEngines()
    const apps = new Set<string>()
    for (const e of engines) for (const a of e.connectedApps) apps.add(a)

    return {
      totalEngines: engines.length,
      healthyEngines: engines.filter((e) => e.status === 'healthy').length,
      totalApps: apps.size,
      totalRequests: engines.reduce((sum, e) => sum + e.totalRequests, 0),
    }
  }

  /** Register a custom engine */
  registerCustomEngine(input: {
    id: string
    name: string
    description: string
    domain?: string
  }): EngineEntry {
    const entry: EngineEntry = {
      id: input.id,
      name: input.name,
      description: input.description,
      status: 'unknown',
      category: 'custom',
      domain: input.domain,
      connectedApps: [],
      requestRate: 0,
      totalRequests: 0,
      errorRate: 0,
      avgResponseMs: 0,
      lastHealthCheck: new Date(),
    }
    this.engines.set(input.id, entry)
    return entry
  }

  /** List engines by category */
  listByCategory(category: EngineCategory): EngineEntry[] {
    return this.listEngines().filter((e) => e.category === category)
  }

  /** List engines by domain */
  listByDomain(domain: string): EngineEntry[] {
    return this.listEngines().filter((e) => e.domain === domain)
  }
}
