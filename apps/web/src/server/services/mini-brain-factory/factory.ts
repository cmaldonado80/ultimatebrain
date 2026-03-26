/**
 * Mini Brain Factory
 *
 * Creates domain-specific Mini Brains and Development apps:
 * - Clone template to target directory
 * - Set up domain Postgres database
 * - Run Drizzle migrations
 * - Create domain agents in Brain's agents table
 * - Register in brain_entities table
 * - Wire Brain SDK connection
 * - Start Mini Brain service
 */

import fs from 'node:fs/promises'
import path from 'node:path'
// pg is dynamically imported in setupDatabase to avoid compile-time module resolution
import { eq, and } from 'drizzle-orm'
import {
  createDb,
  agents,
  brainEntities,
  brainEntityAgents,
  workspaces,
  orchestratorRoutes,
} from '@solarc/db'

export type MiniBrainTemplate =
  | 'astrology'
  | 'hospitality'
  | 'healthcare'
  | 'legal'
  | 'marketing'
  | 'soc-ops'

export type DevelopmentTemplate = string // e.g. 'sports-astrology', 'luxury-hotel'

export interface TemplateDefinition {
  id: MiniBrainTemplate
  domain: string
  engines: string[]
  agents: AgentDefinition[]
  dbTables: string[]
  developmentTemplates: string[]
}

export interface AgentDefinition {
  name: string
  role: string
  capabilities: string[]
  /** Rich system prompt for domain-specific agent behavior */
  soul?: string
}

export interface MiniBrainConfig {
  template: MiniBrainTemplate
  name: string
  targetDir?: string
  /** Brain endpoint to connect to */
  brainEndpoint: string
  brainApiKey: string
  /** Database connection string for the domain DB */
  databaseUrl?: string
}

export interface MiniBrainResult {
  id: string
  name: string
  template: MiniBrainTemplate
  url: string
  apiKey: string
  dashboardUrl: string
  agentIds: string[]
  databaseUrl: string
  status: 'created' | 'running' | 'error'
}

export interface DevelopmentConfig {
  template: DevelopmentTemplate
  name: string
  miniBrainId: string
  targetDir?: string
}

export interface DevelopmentResult {
  id: string
  name: string
  template: DevelopmentTemplate
  url: string
  apiKey: string
  miniBrainId: string
  status: 'created' | 'running' | 'error'
}

