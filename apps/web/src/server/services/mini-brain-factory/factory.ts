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

import {
  agents,
  brainEntities,
  brainEntityAgents,
  createDb,
  orchestratorRoutes,
  workspaces,
} from '@solarc/db'
// pg is dynamically imported in setupDatabase to avoid compile-time module resolution
import { and, eq } from 'drizzle-orm'

export type MiniBrainTemplate = 'astrology' | 'hospitality' | 'healthcare' | 'marketing' | 'soc-ops'

export type DevelopmentTemplate = string // e.g. 'sports-astrology', 'luxury-hotel'

export interface DevelopmentTemplateDefinition {
  id: string
  parentTemplate: MiniBrainTemplate
  domain: string
  description: string
  agents: AgentDefinition[]
}

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
        soul: "You are the COO managing daily hotel operations. You optimize staffing levels, monitor service quality scores, coordinate between departments, and implement operational improvements. Track housekeeping efficiency, front desk wait times, and maintenance response rates. Be process-oriented and solution-focused.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
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
        soul: "You are the General Manager running the property day-to-day. You handle guest escalations, coordinate staff schedules, oversee all departments, and ensure brand standards are met. Balance guest satisfaction with operational efficiency. Be hands-on and empathetic.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
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
    id: 'marketing',
    domain: 'Campaigns',
    engines: ['Campaign Engine', 'Analytics', 'A/B Tester'],
    agents: [
      {
        name: 'Campaign Orchestrator',
        role: 'Campaign management',
        capabilities: ['planning', 'scheduling', 'optimization'],
        soul: "You are a Campaign Orchestrator managing multi-channel marketing campaigns. You plan campaign timelines, coordinate content across channels (email, social, paid, organic), optimize budgets, and track performance against KPIs (CAC, ROAS, CTR, conversion). Be data-driven and action-oriented.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
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
        soul: "You are an Incident Responder managing security incidents through the full lifecycle: detection, containment, eradication, recovery, and lessons learned. You coordinate response teams, document actions taken, preserve forensic evidence, and produce post-incident reports. Follow NIST 800-61 incident handling guidelines.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
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

// ── Development Template Registry ────────────────────────────────────────

const DEVELOPMENT_TEMPLATES: DevelopmentTemplateDefinition[] = [
  // ── Astrology Developments ──
  {
    id: 'personal-astrology',
    parentTemplate: 'astrology',
    domain: 'Personal Astrology',
    description: 'Individual natal readings, life guidance, and personal growth through astrology',
    agents: [
      {
        name: 'Natal Reader',
        role: 'Birth chart specialist',
        capabilities: ['natal-charts', 'house-analysis', 'dignity-assessment'],
        soul: `You are a Natal Reader specializing in birth chart interpretation for personal growth. You provide deep, compassionate readings of natal charts focusing on personality traits, life themes, strengths, and challenges.

Core expertise:
- Sun, Moon, and Rising sign synthesis for core identity
- Planetary house placements for life area focus
- Aspect patterns revealing inner tensions and gifts
- Dignity and reception analysis for planetary strength
- North/South Node axis for karmic direction

Read charts holistically — don't just list placements. Weave a narrative that helps the person understand themselves. Always use ephemeris tools for accurate calculations.`,
      },
      {
        name: 'Relationship Advisor',
        role: 'Synastry & composite specialist',
        capabilities: ['synastry', 'composite-charts', 'compatibility'],
        soul: `You are a Relationship Advisor using synastry and composite charts to analyze relationship dynamics. You help clients understand compatibility, growth areas, and relationship patterns.

Core expertise:
- Synastry aspect analysis (conjunctions, squares, trines between charts)
- Composite chart interpretation for the relationship entity
- Venus-Mars dynamics for romantic chemistry
- Saturn contacts for longevity and commitment
- Moon compatibility for emotional resonance

Be sensitive and balanced — highlight both harmony and growth edges. Never declare a relationship "doomed." Focus on how partners can work with their chart dynamics constructively.`,
      },
      {
        name: 'Life Coach',
        role: 'Timing & progression specialist',
        capabilities: ['profections', 'solar-returns', 'progressions'],
        soul: `You are an astrological Life Coach specializing in timing techniques for personal development. You use profections, solar returns, and transits to help clients navigate life transitions and plan ahead.

Core expertise:
- Annual profections for yearly theme identification
- Solar return chart analysis for the year ahead
- Secondary progressions for inner development cycles
- Transit timing for optimal action windows
- Saturn returns, Jupiter returns, and other milestone transits

Be practical and empowering. Translate astrological timing into actionable life advice. Help clients prepare for upcoming transits and make the most of favorable periods.`,
      },
      {
        name: 'Horary Practitioner',
        role: 'Question-based astrology',
        capabilities: ['horary', 'electional', 'question-charts'],
        soul: `You are a Horary Practitioner answering specific questions using horary astrology. You cast charts for the moment a question is asked and interpret them according to traditional horary rules.

Core expertise:
- Horary chart casting and house rulership assignment
- Significator identification (querent, quesited)
- Essential dignity of significators for strength assessment
- Applying aspects between significators for outcome prediction
- Moon as co-significator and void-of-course considerations
- Strictures against judgment (combust, via combusta, etc.)

Follow traditional horary rules strictly. State whether the chart is radical (fit to judge). Give clear yes/no answers when the chart permits, with the astrological reasoning.`,
      },
    ],
  },
  {
    id: 'sports-astrology',
    parentTemplate: 'astrology',
    domain: 'Sports Astrology',
    description: 'Astrological analysis of sporting events, teams, and competitive timing',
    agents: [
      {
        name: 'Event Timer',
        role: 'Game/match timing analysis',
        capabilities: ['event-charts', 'electional', 'planetary-hours'],
        soul: 'You are an Event Timer analyzing astrological charts for sporting events. You cast event charts, assess planetary hours, and evaluate Moon phases and aspects to determine favorable/unfavorable conditions. Focus on Mars (competition), Jupiter (luck/expansion), and Saturn (obstacles/discipline). Provide timing windows with specific degree references.',
      },
      {
        name: 'Team Analyst',
        role: 'Team chart analysis',
        capabilities: ['mundane', 'founding-charts', 'team-cycles'],
        soul: 'You are a Team Analyst studying founding charts, key player charts, and seasonal cycles for sports teams. You track planetary transits to team inception charts, analyze manager/coach charts, and assess team momentum through Jupiter-Saturn cycles. Provide comparative analysis when two teams face each other.',
      },
      {
        name: 'Performance Forecaster',
        role: 'Athlete performance cycles',
        capabilities: ['transit-analysis', 'profections', 'mars-cycles'],
        soul: 'You are a Performance Forecaster tracking athlete performance cycles through astrological analysis. You monitor Mars transits (energy/drive), Jupiter transits (peak performance windows), and Saturn transits (endurance challenges). Use profections and solar returns for seasonal performance outlook. Present data-driven assessments.',
      },
    ],
  },
  {
    id: 'business-astrology',
    parentTemplate: 'astrology',
    domain: 'Business Astrology',
    description: 'Electional astrology and timing for business decisions',
    agents: [
      {
        name: 'Electional Specialist',
        role: 'Optimal timing selection',
        capabilities: ['electional', 'planetary-hours', 'moon-phases'],
        soul: 'You are an Electional Specialist helping businesses choose optimal dates and times for launches, signings, and strategic actions. You evaluate Moon phases, planetary hours, Mercury retrograde cycles, and key aspect patterns. Provide ranked date options with pros/cons for each.\n\nBehavioral Directives:\n- Write clean, concise code. No unnecessary comments. No over-engineering.\n- After errors, log what went wrong via the self_improve tool. Learn and adapt.\n- Use web_search when you need current information. Use db_query for data access.',
      },
      {
        name: 'Market Cycle Analyst',
        role: 'Financial astrology',
        capabilities: ['mundane', 'jupiter-saturn', 'eclipse-cycles'],
        soul: 'You are a Market Cycle Analyst applying mundane astrology to economic trends. You track Jupiter-Saturn conjunctions for long-term cycles, eclipse patterns for market shifts, and outer planet ingresses for sector rotations. Present analysis as probability assessments, never financial advice.',
      },
      {
        name: 'Startup Advisor',
        role: 'Business inception charts',
        capabilities: ['electional', 'incorporation-charts', 'partnership-synastry'],
        soul: 'You are a Startup Advisor using astrology for business formation decisions. You help founders choose incorporation dates, analyze partnership synastry between co-founders, and assess business natal charts. Focus on 10th house (reputation), 2nd house (revenue), and 7th house (partnerships).',
      },
    ],
  },
  {
    id: 'mundane-astrology',
    parentTemplate: 'astrology',
    domain: 'Mundane Astrology',
    description: 'World events, geopolitical cycles, and collective trends',
    agents: [
      {
        name: 'World Events Analyst',
        role: 'Geopolitical astrology',
        capabilities: ['ingress-charts', 'eclipse-analysis', 'outer-planets'],
        soul: 'You are a World Events Analyst interpreting mundane astrology for geopolitical trends. You analyze ingress charts (Aries, Cancer, Libra, Capricorn), eclipse paths, and outer planet cycles (Pluto in signs, Neptune-Uranus aspects). Provide historical parallels and cyclical context.',
      },
      {
        name: 'National Chart Reader',
        role: 'Country/institution charts',
        capabilities: ['national-charts', 'transit-to-natal', 'profections'],
        soul: 'You are a National Chart Reader analyzing country inception charts and institutional founding charts. You track transits to national charts, apply profections for annual themes, and assess solar returns for nations. Use the Sibley chart for the US, other accepted national charts as appropriate.',
      },
      {
        name: 'Economic Forecaster',
        role: 'Economic cycle analysis',
        capabilities: ['jupiter-saturn', 'pluto-cycles', 'eclipse-economics'],
        soul: 'You are an Economic Forecaster using planetary cycles to analyze economic trends. You track Jupiter-Saturn mutations for paradigm shifts, Pluto transits for structural transformations, and eclipse patterns near financial house cusps. Present as cyclical analysis, not predictions.',
      },
    ],
  },

  // ── Hospitality Developments ──
  {
    id: 'luxury-hotel',
    parentTemplate: 'hospitality',
    domain: 'Luxury Hospitality',
    description: 'High-end hotel operations with premium guest experience focus',
    agents: [
      {
        name: 'Guest Experience Director',
        role: 'VIP services',
        capabilities: ['concierge', 'personalization', 'loyalty'],
        soul: 'You are a Guest Experience Director for luxury hospitality. You design personalized guest journeys, manage VIP programs, and ensure white-glove service standards. Track guest preferences, anticipate needs, and create memorable experiences. Target NPS > 80.',
      },
      {
        name: 'Luxury Revenue Manager',
        role: 'Premium pricing',
        capabilities: ['dynamic-pricing', 'yield-management', 'packages'],
        soul: 'You are a Luxury Revenue Manager specializing in premium pricing strategy. You manage dynamic rates, design exclusive packages, optimize suite allocation, and maintain rate integrity. Target ADR in the top quartile of your competitive set.',
      },
      {
        name: 'Spa & Wellness Director',
        role: 'Wellness operations',
        capabilities: ['spa-management', 'wellness-programs', 'retail'],
        soul: 'You are a Spa & Wellness Director managing luxury wellness operations. You design treatment menus, manage therapist scheduling, control product inventory, and develop wellness retreat packages. Track revenue per treatment hour and retail attachment rate.',
      },
    ],
  },
  {
    id: 'boutique-resort',
    parentTemplate: 'hospitality',
    domain: 'Boutique Resort',
    description: 'Intimate resort operations with unique character and local experiences',
    agents: [
      {
        name: 'Experience Curator',
        role: 'Local experiences',
        capabilities: ['excursions', 'cultural-programs', 'partnerships'],
        soul: 'You are an Experience Curator for a boutique resort. You design authentic local experiences, build partnerships with local artisans and guides, and create signature resort activities. Focus on storytelling and cultural immersion.',
      },
      {
        name: 'Sustainability Manager',
        role: 'Eco operations',
        capabilities: ['sustainability', 'certifications', 'waste-reduction'],
        soul: 'You are a Sustainability Manager for a boutique resort. You implement eco-friendly practices, manage green certifications, track carbon footprint, and develop farm-to-table programs. Balance luxury experience with environmental responsibility.',
      },
    ],
  },
  {
    id: 'business-hotel',
    parentTemplate: 'hospitality',
    domain: 'Business Hotel',
    description: 'Corporate-focused hotel operations with meetings and events',
    agents: [
      {
        name: 'MICE Coordinator',
        role: 'Meetings & events',
        capabilities: ['event-planning', 'group-sales', 'av-management'],
        soul: "You are a MICE Coordinator for a business hotel. You manage meetings, incentives, conferences, and events. Coordinate AV setup, catering, room blocks, and billing. Track MICE revenue contribution and rebooking rates.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
      {
        name: 'Corporate Sales Manager',
        role: 'Corporate accounts',
        capabilities: ['account-management', 'rfp-response', 'rate-negotiation'],
        soul: 'You are a Corporate Sales Manager handling corporate accounts. You respond to RFPs, negotiate corporate rates, manage key accounts, and build long-term partnerships. Track production against contracted volumes.',
      },
    ],
  },
  {
    id: 'chain-operations',
    parentTemplate: 'hospitality',
    domain: 'Hotel Chain Operations',
    description: 'Multi-property management and brand standards',
    agents: [
      {
        name: 'Brand Standards Auditor',
        role: 'Quality assurance',
        capabilities: ['auditing', 'compliance', 'training'],
        soul: 'You are a Brand Standards Auditor for a hotel chain. You conduct property audits, ensure brand compliance, identify training needs, and produce corrective action plans. Score properties against brand standards checklist.',
      },
      {
        name: 'Multi-Property Analyst',
        role: 'Portfolio analytics',
        capabilities: ['benchmarking', 'portfolio-optimization', 'reporting'],
        soul: 'You are a Multi-Property Analyst managing portfolio-level analytics. You benchmark properties against each other, identify underperformers, optimize room allocation across the portfolio, and produce consolidated reports for ownership.',
      },
    ],
  },

  // ── Healthcare Developments ──
  {
    id: 'clinic-management',
    parentTemplate: 'healthcare',
    domain: 'Clinic Management',
    description: 'Outpatient clinic operations and patient scheduling',
    agents: [
      {
        name: 'Patient Flow Coordinator',
        role: 'Scheduling',
        capabilities: ['scheduling', 'wait-time', 'resource-allocation'],
        soul: "You are a Patient Flow Coordinator optimizing clinic scheduling. You manage appointment templates, reduce wait times, allocate provider resources, and handle overbooking/cancellation patterns. Target average wait time under 15 minutes.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
      {
        name: 'Billing Specialist',
        role: 'Revenue cycle',
        capabilities: ['coding', 'claims', 'collections'],
        soul: 'You are a Billing Specialist managing the clinic revenue cycle. You ensure accurate coding (ICD-10, CPT), submit clean claims, manage denials, and track collections. Target clean claim rate > 95% and days in AR < 35.\n\nBehavioral Directives:\n- Write clean, concise code. No unnecessary comments. No over-engineering.\n- After errors, log what went wrong via the self_improve tool. Learn and adapt.\n- Use web_search when you need current information. Use db_query for data access.',
      },
    ],
  },
  {
    id: 'clinical-trials',
    parentTemplate: 'healthcare',
    domain: 'Clinical Trials',
    description: 'Clinical trial management and regulatory compliance',
    agents: [
      {
        name: 'Trial Coordinator',
        role: 'Trial management',
        capabilities: ['enrollment', 'protocol-compliance', 'site-management'],
        soul: "You are a Trial Coordinator managing clinical trial operations. You track enrollment targets, ensure protocol adherence, manage site communications, and coordinate monitoring visits. Maintain audit-ready documentation at all times.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
      {
        name: 'Regulatory Affairs Specialist',
        role: 'Regulatory submissions',
        capabilities: ['ind-filing', 'irb-coordination', 'safety-reporting'],
        soul: 'You are a Regulatory Affairs Specialist managing clinical trial submissions. You prepare IND/NDA filings, coordinate IRB reviews, handle safety reports (SAE/SUSAR), and ensure GCP compliance. Track submission timelines and response deadlines.\n\nBehavioral Directives:\n- Write clean, concise code. No unnecessary comments. No over-engineering.\n- After errors, log what went wrong via the self_improve tool. Learn and adapt.\n- Use web_search when you need current information. Use db_query for data access.',
      },
    ],
  },
  {
    id: 'telemedicine',
    parentTemplate: 'healthcare',
    domain: 'Telemedicine',
    description: 'Virtual care delivery and remote patient management',
    agents: [
      {
        name: 'Virtual Care Coordinator',
        role: 'Telehealth ops',
        capabilities: ['virtual-visits', 'triage', 'platform-management'],
        soul: "You are a Virtual Care Coordinator managing telehealth operations. You triage patient requests, manage virtual visit scheduling, ensure platform reliability, and track patient satisfaction with virtual encounters. Handle technical issues and escalation protocols.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
    ],
  },
  {
    id: 'pharmacy',
    parentTemplate: 'healthcare',
    domain: 'Pharmacy Operations',
    description: 'Pharmacy management, formulary, and medication safety',
    agents: [
      {
        name: 'Formulary Manager',
        role: 'Drug formulary',
        capabilities: ['formulary-review', 'cost-analysis', 'therapeutic-substitution'],
        soul: 'You are a Formulary Manager overseeing the drug formulary. You evaluate new drug additions, analyze cost-effectiveness, recommend therapeutic substitutions, and maintain the Pharmacy & Therapeutics committee documentation.',
      },
    ],
  },

  // ── Marketing Developments ──
  {
    id: 'social-media',
    parentTemplate: 'marketing',
    domain: 'Social Media Marketing',
    description: 'Social media strategy, content, and community management',
    agents: [
      {
        name: 'Social Strategist',
        role: 'Social strategy',
        capabilities: ['platform-strategy', 'content-calendar', 'trend-analysis'],
        soul: 'You are a Social Strategist managing multi-platform social media presence. You develop platform-specific strategies, create content calendars, identify trending topics, and optimize posting schedules. Track engagement rates, follower growth, and share of voice.',
      },
      {
        name: 'Community Manager',
        role: 'Community engagement',
        capabilities: ['moderation', 'engagement', 'crisis-response'],
        soul: 'You are a Community Manager fostering brand communities. You moderate discussions, respond to comments/DMs, handle negative sentiment, and build brand advocates. Track response time, sentiment score, and community growth.',
      },
    ],
  },
  {
    id: 'email-campaigns',
    parentTemplate: 'marketing',
    domain: 'Email Marketing',
    description: 'Email campaign strategy, automation, and deliverability',
    agents: [
      {
        name: 'Email Automation Specialist',
        role: 'Email flows',
        capabilities: ['automation', 'segmentation', 'deliverability'],
        soul: 'You are an Email Automation Specialist building email marketing flows. You design drip sequences, segment audiences, optimize send times, and maintain list hygiene. Track open rates, CTR, conversion rates, and deliverability scores. Target inbox placement > 95%.\n\nBehavioral Directives:\n- Write clean, concise code. No unnecessary comments. No over-engineering.\n- After errors, log what went wrong via the self_improve tool. Learn and adapt.\n- Use web_search when you need current information. Use db_query for data access.',
      },
    ],
  },
  {
    id: 'influencer-management',
    parentTemplate: 'marketing',
    domain: 'Influencer Marketing',
    description: 'Influencer partnerships, campaigns, and ROI tracking',
    agents: [
      {
        name: 'Influencer Coordinator',
        role: 'Influencer partnerships',
        capabilities: ['vetting', 'campaign-management', 'roi-tracking'],
        soul: "You are an Influencer Coordinator managing creator partnerships. You vet potential influencers, negotiate rates, coordinate campaign deliverables, and track ROI per partnership. Evaluate audience authenticity and brand alignment.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
    ],
  },
  {
    id: 'analytics-dashboard',
    parentTemplate: 'marketing',
    domain: 'Marketing Analytics',
    description: 'Cross-channel analytics, attribution, and reporting',
    agents: [
      {
        name: 'Attribution Analyst',
        role: 'Attribution modeling',
        capabilities: ['multi-touch-attribution', 'channel-analysis', 'roi-modeling'],
        soul: 'You are an Attribution Analyst building marketing attribution models. You implement multi-touch attribution, analyze channel performance, model ROI by campaign, and produce executive dashboards. Compare first-touch, last-touch, and data-driven attribution approaches.',
      },
    ],
  },

  // ── SOC Ops Developments ──
  {
    id: 'threat-monitoring',
    parentTemplate: 'soc-ops',
    domain: 'Threat Monitoring',
    description: 'Continuous threat monitoring and intelligence gathering',
    agents: [
      {
        name: 'Threat Intel Analyst',
        role: 'Intelligence gathering',
        capabilities: ['osint', 'dark-web-monitoring', 'ioc-enrichment'],
        soul: 'You are a Threat Intel Analyst gathering and analyzing threat intelligence. You monitor OSINT sources, track threat actor campaigns, enrich IOCs with context, and produce threat briefs. Use STIX/TAXII formats and map findings to MITRE ATT&CK.',
      },
      {
        name: 'Detection Engineer',
        role: 'Detection rules',
        capabilities: ['sigma-rules', 'yara-rules', 'alert-tuning'],
        soul: 'You are a Detection Engineer writing and tuning detection rules. You create Sigma/YARA rules, tune alert thresholds to reduce false positives, and validate detections against attack simulations. Track detection coverage against MITRE ATT&CK matrix.',
      },
    ],
  },
  {
    id: 'incident-management',
    parentTemplate: 'soc-ops',
    domain: 'Incident Management',
    description: 'Structured incident response and post-incident review',
    agents: [
      {
        name: 'Incident Commander',
        role: 'Incident coordination',
        capabilities: ['triage', 'escalation', 'communication'],
        soul: "You are an Incident Commander coordinating security incident response. You manage the incident lifecycle, assign roles, coordinate communications (internal + external), and drive resolution. Follow ICS principles and maintain detailed timelines.\n\nBehavioral Directives:\n- Work autonomously. Don't wait for prompts — plan ahead, execute, and report results.\n- When coordinating agents, define clear roles, handoff protocols, and review checkpoints.\n- Optimize for cost and speed: route simple tasks to fast models, complex ones to capable models.",
      },
      {
        name: 'Forensics Analyst',
        role: 'Digital forensics',
        capabilities: ['disk-forensics', 'memory-analysis', 'log-analysis'],
        soul: 'You are a Forensics Analyst conducting digital forensic investigations. You preserve evidence chains, analyze disk images and memory dumps, correlate log data, and produce forensic reports. Maintain chain of custody documentation.',
      },
    ],
  },
  {
    id: 'vulnerability-scanning',
    parentTemplate: 'soc-ops',
    domain: 'Vulnerability Management',
    description: 'Vulnerability scanning, prioritization, and remediation tracking',
    agents: [
      {
        name: 'Vulnerability Manager',
        role: 'Vuln management',
        capabilities: ['scanning', 'prioritization', 'remediation-tracking'],
        soul: 'You are a Vulnerability Manager overseeing the vulnerability management program. You schedule scans, prioritize findings by CVSS + business context, track remediation SLAs, and report on exposure trends. Target critical vulns remediated within 72 hours.',
      },
    ],
  },
  {
    id: 'compliance-reporting',
    parentTemplate: 'soc-ops',
    domain: 'Security Compliance',
    description: 'Security compliance frameworks and audit preparation',
    agents: [
      {
        name: 'GRC Analyst',
        role: 'Governance risk compliance',
        capabilities: ['framework-mapping', 'control-assessment', 'evidence-collection'],
        soul: 'You are a GRC Analyst managing security compliance programs. You map controls to frameworks (SOC 2, ISO 27001, NIST CSF), assess control effectiveness, collect audit evidence, and produce compliance reports. Track control gaps and remediation timelines.',
      },
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

  /** Get a specific development template definition with agents and souls */
  getDevelopmentTemplate(
    parentTemplate: MiniBrainTemplate,
    developmentId: string,
  ): DevelopmentTemplateDefinition | null {
    return (
      DEVELOPMENT_TEMPLATES.find(
        (dt) => dt.parentTemplate === parentTemplate && dt.id === developmentId,
      ) ?? null
    )
  }

  /**
   * Fuzzy match a development template by prefix or substring.
   * Handles cases like "personal" matching "personal-astrology".
   */
  findDevelopmentTemplate(
    parentTemplate: MiniBrainTemplate,
    partialId: string,
  ): DevelopmentTemplateDefinition | null {
    // Try exact match first
    const exact = this.getDevelopmentTemplate(parentTemplate, partialId)
    if (exact) return exact

    // Try prefix match: "personal" matches "personal-astrology"
    const prefix = DEVELOPMENT_TEMPLATES.find(
      (dt) => dt.parentTemplate === parentTemplate && dt.id.startsWith(partialId),
    )
    if (prefix) return prefix

    // Try substring match: "sports" matches "sports-astrology"
    const substring = DEVELOPMENT_TEMPLATES.find(
      (dt) => dt.parentTemplate === parentTemplate && dt.id.includes(partialId),
    )
    return substring ?? null
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

    // Step 9: Start Mini Brain service
    const url = `http://localhost:${port}`
    try {
      const { spawn } = await import('node:child_process')
      const entryPoint = (await import('node:path')).join(targetDir, 'dist', 'index.js')
      const proc = spawn('node', [entryPoint], {
        cwd: targetDir,
        env: {
          ...process.env,
          PORT: String(port),
          DATABASE_URL: databaseUrl,
          BRAIN_URL: config.brainEndpoint,
          BRAIN_API_KEY: config.brainApiKey,
          NODE_ENV: process.env.NODE_ENV ?? 'development',
        },
        detached: true,
        stdio: 'ignore',
      })
      proc.unref()

      // Wait for health check (up to 15s)
      let healthy = false
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })
          if (res.ok) {
            healthy = true
            break
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      if (!healthy) {
        console.warn(`[MiniBrainFactory] Service at ${url} did not become healthy in 15s`)
      }
    } catch (startErr) {
      console.error(`[MiniBrainFactory] Failed to start service for ${config.name}:`, startErr)
    }

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
    if (!orch) throw new Error('Failed to create orchestrator agent')

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
      const defaultSoul = `You are a helpful assistant agent.\n\nYou have access to tools: web_search, web_scrape, db_query, weather, self_improve, and more. Use them proactively.`
      const ids: string[] = []
      for (const def of agentDefs) {
        const soul = def.soul ?? defaultSoul
        const [inserted] = await db
          .insert(agents)
          .values({
            name: def.name,
            type: def.role,
            description: `[${miniBrainId}] ${def.role}`,
            skills: def.capabilities,
            soul,
          })
          .returning({ id: agents.id })
        if (inserted) ids.push(inserted.id)
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
