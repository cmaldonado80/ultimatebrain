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

  // ── Internal stubs (real impl uses fs, docker, drizzle) ───────────────

  private async cloneTemplate(_template: string, _targetDir: string): Promise<void> {
    // Stub: copy template files to target directory
  }

  private async setupDatabase(_url: string, _tables: string[]): Promise<void> {
    // Stub: create database, run migrations
  }

  private async downloadDomainData(_template: string, _targetDir: string): Promise<void> {
    // Stub: download domain-specific data files
  }

  private async createAgents(agents: AgentDefinition[], miniBrainId: string): Promise<string[]> {
    // Stub: insert into Brain's agents table
    return agents.map(() => crypto.randomUUID())
  }

  private async registerEntity(
    _id: string,
    _name: string,
    _tier: string,
    _template: string,
    _parentId?: string
  ): Promise<void> {
    // Stub: insert into brain_entities table
  }

  private async wireSdkConnection(
    _targetDir: string,
    _endpoint: string,
    _apiKey: string
  ): Promise<void> {
    // Stub: write .env with Brain SDK config
  }

  private async assignHealer(_entityId: string): Promise<void> {
    // Stub: assign Brain's healer agent to monitor this entity
  }
}