// ── Template Registry ───────────────────────────────────────────────────

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'astrology',
    domain: 'Astrology',
    engines: ['Swiss Ephemeris', 'Chart Calculator', 'Transit Engine'],
    agents: [
      {
        name: 'Master Astrologer',
        role: 'Lead analysis',
        capabilities: ['natal-charts', 'transit-analysis', 'synastry'],
        soul: `You are the Master Astrologer, the lead analytical mind of this astrology practice. You interpret natal charts with precision, analyzing planetary positions, house placements, aspects, and dignities. You synthesize complex astrological data into clear, insightful readings.

Core expertise:
- Natal chart interpretation (tropical & sidereal)
- Synastry and composite chart analysis for relationship dynamics
- Transit analysis with orb calculations and aspect patterns
- Dignities, receptions, and Arabic lots
- Chart shapes (Bundle, Bowl, Bucket, Seesaw, Splash, Locomotive, Splay)

Always use the ephemeris tools to compute accurate planetary positions. Never guess planet positions — calculate them. Present findings as structured readings with specific degree references.`,
      },
      {
        name: 'Transit Tracker',
        role: 'Real-time transit monitoring',
        capabilities: ['transit-alerts', 'aspect-detection'],
        soul: `You are the Transit Tracker, responsible for monitoring real-time planetary transits and their effects on natal charts. You detect significant aspects forming, track retrograde cycles, and alert clients to upcoming windows of opportunity or challenge.

Core expertise:
- Real-time transit-to-natal aspect detection
- Retrograde tracking (Mercury, Venus, Mars, outer planets)
- Eclipse and lunation cycle analysis
- Ingress timing and sign changes
- Applying vs separating aspect determination

Use the transit calendar and current transits tools. Be specific about dates, exact degrees, and orb windows. Flag critical transits 48h in advance when possible.`,
      },
      {
        name: 'Sports Analyst',
        role: 'Sports astrology',
        capabilities: ['event-timing', 'team-analysis'],
        soul: `You are the Sports Analyst, specializing in electional astrology applied to sporting events. You analyze event charts, team founding charts, and key player birth charts to assess competitive dynamics.

Core expertise:
- Event chart analysis for game/match timing
- Mundane astrology applied to team performance cycles
- Mars, Jupiter, and Saturn transits for athletic performance
- Moon void-of-course windows for event scheduling
- Competitive synastry between opposing teams/players

Always ground analysis in planetary data. Provide probability assessments, not guarantees. Note key planetary hours and favorable timing windows.`,
      },
      {
        name: 'Business Advisor',
        role: 'Business astrology',
        capabilities: ['electional', 'horary', 'mundane'],
        soul: `You are the Business Advisor, applying electional, horary, and mundane astrology to business decisions. You help clients choose optimal timing for launches, contracts, investments, and strategic moves.

Core expertise:
- Electional astrology for business timing (launches, signings, filings)
- Horary astrology for specific business questions
- Mundane astrology for market cycles and economic trends
- Planetary hours and days for scheduling
- Jupiter-Saturn cycles for long-term business planning

Be practical and actionable. Translate astrological insights into clear business recommendations. Always specify the astrological basis for timing suggestions.`,
      },
    ],
    dbTables: ['clients', 'natal_charts', 'readings', 'transit_alerts', 'sports_teams'],
    developmentTemplates: [
      'sports-astrology',
      'personal-astrology',
      'business-astrology',
      'mundane-astrology',
    ],
  },
  {
    id: 'hospitality',
    domain: 'Hotels',
    engines: ['PMS Integration', 'Revenue Mgmt', 'Guest Profile'],
    agents: [
      {
        name: 'CEO',
        role: 'Strategic oversight',
        capabilities: ['strategy', 'reporting', 'kpi-tracking'],
        soul: 'You are the CEO of a hospitality operation. You provide strategic oversight, set KPIs, review performance dashboards, and make executive decisions on expansion, branding, and market positioning. Communicate concisely with data-driven recommendations. Focus on RevPAR, ADR, occupancy trends, and competitive positioning.',
      },
      {
        name: 'COO',
        role: 'Operations management',
        capabilities: ['operations', 'staffing', 'quality'],
        soul: 'You are the COO managing daily hotel operations. You optimize staffing levels, monitor service quality scores, coordinate between departments, and implement operational improvements. Track housekeeping efficiency, front desk wait times, and maintenance response rates. Be process-oriented and solution-focused.',
      },
      {
        name: 'CFO',
        role: 'Financial analysis',
        capabilities: ['budgeting', 'forecasting', 'cost-analysis'],
        soul: 'You are the CFO overseeing hospitality finances. You manage budgets, produce forecasts, analyze cost structures (labor, food cost, energy), and evaluate capital expenditure proposals. Present financial data clearly with variance analysis and ROI calculations.',
      },
      {
        name: 'GM',
        role: 'General management',
        capabilities: ['guest-relations', 'staff-management', 'daily-ops'],
        soul: 'You are the General Manager running the property day-to-day. You handle guest escalations, coordinate staff schedules, oversee all departments, and ensure brand standards are met. Balance guest satisfaction with operational efficiency. Be hands-on and empathetic.',
      },
      {
        name: 'F&B Director',
        role: 'Food & beverage',
        capabilities: ['menu-planning', 'inventory', 'cost-control'],
        soul: 'You are the Food & Beverage Director. You manage restaurant and bar operations, design menus, control food costs (target 28-32%), manage inventory and vendor relationships, and oversee banquet/event catering. Track covers, average check, and food waste metrics.',
      },
      {
        name: 'HR',
        role: 'Human resources',
        capabilities: ['recruitment', 'training', 'compliance'],
        soul: 'You are the HR Director for hospitality. You handle recruitment, onboarding, training programs, labor law compliance, employee relations, and retention strategies. Track turnover rates, training completion, and employee satisfaction. Be people-first while maintaining compliance.',
      },
      {
        name: 'Sales',
        role: 'Revenue generation',
        capabilities: ['group-sales', 'corporate-rates', 'marketing'],
        soul: 'You are the Director of Sales driving revenue. You manage group and corporate rate negotiations, develop marketing campaigns, oversee OTA channel strategy, and build loyalty programs. Track booking pace, market share, and conversion rates. Be results-oriented with clear pipeline management.',
      },
    ],
    dbTables: ['reservations', 'guests', 'rooms', 'revenue_data', 'staff', 'fb_inventory'],
    developmentTemplates: ['luxury-hotel', 'boutique-resort', 'business-hotel', 'chain-operations'],
  },
  {
    id: 'healthcare',
    domain: 'Medical',
    engines: ['HIPAA Checker', 'Clinical Protocol', 'Patient Profile'],
    agents: [
      {
        name: 'Compliance Analyst',
        role: 'Regulatory compliance',
        capabilities: ['hipaa', 'audit', 'policy-review'],
        soul: 'You are a Healthcare Compliance Analyst specializing in HIPAA, FDA regulations, and healthcare audit processes. You review policies, identify compliance gaps, recommend remediation steps, and prepare audit documentation. Always cite specific regulatory sections when making recommendations.',
      },
      {
        name: 'Medical IP Counsel',
        role: 'Medical IP',
        capabilities: ['patents', 'trade-secrets', 'licensing'],
        soul: 'You are a Medical IP Counsel advising on patents, trade secrets, and licensing in the healthcare/biotech space. You evaluate patent landscapes, draft IP strategy recommendations, review licensing agreements, and protect proprietary research. Be precise about jurisdictional requirements.',
      },
      {
        name: 'Clinical Reviewer',
        role: 'Clinical review',
        capabilities: ['protocol-review', 'trial-design', 'data-analysis'],
        soul: 'You are a Clinical Reviewer evaluating trial protocols, study designs, and clinical data. You assess methodology rigor, statistical approaches, endpoint selection, and regulatory submission readiness. Provide structured reviews with clear pass/fail criteria and improvement recommendations.',
      },
    ],
    dbTables: ['patients', 'protocols', 'compliance_logs', 'clinical_trials'],
    developmentTemplates: ['clinic-management', 'clinical-trials', 'telemedicine', 'pharmacy'],
  },
  {
    id: 'legal',
    domain: 'Law',
    engines: ['Case Law Search', 'Contract Parser', 'Compliance Check'],
    agents: [
      {
        name: 'Chief Legal Officer',
        role: 'Legal strategy',
        capabilities: ['litigation', 'corporate-law', 'risk-assessment'],
        soul: 'You are the Chief Legal Officer providing strategic legal counsel. You assess litigation risk, advise on corporate governance, review M&A deals, and set legal policy. Prioritize risk mitigation and provide clear, actionable legal opinions with confidence levels.',
      },
      {
        name: 'IP Counsel',
        role: 'Intellectual property',
        capabilities: ['patents', 'trademarks', 'copyright'],
        soul: 'You are an IP Counsel managing intellectual property portfolios. You evaluate patentability, conduct prior art searches, manage trademark filings, and advise on copyright protection. Track filing deadlines and maintenance fees. Be thorough in jurisdictional analysis.',
      },
      {
        name: 'Paralegal',
        role: 'Legal research',
        capabilities: ['case-research', 'document-prep', 'filing'],
        soul: 'You are a Paralegal conducting legal research and document preparation. You find relevant case law, prepare briefs, manage filing deadlines, organize discovery documents, and maintain case files. Be meticulous with citations and formatting requirements.',
      },
      {
        name: 'Compliance Auditor',
        role: 'Regulatory compliance',
        capabilities: ['audit', 'policy', 'reporting'],
        soul: 'You are a Compliance Auditor ensuring regulatory adherence. You conduct internal audits, review policies against current regulations, produce compliance reports, and track remediation items. Flag high-risk findings immediately and track resolution timelines.',
      },
    ],
    dbTables: ['cases', 'contracts', 'regulations', 'filings', 'ip_portfolio'],
    developmentTemplates: [
      'ip-portfolio',
      'contract-review',
      'compliance-audit',
      'litigation-support',
    ],
  },
  {
    id: 'marketing',
    domain: 'Campaigns',
    engines: ['Campaign Engine', 'Analytics', 'A/B Tester'],
    agents: [
      {
        name: 'Campaign Orchestrator',
        role: 'Campaign management',
        capabilities: ['planning', 'scheduling', 'optimization'],
        soul: 'You are a Campaign Orchestrator managing multi-channel marketing campaigns. You plan campaign timelines, coordinate content across channels (email, social, paid, organic), optimize budgets, and track performance against KPIs (CAC, ROAS, CTR, conversion). Be data-driven and action-oriented.',
      },
      {
        name: 'Analytics Analyst',
        role: 'Data analysis',
        capabilities: ['reporting', 'attribution', 'forecasting'],
        soul: 'You are a Marketing Analytics Analyst. You build attribution models, produce performance reports, forecast campaign outcomes, and identify optimization opportunities. Present data with clear visualizations and actionable insights. Always specify confidence intervals and sample sizes.',
      },
      {
        name: 'Content Creator',
        role: 'Content generation',
        capabilities: ['copywriting', 'creative', 'personalization'],
        soul: 'You are a Content Creator producing marketing copy across channels. You write email sequences, social media posts, ad copy, landing page content, and blog articles. Match brand voice, optimize for the target platform, and A/B test variations. Be creative yet conversion-focused.',
      },
    ],
    dbTables: ['campaigns', 'audiences', 'experiments', 'creatives', 'metrics'],
    developmentTemplates: [
      'social-media',
      'email-campaigns',
      'influencer-management',
      'analytics-dashboard',
    ],
  },
  {
    id: 'soc-ops',
    domain: 'Security',
    engines: ['Threat Intel', 'SIEM Connector', 'Incident Response'],
    agents: [
      {
        name: 'SOC Analyst',
        role: 'Alert triage',
        capabilities: ['alert-triage', 'investigation', 'escalation'],
        soul: 'You are a SOC Analyst performing alert triage and investigation. You analyze SIEM alerts, correlate events across data sources, determine true vs false positives, investigate suspicious activity, and escalate confirmed incidents. Use MITRE ATT&CK framework for threat classification. Be systematic and thorough in investigation notes.',
      },
      {
        name: 'Incident Responder',
        role: 'Incident management',
        capabilities: ['containment', 'eradication', 'recovery'],
        soul: 'You are an Incident Responder managing security incidents through the full lifecycle: detection, containment, eradication, recovery, and lessons learned. You coordinate response teams, document actions taken, preserve forensic evidence, and produce post-incident reports. Follow NIST 800-61 incident handling guidelines.',
      },
      {
        name: 'Threat Hunter',
        role: 'Proactive hunting',
        capabilities: ['ioc-analysis', 'threat-modeling', 'forensics'],
        soul: 'You are a Threat Hunter proactively searching for undetected threats. You analyze IOCs, build threat models, conduct forensic analysis, and develop detection rules. You use hypothesis-driven hunting methodologies and track adversary TTPs. Document findings with kill-chain mapping and provide actionable detection signatures.',
      },
    ],
    dbTables: ['incidents', 'alerts', 'indicators', 'playbooks', 'forensics'],
    developmentTemplates: [
      'threat-monitoring',
      'incident-management',
      'vulnerability-scanning',
      'compliance-reporting',
    ],
  },
]

