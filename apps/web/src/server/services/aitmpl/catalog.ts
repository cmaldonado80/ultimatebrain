/**
 * Brain Pre-Installed Components Catalog
 *
 * Defines all components that ship with the Brain out of the box:
 * - 12 Brain-level agents (8 AITMPL + 4 custom)
 * - 12 Brain-level skills
 * - 18 Brain-level commands
 * - 8 Brain-level hooks
 * - 14 Brain-level MCP servers (10 pre-installed + 4 one-click)
 */

import type { AgentRecord, SkillRecord, CommandRecord, HookRecord, MCPRecord } from './adapter'

// ── Brain-Level Agents ──────────────────────────────────────────────────

export const BRAIN_AGENTS: AgentRecord[] = [
  // AITMPL-sourced agents
  { type: 'agent', name: 'security-auditor', description: 'Continuous security scanning of all tiers', soul: 'You are a security auditor responsible for scanning all Brain tiers for vulnerabilities, misconfigurations, and policy violations. You run OWASP checks, dependency audits, and secrets detection.', trustScore: 0.9, capabilities: ['security-scan', 'dependency-audit', 'secrets-detection'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'code-reviewer', description: 'Reviews code changes across all connected apps', soul: 'You are a senior code reviewer. You analyze diffs for bugs, security issues, performance problems, and style violations. You provide actionable feedback with severity ratings.', trustScore: 0.9, capabilities: ['code-review', 'multi-file-analysis', 'quality-scoring'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'test-generator', description: 'Generates tests for Brain engines and Mini Brain code', soul: 'You are a test engineer who generates comprehensive unit, integration, and E2E tests. You analyze code coverage gaps and prioritize high-impact test cases.', trustScore: 0.85, capabilities: ['unit-tests', 'integration-tests', 'e2e-tests', 'coverage-analysis'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'documentation-sync', description: 'Keeps docs in sync across tiers', soul: 'You are a documentation specialist. You scan code changes across all tiers and ensure documentation stays current. You generate API docs, update READMEs, and maintain architecture docs.', trustScore: 0.85, capabilities: ['doc-generation', 'api-docs', 'changelog'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'performance-optimizer', description: 'Monitors and optimizes LLM usage, caching, costs', soul: 'You are a performance optimization specialist. You analyze LLM usage patterns, identify caching opportunities, optimize prompt lengths, and recommend model selection to reduce costs while maintaining quality.', trustScore: 0.85, capabilities: ['cost-analysis', 'cache-optimization', 'model-selection', 'prompt-optimization'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'compliance-checker', description: 'GDPR, SOC2, HIPAA policy enforcement', soul: 'You are a compliance officer who enforces regulatory policies across all Brain tiers. You audit data flows for GDPR compliance, verify SOC2 controls, and check HIPAA requirements where applicable.', trustScore: 0.9, capabilities: ['gdpr-audit', 'soc2-audit', 'hipaa-audit', 'policy-enforcement'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'incident-responder', description: 'Auto-responds to health incidents across tiers', soul: 'You are an incident response specialist. When health anomalies are detected, you diagnose root causes, execute remediation playbooks, and escalate when necessary. You maintain incident timelines and post-mortems.', trustScore: 0.9, capabilities: ['diagnosis', 'remediation', 'escalation', 'post-mortem'], guardrails: [], source: 'aitmpl' },
  { type: 'agent', name: 'deploy-manager', description: 'Manages deployments and rollbacks', soul: 'You are a deployment manager. You coordinate deployments across Brain, Mini Brains, and Developments. You manage blue-green deployments, canary releases, and instant rollbacks.', trustScore: 0.8, capabilities: ['deployment', 'rollback', 'canary-release', 'blue-green'], guardrails: [], source: 'aitmpl' },
  // Custom Brain agents
  { type: 'agent', name: 'brain-healer', description: 'Master healer — monitors Mini Brains and escalates', soul: 'You are the Brain\'s master healer. You monitor the health of all Mini Brains and Developments in the hierarchy. You detect anomalies, trigger self-healing procedures, and escalate unresolvable issues to human operators. You maintain the healing cascade: Brain → Mini Brain → Development.', trustScore: 1.0, capabilities: ['health-monitoring', 'self-healing', 'cascade-management', 'escalation'], guardrails: [], source: 'custom' },
  { type: 'agent', name: 'brain-orchestrator', description: 'Routes work across Mini Brains and manages flows', soul: 'You are the Brain\'s central orchestrator. You route tasks to the correct Mini Brain based on domain expertise, manage cross-domain flows, and coordinate multi-Mini-Brain operations. You enforce execution priorities and resource allocation.', trustScore: 1.0, capabilities: ['task-routing', 'flow-management', 'cross-domain-coordination', 'resource-allocation'], guardrails: [], source: 'custom' },
  { type: 'agent', name: 'brain-governor', description: 'Approval gates, RBAC, autonomy level enforcement', soul: 'You are the Brain\'s governance agent. You enforce approval gates for high-risk operations, manage role-based access control across tiers, and enforce autonomy levels. You ensure no agent exceeds its authorized scope.', trustScore: 1.0, capabilities: ['approval-gates', 'rbac', 'autonomy-enforcement', 'audit-logging'], guardrails: [], source: 'custom' },
  { type: 'agent', name: 'brain-evaluator', description: 'Runs eval suites, detects drift, suggests improvements', soul: 'You are the Brain\'s evaluation specialist. You run eval suites against agents, detect quality drift over time, and suggest improvements. You maintain baseline scores and flag regressions. You generate eval reports for each Mini Brain.', trustScore: 1.0, capabilities: ['eval-execution', 'drift-detection', 'baseline-management', 'regression-detection'], guardrails: [], source: 'custom' },
]

// ── Brain-Level Skills ──────────────────────────────────────────────────

export const BRAIN_SKILLS: SkillRecord[] = [
  { type: 'skill', name: 'code-review', description: 'Multi-file code review with quality scoring', content: '', permissions: ['file:read'], assignedAgents: ['code-reviewer'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'test-generation', description: 'Unit/integration/E2E test generation', content: '', permissions: ['file:read', 'file:write'], assignedAgents: ['test-generator'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'security-scan', description: 'OWASP, secrets detection, dependency audit', content: '', permissions: ['file:read', 'shell:execute'], assignedAgents: ['security-auditor'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'documentation', description: 'Auto-generate docs from code', content: '', permissions: ['file:read', 'file:write'], assignedAgents: ['documentation-sync'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'refactoring', description: 'Safe refactoring with impact analysis', content: '', permissions: ['file:read', 'file:write'], assignedAgents: ['code-reviewer'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'debugging', description: 'Root cause analysis with trace inspection', content: '', permissions: ['file:read', 'db:read'], assignedAgents: [], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'performance-analysis', description: 'Bottleneck detection and optimization', content: '', permissions: ['db:read'], assignedAgents: ['performance-optimizer'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'api-design', description: 'OpenAPI spec generation and validation', content: '', permissions: ['file:read', 'file:write'], assignedAgents: [], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'database-migration', description: 'Schema migration planning and execution', content: '', permissions: ['db:read', 'file:write'], assignedAgents: ['deploy-manager'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'prompt-engineering', description: 'Prompt optimization and A/B testing', content: '', permissions: ['llm:invoke'], assignedAgents: ['brain-evaluator'], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'perplexity-search', description: 'Web search with source citation', content: '', permissions: ['network:fetch'], assignedAgents: [], enabled: true, source: 'aitmpl' },
  { type: 'skill', name: 'scientific-analysis', description: 'Data analysis and statistical methods', content: '', permissions: ['file:read', 'llm:invoke'], assignedAgents: [], enabled: true, source: 'aitmpl' },
]

// ── Brain-Level Commands ────────────────────────────────────────────────

export const BRAIN_COMMANDS: CommandRecord[] = [
  { type: 'command', name: 'health', description: 'Full health check across all tiers', trigger: '/health', handler: 'brain.healing.fullCheck()', contexts: ['chat', 'dashboard', 'api'], source: 'custom' },
  { type: 'command', name: 'topology', description: 'Show Brain → Mini Brain → Development tree', trigger: '/topology', handler: 'brain.registry.getTopology()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'costs', description: 'LLM cost breakdown by tier/domain/agent', trigger: '/costs', handler: 'brain.gateway.getCostBreakdown()', contexts: ['chat', 'dashboard', 'api'], source: 'custom' },
  { type: 'command', name: 'audit', description: 'Security + compliance audit', trigger: '/audit', handler: 'brain.agents.invoke("security-auditor", { task: "full-audit" })', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'deploy', description: 'Deploy changes to Mini Brain or Development', trigger: '/deploy', handler: 'brain.agents.invoke("deploy-manager", { task: "deploy" })', contexts: ['chat', 'api'], source: 'custom' },
  { type: 'command', name: 'eval', description: 'Run eval suite on specified scope', trigger: '/eval', handler: 'brain.eval.runSuite()', contexts: ['chat', 'dashboard', 'api'], source: 'custom' },
  { type: 'command', name: 'heal', description: 'Trigger healing scan on target entity', trigger: '/heal', handler: 'brain.healing.scan()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'spawn-mini-brain', description: 'Create new Mini Brain from template', trigger: '/spawn-mini-brain', handler: 'brain.factory.createMiniBrain()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'spawn-development', description: 'Create new Development from Mini Brain template', trigger: '/spawn-development', handler: 'brain.factory.createDevelopment()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'connect', description: 'Wire a new entity to its parent', trigger: '/connect', handler: 'brain.registry.connectEntity()', contexts: ['chat', 'api'], source: 'custom' },
  { type: 'command', name: 'guardrails', description: 'View/edit guardrail policies', trigger: '/guardrails', handler: 'brain.guardrails.listPolicies()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'traces', description: 'Search and view OTel traces', trigger: '/traces', handler: 'brain.traces.search()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'checkpoints', description: 'Browse and restore checkpoints', trigger: '/checkpoints', handler: 'brain.checkpoints.list()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'memory', description: 'Search across memory tiers', trigger: '/memory', handler: 'brain.memory.search()', contexts: ['chat', 'dashboard', 'api'], source: 'custom' },
  { type: 'command', name: 'agents', description: 'List and manage agents across all tiers', trigger: '/agents', handler: 'brain.agents.list()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'skills', description: 'Browse and install skills from AITMPL', trigger: '/skills', handler: 'brain.skills.browse()', contexts: ['chat', 'dashboard'], source: 'custom' },
  { type: 'command', name: 'generate-tests', description: 'Auto-generate tests for current code', trigger: '/generate-tests', handler: 'brain.agents.invoke("test-generator")', contexts: ['chat'], source: 'aitmpl' },
  { type: 'command', name: 'check-security', description: 'Run security scan', trigger: '/check-security', handler: 'brain.agents.invoke("security-auditor")', contexts: ['chat'], source: 'aitmpl' },
]

// ── Brain-Level Hooks ───────────────────────────────────────────────────

export const BRAIN_HOOKS: HookRecord[] = [
  { type: 'hook', event: 'PreToolUse', filter: 'Edit,Write', action: 'Prevent unsafe file modifications', handler: 'guardrails.checkTool()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'PostToolUse', filter: 'Bash', action: 'Audit trail for all shell commands', handler: 'receipt_actions.log() + otel.span()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'PreToolUse', filter: 'agent delegation', action: 'Governance enforcement', handler: 'rbac.check() + autonomy.verify()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'PostToolUse', filter: 'LLM call', action: 'Cost tracking', handler: 'gateway_metrics.record()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'PostToolUse', filter: 'any', action: 'Auto-checkpoint if configured', handler: 'checkpoints.maybeCapture()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'SessionStart', action: 'Load core memory + active context', handler: 'memory.loadCore() + memory.loadActive()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'SessionEnd', action: 'Compact and persist session state', handler: 'memory.compact() + memory.persist()', enabled: true, source: 'custom' },
  { type: 'hook', event: 'SubagentComplete', action: 'Evaluate output quality', handler: 'eval.quickCheck()', enabled: true, source: 'custom' },
]

// ── Brain-Level MCP Servers ─────────────────────────────────────────────

export const BRAIN_MCPS: MCPRecord[] = [
  // Pre-installed
  { type: 'mcp', name: 'filesystem', description: 'File read/write with access controls', endpoint: 'npx -y @modelcontextprotocol/server-filesystem', transport: 'stdio', rateLimit: 500, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'git', description: 'Version control operations', endpoint: 'npx -y @modelcontextprotocol/server-git', transport: 'stdio', rateLimit: 200, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'github', description: 'Repo management, issues, PRs', endpoint: 'npx -y @modelcontextprotocol/server-github', transport: 'stdio', auth: { type: 'bearer', envVar: 'GITHUB_TOKEN' }, rateLimit: 100, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'postgresql', description: 'Natural language SQL queries', endpoint: 'npx -y @modelcontextprotocol/server-postgres', transport: 'stdio', auth: { type: 'api-key', envVar: 'DATABASE_URL' }, rateLimit: 200, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'memory', description: 'Knowledge graph persistent memory', endpoint: 'npx -y @modelcontextprotocol/server-memory', transport: 'stdio', rateLimit: 300, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'sequential-thinking', description: 'Structured reasoning', endpoint: 'npx -y @modelcontextprotocol/server-sequential-thinking', transport: 'stdio', rateLimit: 100, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'playwright', description: 'Browser automation', endpoint: 'npx -y @playwright/mcp', transport: 'stdio', rateLimit: 50, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'duckduckgo-search', description: 'Free web search', endpoint: 'npx -y @aitmpl/mcp-duckduckgo', transport: 'stdio', rateLimit: 60, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'context7', description: 'Version-specific code docs', endpoint: 'npx -y @upstash/context7-mcp', transport: 'stdio', rateLimit: 100, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  { type: 'mcp', name: 'firecrawl', description: 'Web scraping to markdown', endpoint: 'npx -y firecrawl-mcp', transport: 'stdio', auth: { type: 'api-key', envVar: 'FIRECRAWL_API_KEY' }, rateLimit: 30, installMode: 'pre-installed', enabled: true, source: 'aitmpl' },
  // One-click install
  { type: 'mcp', name: 'slack', description: 'Workspace messaging', endpoint: 'npx -y @modelcontextprotocol/server-slack', transport: 'stdio', auth: { type: 'bearer', envVar: 'SLACK_TOKEN' }, rateLimit: 60, installMode: 'one-click', enabled: false, source: 'aitmpl' },
  { type: 'mcp', name: 'notion', description: 'Page/database management', endpoint: 'npx -y @modelcontextprotocol/server-notion', transport: 'stdio', auth: { type: 'bearer', envVar: 'NOTION_TOKEN' }, rateLimit: 60, installMode: 'one-click', enabled: false, source: 'aitmpl' },
  { type: 'mcp', name: 'linear', description: 'Issue tracking', endpoint: 'npx -y @aitmpl/mcp-linear', transport: 'stdio', auth: { type: 'api-key', envVar: 'LINEAR_API_KEY' }, rateLimit: 60, installMode: 'one-click', enabled: false, source: 'aitmpl' },
  { type: 'mcp', name: 'sentry', description: 'Error tracking', endpoint: 'npx -y @sentry/mcp-server', transport: 'stdio', auth: { type: 'bearer', envVar: 'SENTRY_TOKEN' }, rateLimit: 30, installMode: 'one-click', enabled: false, source: 'aitmpl' },
]

// ── Catalog Helpers ─────────────────────────────────────────────────────

export function getAllPreInstalledComponents() {
  return {
    agents: BRAIN_AGENTS,
    skills: BRAIN_SKILLS,
    commands: BRAIN_COMMANDS,
    hooks: BRAIN_HOOKS,
    mcps: BRAIN_MCPS,
    totals: {
      agents: BRAIN_AGENTS.length,
      skills: BRAIN_SKILLS.length,
      commands: BRAIN_COMMANDS.length,
      hooks: BRAIN_HOOKS.length,
      mcps: BRAIN_MCPS.length,
      total: BRAIN_AGENTS.length + BRAIN_SKILLS.length + BRAIN_COMMANDS.length + BRAIN_HOOKS.length + BRAIN_MCPS.length,
    },
  }
}
