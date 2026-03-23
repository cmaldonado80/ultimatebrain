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
import { eq } from 'drizzle-orm'
import { createDb, agents, brainEntities, brainEntityAgents } from '@solarc/db'

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
      { name: 'Master Astrologer', role: 'Lead analysis', capabilities: ['natal-charts', 'transit-analysis', 'synastry'] },
      { name: 'Transit Tracker', role: 'Real-time transit monitoring', capabilities: ['transit-alerts', 'aspect-detection'] },
      { name: 'Sports Analyst', role: 'Sports astrology', capabilities: ['event-timing', 'team-analysis'] },
      { name: 'Business Advisor', role: 'Business astrology', capabilities: ['electional', 'horary', 'mundane'] },
    ],
    dbTables: ['clients', 'natal_charts', 'readings', 'transit_alerts', 'sports_teams'],
    developmentTemplates: ['sports-astrology', 'personal-astrology', 'business-astrology', 'mundane-astrology'],
  },
  {
    id: 'hospitality',
    domain: 'Hotels',
    engines: ['PMS Integration', 'Revenue Mgmt', 'Guest Profile'],
    agents: [
      { name: 'CEO', role: 'Strategic oversight', capabilities: ['strategy', 'reporting', 'kpi-tracking'] },
      { name: 'COO', role: 'Operations management', capabilities: ['operations', 'staffing', 'quality'] },
      { name: 'CFO', role: 'Financial analysis', capabilities: ['budgeting', 'forecasting', 'cost-analysis'] },
      { name: 'GM', role: 'General management', capabilities: ['guest-relations', 'staff-management', 'daily-ops'] },
      { name: 'F&B Director', role: 'Food & beverage', capabilities: ['menu-planning', 'inventory', 'cost-control'] },
      { name: 'HR', role: 'Human resources', capabilities: ['recruitment', 'training', 'compliance'] },
      { name: 'Sales', role: 'Revenue generation', capabilities: ['group-sales', 'corporate-rates', 'marketing'] },
    ],
    dbTables: ['reservations', 'guests', 'rooms', 'revenue_data', 'staff', 'fb_inventory'],
    developmentTemplates: ['luxury-hotel', 'boutique-resort', 'business-hotel', 'chain-operations'],
  },
  {
    id: 'healthcare',
    domain: 'Medical',
    engines: ['HIPAA Checker', 'Clinical Protocol', 'Patient Profile'],
    agents: [
      { name: 'Compliance Analyst', role: 'Regulatory compliance', capabilities: ['hipaa', 'audit', 'policy-review'] },
      { name: 'Medical IP Counsel', role: 'Medical IP', capabilities: ['patents', 'trade-secrets', 'licensing'] },
      { name: 'Clinical Reviewer', role: 'Clinical review', capabilities: ['protocol-review', 'trial-design', 'data-analysis'] },
    ],
    dbTables: ['patients', 'protocols', 'compliance_logs', 'clinical_trials'],
    developmentTemplates: ['clinic-management', 'clinical-trials', 'telemedicine', 'pharmacy'],
  },
  {
    id: 'legal',
    domain: 'Law',
    engines: ['Case Law Search', 'Contract Parser', 'Compliance Check'],
    agents: [
      { name: 'Chief Legal Officer', role: 'Legal strategy', capabilities: ['litigation', 'corporate-law', 'risk-assessment'] },
      { name: 'IP Counsel', role: 'Intellectual property', capabilities: ['patents', 'trademarks', 'copyright'] },
      { name: 'Paralegal', role: 'Legal research', capabilities: ['case-research', 'document-prep', 'filing'] },
      { name: 'Compliance Auditor', role: 'Regulatory compliance', capabilities: ['audit', 'policy', 'reporting'] },
    ],
    dbTables: ['cases', 'contracts', 'regulations', 'filings', 'ip_portfolio'],
    developmentTemplates: ['ip-portfolio', 'contract-review', 'compliance-audit', 'litigation-support'],
  },
  {
    id: 'marketing',
    domain: 'Campaigns',
    engines: ['Campaign Engine', 'Analytics', 'A/B Tester'],
    agents: [
      { name: 'Campaign Orchestrator', role: 'Campaign management', capabilities: ['planning', 'scheduling', 'optimization'] },
      { name: 'Analytics Analyst', role: 'Data analysis', capabilities: ['reporting', 'attribution', 'forecasting'] },
      { name: 'Content Creator', role: 'Content generation', capabilities: ['copywriting', 'creative', 'personalization'] },
    ],
    dbTables: ['campaigns', 'audiences', 'experiments', 'creatives', 'metrics'],
    developmentTemplates: ['social-media', 'email-campaigns', 'influencer-management', 'analytics-dashboard'],
  },
  {
    id: 'soc-ops',
    domain: 'Security',
    engines: ['Threat Intel', 'SIEM Connector', 'Incident Response'],
    agents: [
      { name: 'SOC Analyst', role: 'Alert triage', capabilities: ['alert-triage', 'investigation', 'escalation'] },
      { name: 'Incident Responder', role: 'Incident management', capabilities: ['containment', 'eradication', 'recovery'] },
      { name: 'Threat Hunter', role: 'Proactive hunting', capabilities: ['ioc-analysis', 'threat-modeling', 'forensics'] },
    ],
    dbTables: ['incidents', 'alerts', 'indicators', 'playbooks', 'forensics'],
    developmentTemplates: ['threat-monitoring', 'incident-management', 'vulnerability-scanning', 'compliance-reporting'],
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
   * Create a new Mini Brain from a template.
   *
   * Steps:
   * 1. Clone template to target directory
   * 2. Set up domain Postgres database
   * 3. Run domain Drizzle migrations
   * 4. Download domain data (e.g., ephemeris files)
   * 5. Create domain agents in Brain's agents table
   * 6. Register in brain_entities table
   * 7. Wire Brain SDK connection
   * 8. Assign Brain healer to monitor
   * 9. Start Mini Brain service
   * 10. Return URL + API key + dashboard URL
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
    const databaseUrl = config.databaseUrl ?? `postgresql://localhost:5432/mb_${config.name.replace(/\W/g, '_')}`
    await this.setupDatabase(databaseUrl, template.dbTables)

    // Step 4: Download domain data
    await this.downloadDomainData(config.template, targetDir)

    // Step 5: Create agents
    const agentIds = await this.createAgents(template.agents, id)

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
   * Create a Development app from a Mini Brain's template library.
   *
   * Steps:
   * 1. Clone Development template
   * 2. Pre-wire @solarc/mini-brain-sdk
   * 3. Provision user-facing tables
   * 4. Register in brain_entities (tier: development)
   * 5. Assign Mini Brain agents for domain support
   * 6. Return App URL + API key
   */
  async createDevelopment(config: DevelopmentConfig): Promise<DevelopmentResult> {
    const id = crypto.randomUUID()
    const apiKey = `dev_${crypto.randomUUID().replace(/-/g, '')}`
    const port = 4100 + Math.floor(Math.random() * 900)

    const targetDir = config.targetDir ?? `/opt/developments/${config.name}`
    await this.cloneTemplate(config.template, targetDir)
    await this.registerEntity(id, config.name, 'development', config.template, config.miniBrainId)

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
        throw new Error(`Template directory not found at ${templateDir}. Available templates: ${TEMPLATES.map((t) => t.id).join(', ')}`)
      }
      // Ensure parent of target exists
      await fs.mkdir(path.dirname(targetDir), { recursive: true })
      // Copy entire template tree to target directory
      await fs.cp(templateDir, targetDir, { recursive: true })
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Template directory not found')) throw err
      throw new Error(`Failed to clone template "${template}" to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`)
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
    const pgModule = await import(/* webpackIgnore: true */ 'pg' as string) as any
    const Client = pgModule.default?.Client ?? pgModule.Client
    const client = new Client({ connectionString: adminUrl.toString() })

    try {
      await client.connect()
      // CREATE DATABASE cannot run inside a transaction; use IF NOT EXISTS via query
      const exists = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
      )
      if (exists.rowCount === 0) {
        // Identifiers can't be parameterised, but dbName comes from our own config
        await client.query(`CREATE DATABASE "${dbName}"`)
      }
    } catch (err) {
      throw new Error(`Failed to set up database "${dbName}": ${err instanceof Error ? err.message : String(err)}`)
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
      console.warn(`[MiniBrainFactory] drizzle-kit push warning: ${err instanceof Error ? err.message : String(err)}`)
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
        })
      )
    } catch (err) {
      throw new Error(`Failed to download domain data for template "${template}": ${err instanceof Error ? err.message : String(err)}`)
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
      throw new Error(`Failed to create agents for Mini Brain ${miniBrainId}: ${err instanceof Error ? err.message : String(err)}`)
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
      throw new Error(`Failed to register entity "${name}" (${tier}): ${err instanceof Error ? err.message : String(err)}`)
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
      throw new Error(`Failed to write SDK connection config to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`)
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
        console.warn(`[MiniBrainFactory] No healer agent found — skipping healer assignment for entity ${entityId}`)
        return
      }

      await db.insert(brainEntityAgents).values({
        entityId,
        agentId: healerAgentId,
        role: 'healer',
      })
    } catch (err) {
      throw new Error(`Failed to assign healer to entity ${entityId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