// ── Factory ─────────────────────────────────────────────────────────────

export class MiniBrainFactory {
  /** Get all available templates */
  getTemplates(): TemplateDefinition[] {
    return [...TEMPLATES]
  }

  /** Get a specific template */
  getTemplate(id: MiniBrainTemplate): TemplateDefinition | null {
    return TEMPLATES.find((t) => t.id === id) ?? null
  }

  /** Get development templates for a Mini Brain template */
  getDevelopmentTemplates(miniBrainTemplate: MiniBrainTemplate): string[] {
    return this.getTemplate(miniBrainTemplate)?.developmentTemplates ?? []
  }

  /**
   * @deprecated Use the `smartCreate` tRPC mutation in mini-brain-factory router instead.
   * This legacy method clones templates to the filesystem which does not work on
   * serverless platforms (Vercel). Kept for reference only.
   */
  async createMiniBrain(config: MiniBrainConfig): Promise<MiniBrainResult> {
    const template = this.getTemplate(config.template)
    if (!template) throw new Error(`Template not found: ${config.template}`)

    const id = crypto.randomUUID()
    const apiKey = `mb_${crypto.randomUUID().replace(/-/g, '')}`
    const port = 3100 + Math.floor(Math.random() * 900)

    // Step 1: Clone template
    const targetDir = config.targetDir ?? `/opt/mini-brains/${config.name}`
    await this.cloneTemplate(config.template, targetDir)

    // Step 2-3: Database setup
    const databaseUrl =
      config.databaseUrl ?? `postgresql://localhost:5432/mb_${config.name.replace(/\W/g, '_')}`
    await this.setupDatabase(databaseUrl, template.dbTables)

    // Step 4: Download domain data
    await this.downloadDomainData(config.template, targetDir)

    // Step 5: Create agents
    const agentIds = await this.createAgents(template.agents, id)

    // Step 5b: Create orchestrator agent for this mini brain
    const orchId = await this.createOrchestrator(config.name, template.domain, 'mini_brain')
    agentIds.push(orchId)

    // Step 6: Register entity
    await this.registerEntity(id, config.name, 'mini_brain', config.template)

    // Step 7: Wire SDK
    await this.wireSdkConnection(targetDir, config.brainEndpoint, config.brainApiKey)

    // Step 8: Assign healer
    await this.assignHealer(id)

    // Step 9: Start service (stub)
    const url = `http://localhost:${port}`

    return {
      id,
      name: config.name,
      template: config.template,
      url,
      apiKey,
      dashboardUrl: `${url}/dashboard`,
      agentIds,
      databaseUrl,
      status: 'created',
    }
  }

  /**
   * @deprecated Use the `smartCreateDevelopment` tRPC mutation instead.
   * This legacy method clones templates to the filesystem which does not work on
   * serverless platforms (Vercel). Kept for reference only.
   */
  async createDevelopment(config: DevelopmentConfig): Promise<DevelopmentResult> {
    const id = crypto.randomUUID()
    const apiKey = `dev_${crypto.randomUUID().replace(/-/g, '')}`
    const port = 4100 + Math.floor(Math.random() * 900)

    const targetDir = config.targetDir ?? `/opt/developments/${config.name}`
    await this.cloneTemplate(config.template, targetDir)
    await this.registerEntity(id, config.name, 'development', config.template, config.miniBrainId)

    // Create orchestrator for this development, linked to mini brain's orchestrator
    await this.createOrchestrator(config.name, config.template, 'development', config.miniBrainId)

    return {
      id,
      name: config.name,
      template: config.template,
      url: `http://localhost:${port}`,
      apiKey,
      miniBrainId: config.miniBrainId,
      status: 'created',
    }
  }

  // ── Internal methods ─────────────────────────────────────────────────

  /** The database instance used for Brain tables (agents, brain_entities, etc.) */
  private db: ReturnType<typeof createDb> | null = null

  private getDb(): ReturnType<typeof createDb> {
    if (!this.db) {
      const brainDbUrl = process.env.DATABASE_URL
      if (!brainDbUrl) {
        throw new Error('DATABASE_URL environment variable is required for Brain database access')
      }
      this.db = createDb(brainDbUrl)
    }
    return this.db
  }

  /**
   * Create an orchestrator agent for a mini brain or development,
   * linked to the appropriate parent orchestrator in the hierarchy.
   */
  private async createOrchestrator(
    name: string,
    domain: string,
    tier: 'mini_brain' | 'development',
    parentEntityId?: string,
  ): Promise<string> {
    const db = this.getDb()

    // Find parent orchestrator
    let parentOrchestratorId: string | null = null

    if (tier === 'development' && parentEntityId) {
      // For developments, parent is the mini brain's orchestrator
      // Find agents that are orchestrators and belong to the mini brain entity
      const miniBrainAgents = await db.query.brainEntityAgents.findMany({
        where: eq(brainEntityAgents.entityId, parentEntityId),
      })
      for (const assignment of miniBrainAgents) {
        const agent = await db.query.agents.findFirst({
          where: and(eq(agents.id, assignment.agentId), eq(agents.isWsOrchestrator, true)),
        })
        if (agent) {
          parentOrchestratorId = agent.id
          break
        }
      }
    }

    if (!parentOrchestratorId) {
      // Fall back to system orchestrator
      const systemWs = await db.query.workspaces.findFirst({
        where: eq(workspaces.type, 'system'),
      })
      if (systemWs) {
        const systemOrch = await db.query.agents.findFirst({
          where: and(eq(agents.workspaceId, systemWs.id), eq(agents.isWsOrchestrator, true)),
        })
        parentOrchestratorId = systemOrch?.id ?? null
      }
    }

    const [orch] = await db
      .insert(agents)
      .values({
        name: `${name} Orchestrator`,
        type: 'orchestrator',
        description: `Orchestrator for ${domain} ${tier === 'mini_brain' ? 'Mini Brain' : 'Development'}`,
        skills: ['coordination', 'task-routing', 'domain-routing', 'escalation'],
        isWsOrchestrator: true,
        parentOrchestratorId,
        triggerMode: 'auto',
      })
      .returning({ id: agents.id })

    // Add orchestrator route from system workspace if this is a mini brain
    if (tier === 'mini_brain') {
      const systemWs = await db.query.workspaces.findFirst({
        where: eq(workspaces.type, 'system'),
      })
      if (systemWs) {
        await db.insert(orchestratorRoutes).values({
          fromWorkspace: systemWs.id,
          toWorkspace: null, // mini brain doesn't have a workspace row yet in general workspaces
          orchestratorId: orch.id,
          rule: `route-to-${domain.toLowerCase()}`,
          priority: 0,
        })
      }
    }

    return orch.id
  }

  /** Resolve the on-disk path for a template id (e.g. "astrology" → templates/astrology) */
  private resolveTemplatePath(template: string): string {
    // Templates live at the repo root under templates/
    return path.resolve(process.cwd(), 'templates', template)
  }

  private async cloneTemplate(template: string, targetDir: string): Promise<void> {
    try {
      const templateDir = this.resolveTemplatePath(template)
      // Verify the template directory exists
      try {
        await fs.access(templateDir)
      } catch {
        throw new Error(
          `Template directory not found at ${templateDir}. Available templates: ${TEMPLATES.map((t) => t.id).join(', ')}`,
        )
      }
      // Ensure parent of target exists
      await fs.mkdir(path.dirname(targetDir), { recursive: true })
      // Copy entire template tree to target directory
      await fs.cp(templateDir, targetDir, { recursive: true })
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Template directory not found')) throw err
      throw new Error(
        `Failed to clone template "${template}" to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async setupDatabase(url: string, _tables: string[]): Promise<void> {
    // Parse the database name from the connection string
    const parsed = new URL(url)
    const dbName = parsed.pathname.replace(/^\//, '')
    if (!dbName) {
      throw new Error(`Could not parse database name from URL: ${url}`)
    }

    // Connect to the default "postgres" database to create the target DB
    const adminUrl = new URL(url)
    adminUrl.pathname = '/postgres'
    // Dynamic import to avoid bundling pg in the Next.js client
    const pgModule = (await import(/* webpackIgnore: true */ 'pg' as string)) as {
      default?: {
        Client: new (opts: { connectionString: string }) => {
          connect(): Promise<void>
          query(sql: string, params?: unknown[]): Promise<{ rowCount: number }>
          end(): Promise<void>
        }
      }
      Client?: new (opts: { connectionString: string }) => {
        connect(): Promise<void>
        query(sql: string, params?: unknown[]): Promise<{ rowCount: number }>
        end(): Promise<void>
      }
    }
    const Client = pgModule.default?.Client ?? pgModule.Client!
    const client = new Client({ connectionString: adminUrl.toString() })

    try {
      await client.connect()
      // CREATE DATABASE cannot run inside a transaction; use IF NOT EXISTS via query
      const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
      if (exists.rowCount === 0) {
        // Identifiers can't be parameterised, but dbName comes from our own config
        await client.query(`CREATE DATABASE "${dbName}"`)
      }
    } catch (err) {
      throw new Error(
        `Failed to set up database "${dbName}": ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      await client.end()
    }

    // Run Drizzle migrations against the newly-created database
    // We use the drizzle-kit CLI so it picks up the template's drizzle.config.ts
    try {
      const { execSync } = await import('node:child_process')
      execSync(`npx drizzle-kit push`, {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      })
    } catch (err) {
      // Migrations are best-effort; the schema may already be in place
      console.warn(
        `[MiniBrainFactory] drizzle-kit push warning: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async downloadDomainData(template: string, targetDir: string): Promise<void> {
    // Domain data URLs are looked up from a well-known config file in the template
    const configPath = path.join(targetDir, 'domain-data.json')
    try {
      await fs.access(configPath)
    } catch {
      // No domain-data.json → nothing to download (many templates don't need external data)
      return
    }

    try {
      const raw = await fs.readFile(configPath, 'utf-8')
      const config = JSON.parse(raw) as { files?: { url: string; dest: string }[] }

      if (!config.files || config.files.length === 0) return

      const dataDir = path.join(targetDir, 'data')
      await fs.mkdir(dataDir, { recursive: true })

      await Promise.all(
        config.files.map(async (file) => {
          const res = await fetch(file.url)
          if (!res.ok) {
            throw new Error(`Failed to download ${file.url}: ${res.status} ${res.statusText}`)
          }
          const dest = path.join(dataDir, file.dest)
          await fs.mkdir(path.dirname(dest), { recursive: true })
          const buffer = Buffer.from(await res.arrayBuffer())
          await fs.writeFile(dest, buffer)
        }),
      )
    } catch (err) {
      throw new Error(
        `Failed to download domain data for template "${template}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async createAgents(agentDefs: AgentDefinition[], miniBrainId: string): Promise<string[]> {
    const db = this.getDb()
    try {
      const ids: string[] = []
      for (const def of agentDefs) {
        const [inserted] = await db
          .insert(agents)
          .values({
            name: def.name,
            type: def.role,
            description: `[${miniBrainId}] ${def.role}`,
            skills: def.capabilities,
          })
          .returning({ id: agents.id })
        ids.push(inserted.id)
      }
      return ids
    } catch (err) {
      throw new Error(
        `Failed to create agents for Mini Brain ${miniBrainId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async registerEntity(
    id: string,
    name: string,
    tier: string,
    template: string,
    parentId?: string,
  ): Promise<void> {
    const db = this.getDb()
    try {
      await db.insert(brainEntities).values({
        id,
        name,
        tier: tier as 'brain' | 'mini_brain' | 'development',
        domain: template,
        parentId: parentId ?? null,
        status: 'provisioning',
      })
    } catch (err) {
      throw new Error(
        `Failed to register entity "${name}" (${tier}): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async wireSdkConnection(
    targetDir: string,
    endpoint: string,
    apiKey: string,
  ): Promise<void> {
    try {
      const envPath = path.join(targetDir, '.env')
      const envContent = [
        `# Brain SDK connection — auto-generated by MiniBrainFactory`,
        `BRAIN_ENDPOINT=${endpoint}`,
        `BRAIN_API_KEY=${apiKey}`,
        '',
      ].join('\n')
      await fs.writeFile(envPath, envContent, 'utf-8')
    } catch (err) {
      throw new Error(
        `Failed to write SDK connection config to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async assignHealer(entityId: string): Promise<void> {
    const db = this.getDb()
    try {
      // Find an agent with the 'healer' role that is already registered as a healer
      // in brain_entity_agents, or fall back to any agent tagged as a healer in agents table.
      const healerAssignment = await db.query.brainEntityAgents.findFirst({
        where: eq(brainEntityAgents.role, 'healer'),
        columns: { agentId: true },
      })

      let healerAgentId: string | undefined = healerAssignment?.agentId

      if (!healerAgentId) {
        // Fall back: look for an agent whose type contains 'healer'
        const healerAgent = await db.query.agents.findFirst({
          where: eq(agents.type, 'healer'),
          columns: { id: true },
        })
        healerAgentId = healerAgent?.id
      }

      if (!healerAgentId) {
        console.warn(
          `[MiniBrainFactory] No healer agent found — skipping healer assignment for entity ${entityId}`,
        )
        return
      }

      await db.insert(brainEntityAgents).values({
        entityId,
        agentId: healerAgentId,
        role: 'healer',
      })
    } catch (err) {
      throw new Error(
        `Failed to assign healer to entity ${entityId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
