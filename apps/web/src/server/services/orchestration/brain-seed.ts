/**
 * Brain Seed — provisions 10 category workspaces with all 141 agents from
 * https://github.com/VoltAgent/awesome-claude-code-subagents
 *
 * Idempotent — skips workspaces that already exist (matched by name).
 * Also adds missing agents to existing workspaces.
 */

import type { Database } from '@solarc/db'
import { workspaces, agents, workspaceLifecycleEvents } from '@solarc/db'
import { eq, and } from 'drizzle-orm'
import { getAgentSoul } from './agents'

type Cap =
  | 'reasoning'
  | 'agentic'
  | 'coder'
  | 'flash'
  | 'vision'
  | 'multimodal'
  | 'guard'
  | 'judge'
  | 'router'
  | 'embedding'
type AType = 'executor' | 'planner' | 'reviewer' | 'specialist'

// Compact agent definition: [name, type, capability, skills[], description]
type AgentTuple = [string, AType, Cap, string[], string]

interface WorkspaceDef {
  name: string
  type: 'general' | 'development' | 'staging' | 'system'
  goal: string
  icon: string
  agents: AgentTuple[]
}

const W: WorkspaceDef[] = [
  {
    name: 'Core Development',
    type: 'development',
    goal: 'Build and ship production code — APIs, frontends, backends, and microservices',
    icon: 'code',
    agents: [
      [
        'API Designer',
        'planner',
        'coder',
        ['rest', 'graphql', 'openapi', 'api-design'],
        'REST and GraphQL API architect',
      ],
      [
        'Backend Developer',
        'executor',
        'coder',
        ['nodejs', 'typescript', 'postgres', 'api-design'],
        'Server-side expert for scalable APIs',
      ],
      [
        'Electron Pro',
        'specialist',
        'coder',
        ['electron', 'desktop', 'nodejs', 'cross-platform'],
        'Desktop application expert',
      ],
      [
        'Frontend Developer',
        'executor',
        'coder',
        ['react', 'typescript', 'css', 'nextjs'],
        'UI/UX specialist for React, Vue, and Angular',
      ],
      [
        'Full-Stack Developer',
        'executor',
        'agentic',
        ['react', 'nodejs', 'postgres', 'deployment'],
        'End-to-end feature development',
      ],
      [
        'GraphQL Architect',
        'specialist',
        'coder',
        ['graphql', 'federation', 'apollo', 'schema-design'],
        'GraphQL schema and federation expert',
      ],
      [
        'Microservices Architect',
        'planner',
        'reasoning',
        ['microservices', 'distributed-systems', 'event-driven', 'docker'],
        'Distributed systems designer',
      ],
      [
        'Mobile Developer',
        'executor',
        'coder',
        ['react-native', 'ios', 'android', 'cross-platform'],
        'Cross-platform mobile specialist',
      ],
      [
        'UI Designer',
        'specialist',
        'vision',
        ['figma', 'design-systems', 'accessibility', 'prototyping'],
        'Visual design and interaction specialist',
      ],
      [
        'WebSocket Engineer',
        'specialist',
        'coder',
        ['websockets', 'real-time', 'socket.io', 'streaming'],
        'Real-time communication specialist',
      ],
    ],
  },
  {
    name: 'Language Specialists',
    type: 'development',
    goal: 'Deep language-specific expertise for TypeScript, Python, Rust, Go, and more',
    icon: 'languages',
    agents: [
      [
        'TypeScript Pro',
        'specialist',
        'coder',
        ['typescript', 'type-system', 'generics', 'zod'],
        'TypeScript specialist',
      ],
      [
        'SQL Pro',
        'specialist',
        'coder',
        ['sql', 'postgres', 'mysql', 'query-optimization'],
        'Database query expert',
      ],
      [
        'Swift Expert',
        'specialist',
        'coder',
        ['swift', 'ios', 'macos', 'swiftui'],
        'iOS and macOS specialist',
      ],
      [
        'Vue Expert',
        'specialist',
        'coder',
        ['vue', 'composition-api', 'pinia', 'nuxt'],
        'Vue 3 Composition API expert',
      ],
      [
        'Angular Architect',
        'specialist',
        'coder',
        ['angular', 'rxjs', 'ngrx', 'enterprise'],
        'Angular 15+ enterprise patterns expert',
      ],
      [
        'C++ Pro',
        'specialist',
        'coder',
        ['cpp', 'performance', 'memory', 'systems'],
        'C++ performance expert',
      ],
      [
        'C# Developer',
        'specialist',
        'coder',
        ['csharp', 'dotnet', 'aspnet', 'entity-framework'],
        '.NET ecosystem specialist',
      ],
      [
        'Django Developer',
        'specialist',
        'coder',
        ['django', 'python', 'orm', 'rest-framework'],
        'Django 4+ web development expert',
      ],
      [
        '.NET Core Expert',
        'specialist',
        'coder',
        ['dotnet-core', 'aspnet-core', 'blazor', 'grpc'],
        '.NET 8 cross-platform specialist',
      ],
      [
        'Elixir Expert',
        'specialist',
        'coder',
        ['elixir', 'otp', 'phoenix', 'fault-tolerance'],
        'Elixir and OTP fault-tolerant systems expert',
      ],
      [
        'React Native Expert',
        'specialist',
        'coder',
        ['expo', 'react-native', 'mobile', 'navigation'],
        'Expo and React Native mobile development expert',
      ],
      [
        'FastAPI Developer',
        'specialist',
        'coder',
        ['fastapi', 'python', 'async', 'pydantic'],
        'Modern async Python API framework expert',
      ],
      [
        'Flutter Expert',
        'specialist',
        'coder',
        ['flutter', 'dart', 'mobile', 'cross-platform'],
        'Flutter 3+ cross-platform mobile expert',
      ],
      [
        'Go Pro',
        'specialist',
        'coder',
        ['golang', 'concurrency', 'goroutines', 'microservices'],
        'Go concurrency specialist',
      ],
      [
        'Java Architect',
        'specialist',
        'reasoning',
        ['java', 'spring', 'enterprise', 'jvm'],
        'Enterprise Java expert',
      ],
      [
        'JavaScript Pro',
        'specialist',
        'coder',
        ['javascript', 'es2024', 'node', 'browser'],
        'JavaScript development expert',
      ],
      [
        'PowerShell 5.1 Expert',
        'specialist',
        'coder',
        ['powershell', 'windows', 'dotnet-framework', 'automation'],
        'Windows PowerShell 5.1 automation specialist',
      ],
      [
        'PowerShell 7 Expert',
        'specialist',
        'coder',
        ['powershell-7', 'cross-platform', 'dotnet-core', 'automation'],
        'Cross-platform PowerShell 7+ automation specialist',
      ],
      [
        'Kotlin Specialist',
        'specialist',
        'coder',
        ['kotlin', 'android', 'coroutines', 'jvm'],
        'Modern JVM language expert',
      ],
      [
        'Laravel Specialist',
        'specialist',
        'coder',
        ['laravel', 'php', 'eloquent', 'blade'],
        'Laravel 10+ PHP framework expert',
      ],
      [
        'Next.js Developer',
        'specialist',
        'coder',
        ['nextjs', 'react', 'server-components', 'app-router'],
        'Next.js 14+ full-stack specialist',
      ],
      [
        'PHP Pro',
        'specialist',
        'coder',
        ['php', 'composer', 'psr', 'symfony'],
        'PHP web development expert',
      ],
      [
        'Python Pro',
        'specialist',
        'coder',
        ['python', 'asyncio', 'typing', 'packaging'],
        'Python ecosystem master',
      ],
      [
        'Rails Expert',
        'specialist',
        'coder',
        ['rails', 'ruby', 'activerecord', 'hotwire'],
        'Rails 8.1 rapid development expert',
      ],
      [
        'React Specialist',
        'specialist',
        'coder',
        ['react', 'hooks', 'server-components', 'suspense'],
        'React 18+ modern patterns expert',
      ],
      [
        'Rust Engineer',
        'specialist',
        'coder',
        ['rust', 'ownership', 'async', 'wasm'],
        'Systems programming expert',
      ],
      [
        'Spring Boot Engineer',
        'specialist',
        'coder',
        ['spring-boot', 'java', 'microservices', 'jpa'],
        'Spring Boot 3+ microservices expert',
      ],
    ],
  },
  {
    name: 'Infrastructure',
    type: 'staging',
    goal: 'DevOps, cloud deployment, CI/CD, and infrastructure automation',
    icon: 'cloud',
    agents: [
      [
        'Azure Infra Engineer',
        'specialist',
        'agentic',
        ['azure', 'az-powershell', 'arm-templates', 'devops'],
        'Azure infrastructure and Az PowerShell automation expert',
      ],
      [
        'Cloud Architect',
        'planner',
        'reasoning',
        ['aws', 'gcp', 'azure', 'multi-cloud'],
        'AWS/GCP/Azure specialist',
      ],
      [
        'Database Administrator',
        'specialist',
        'coder',
        ['postgres', 'mysql', 'redis', 'replication'],
        'Database management expert',
      ],
      [
        'Docker Expert',
        'specialist',
        'agentic',
        ['docker', 'dockerfile', 'compose', 'optimization'],
        'Docker containerization and optimization expert',
      ],
      [
        'Deployment Engineer',
        'executor',
        'agentic',
        ['deployment', 'blue-green', 'canary', 'rollback'],
        'Deployment automation specialist',
      ],
      [
        'DevOps Engineer',
        'executor',
        'agentic',
        ['ci-cd', 'github-actions', 'terraform', 'docker'],
        'CI/CD and automation expert',
      ],
      [
        'DevOps Incident Responder',
        'executor',
        'flash',
        ['incident-response', 'monitoring', 'alerting', 'runbooks'],
        'DevOps incident management',
      ],
      [
        'Incident Responder',
        'executor',
        'flash',
        ['incident-response', 'triage', 'communication', 'post-mortem'],
        'System incident response expert',
      ],
      [
        'Kubernetes Specialist',
        'specialist',
        'agentic',
        ['kubernetes', 'helm', 'gitops', 'service-mesh'],
        'Container orchestration master',
      ],
      [
        'Network Engineer',
        'specialist',
        'coder',
        ['networking', 'dns', 'load-balancing', 'vpn'],
        'Network infrastructure specialist',
      ],
      [
        'Platform Engineer',
        'planner',
        'reasoning',
        ['platform', 'developer-portal', 'self-service', 'idp'],
        'Platform architecture expert',
      ],
      [
        'Security Engineer',
        'specialist',
        'guard',
        ['security', 'iam', 'encryption', 'compliance'],
        'Infrastructure security specialist',
      ],
      [
        'SRE Engineer',
        'specialist',
        'agentic',
        ['sre', 'observability', 'slo', 'error-budgets'],
        'Site reliability engineering expert',
      ],
      [
        'Terraform Engineer',
        'specialist',
        'coder',
        ['terraform', 'hcl', 'state-management', 'modules'],
        'Infrastructure as Code expert',
      ],
      [
        'Terragrunt Expert',
        'specialist',
        'coder',
        ['terragrunt', 'dry-iac', 'multi-env', 'modules'],
        'Terragrunt orchestration and DRY IaC specialist',
      ],
      [
        'Windows Infra Admin',
        'specialist',
        'agentic',
        ['active-directory', 'dns', 'dhcp', 'gpo'],
        'Active Directory, DNS, DHCP, and GPO automation specialist',
      ],
    ],
  },
  {
    name: 'Quality & Security',
    type: 'system',
    goal: 'Testing, security auditing, code review, and quality assurance',
    icon: 'shield',
    agents: [
      [
        'Accessibility Tester',
        'reviewer',
        'vision',
        ['a11y', 'wcag', 'screen-readers', 'aria'],
        'A11y compliance expert',
      ],
      [
        'AD Security Reviewer',
        'reviewer',
        'guard',
        ['active-directory', 'gpo-audit', 'security', 'compliance'],
        'Active Directory security and GPO audit specialist',
      ],
      [
        'Architect Reviewer',
        'reviewer',
        'reasoning',
        ['architecture', 'design-review', 'patterns', 'scalability'],
        'Architecture review specialist',
      ],
      [
        'Chaos Engineer',
        'specialist',
        'agentic',
        ['chaos-engineering', 'resilience', 'fault-injection', 'gameday'],
        'System resilience testing expert',
      ],
      [
        'Code Reviewer',
        'reviewer',
        'reasoning',
        ['code-review', 'best-practices', 'performance', 'maintainability'],
        'Code quality guardian',
      ],
      [
        'Compliance Auditor',
        'reviewer',
        'guard',
        ['compliance', 'gdpr', 'sox', 'hipaa'],
        'Regulatory compliance expert',
      ],
      [
        'Debugger',
        'executor',
        'flash',
        ['debugging', 'profiling', 'stack-traces', 'root-cause'],
        'Advanced debugging specialist',
      ],
      [
        'Error Detective',
        'executor',
        'flash',
        ['error-analysis', 'logs', 'monitoring', 'resolution'],
        'Error analysis and resolution expert',
      ],
      [
        'Penetration Tester',
        'specialist',
        'guard',
        ['pentesting', 'owasp', 'burpsuite', 'vulnerability-scan'],
        'Ethical hacking specialist',
      ],
      [
        'Performance Engineer',
        'specialist',
        'reasoning',
        ['performance', 'profiling', 'benchmarking', 'optimization'],
        'Performance optimization expert',
      ],
      [
        'PS Security Hardening',
        'specialist',
        'guard',
        ['powershell-security', 'hardening', 'jea', 'constrained-language'],
        'PowerShell security hardening specialist',
      ],
      [
        'QA Expert',
        'reviewer',
        'agentic',
        ['testing', 'jest', 'playwright', 'e2e'],
        'Test automation specialist',
      ],
      [
        'Security Auditor',
        'reviewer',
        'guard',
        ['security-audit', 'owasp', 'auth', 'crypto'],
        'Security vulnerability expert',
      ],
      [
        'Test Automator',
        'executor',
        'agentic',
        ['test-automation', 'ci', 'coverage', 'frameworks'],
        'Test automation framework expert',
      ],
    ],
  },
  {
    name: 'Data & AI',
    type: 'development',
    goal: 'Machine learning, data science, analytics, and AI/ML engineering',
    icon: 'brain',
    agents: [
      [
        'AI Engineer',
        'specialist',
        'reasoning',
        ['ai-systems', 'model-deployment', 'inference', 'optimization'],
        'AI system design and deployment expert',
      ],
      [
        'Data Analyst',
        'specialist',
        'reasoning',
        ['sql', 'visualization', 'dashboards', 'insights'],
        'Data insights and visualization specialist',
      ],
      [
        'Data Engineer',
        'executor',
        'coder',
        ['etl', 'spark', 'airflow', 'data-pipelines'],
        'Data pipeline architect',
      ],
      [
        'Data Scientist',
        'specialist',
        'reasoning',
        ['statistics', 'python', 'ml', 'experimentation'],
        'Analytics and insights expert',
      ],
      [
        'Database Optimizer',
        'specialist',
        'coder',
        ['query-optimization', 'indexing', 'postgres', 'explain-analyze'],
        'Database performance specialist',
      ],
      [
        'LLM Architect',
        'planner',
        'reasoning',
        ['llm', 'fine-tuning', 'rag', 'prompt-engineering'],
        'Large language model architect',
      ],
      [
        'ML Engineer',
        'specialist',
        'reasoning',
        ['pytorch', 'tensorflow', 'mlops', 'feature-engineering'],
        'Machine learning systems expert',
      ],
      [
        'MLOps Engineer',
        'executor',
        'agentic',
        ['mlops', 'model-registry', 'a-b-testing', 'monitoring'],
        'MLOps and model deployment expert',
      ],
      [
        'NLP Engineer',
        'specialist',
        'reasoning',
        ['nlp', 'transformers', 'embeddings', 'tokenization'],
        'Natural language processing expert',
      ],
      [
        'Postgres Pro',
        'specialist',
        'coder',
        ['postgresql', 'extensions', 'replication', 'performance'],
        'PostgreSQL database expert',
      ],
      [
        'Prompt Engineer',
        'specialist',
        'reasoning',
        ['prompt-engineering', 'few-shot', 'chain-of-thought', 'evaluation'],
        'Prompt optimization specialist',
      ],
      [
        'RL Engineer',
        'specialist',
        'reasoning',
        ['reinforcement-learning', 'agents', 'reward-shaping', 'simulation'],
        'Reinforcement learning and agent training expert',
      ],
    ],
  },
  {
    name: 'Developer Experience',
    type: 'general',
    goal: 'Tooling, documentation, refactoring, and developer productivity',
    icon: 'tools',
    agents: [
      [
        'Build Engineer',
        'executor',
        'coder',
        ['webpack', 'vite', 'turbo', 'build-systems'],
        'Build system specialist',
      ],
      [
        'CLI Developer',
        'executor',
        'coder',
        ['cli', 'commander', 'yargs', 'ux'],
        'Command-line tool creator',
      ],
      [
        'Dependency Manager',
        'specialist',
        'flash',
        ['npm', 'pnpm', 'yarn', 'dependency-audit'],
        'Package and dependency specialist',
      ],
      [
        'Documentation Engineer',
        'specialist',
        'agentic',
        ['docs', 'markdown', 'docusaurus', 'api-docs'],
        'Technical documentation expert',
      ],
      [
        'DX Optimizer',
        'specialist',
        'reasoning',
        ['dx', 'onboarding', 'dev-tools', 'productivity'],
        'Developer experience optimization specialist',
      ],
      [
        'Git Workflow Manager',
        'specialist',
        'flash',
        ['git', 'branching', 'pr-review', 'monorepo'],
        'Git workflow and branching expert',
      ],
      [
        'Legacy Modernizer',
        'specialist',
        'reasoning',
        ['legacy-code', 'migration', 'modernization', 'strangler-fig'],
        'Legacy code modernization specialist',
      ],
      [
        'MCP Developer',
        'specialist',
        'coder',
        ['mcp', 'model-context-protocol', 'tool-use', 'servers'],
        'Model Context Protocol specialist',
      ],
      [
        'PS UI Architect',
        'specialist',
        'coder',
        ['powershell-ui', 'winforms', 'wpf', 'tui'],
        'PowerShell UI/UX specialist',
      ],
      [
        'PS Module Architect',
        'specialist',
        'coder',
        ['powershell-modules', 'profiles', 'packaging', 'psgallery'],
        'PowerShell module and profile architect',
      ],
      [
        'Refactoring Specialist',
        'specialist',
        'reasoning',
        ['refactoring', 'patterns', 'code-smells', 'incremental'],
        'Code refactoring expert',
      ],
      [
        'Slack Expert',
        'specialist',
        'coder',
        ['slack', 'bolt', 'blocks', 'integrations'],
        'Slack platform and @slack/bolt specialist',
      ],
      [
        'Tooling Engineer',
        'executor',
        'coder',
        ['dev-tools', 'linters', 'formatters', 'code-generation'],
        'Developer tooling specialist',
      ],
    ],
  },
  {
    name: 'Specialized Domains',
    type: 'general',
    goal: 'Niche technologies — blockchain, game dev, fintech, IoT, and more',
    icon: 'star',
    agents: [
      [
        'API Documenter',
        'specialist',
        'coder',
        ['openapi', 'swagger', 'postman', 'api-docs'],
        'API documentation specialist',
      ],
      [
        'Blockchain Developer',
        'specialist',
        'coder',
        ['solidity', 'ethereum', 'web3', 'smart-contracts'],
        'Web3 and crypto specialist',
      ],
      [
        'Embedded Systems',
        'specialist',
        'coder',
        ['embedded', 'rtos', 'c', 'firmware'],
        'Embedded and real-time systems expert',
      ],
      [
        'Fintech Engineer',
        'specialist',
        'reasoning',
        ['payments', 'trading', 'compliance', 'precision-math'],
        'Financial technology specialist',
      ],
      [
        'Game Developer',
        'specialist',
        'coder',
        ['unity', 'unreal', 'game-design', 'physics'],
        'Game development expert',
      ],
      [
        'IoT Engineer',
        'specialist',
        'coder',
        ['iot', 'mqtt', 'edge-computing', 'sensors'],
        'IoT systems developer',
      ],
      [
        'M365 Admin',
        'specialist',
        'agentic',
        ['microsoft-365', 'exchange', 'teams', 'sharepoint'],
        'Microsoft 365 administration specialist',
      ],
      [
        'Mobile App Developer',
        'executor',
        'coder',
        ['mobile', 'ios', 'android', 'app-store'],
        'Mobile application specialist',
      ],
      [
        'Payment Integration',
        'specialist',
        'coder',
        ['stripe', 'payments', 'webhooks', 'pci-dss'],
        'Payment systems expert',
      ],
      [
        'Quant Analyst',
        'specialist',
        'reasoning',
        ['quantitative', 'algorithms', 'backtesting', 'risk-models'],
        'Quantitative analysis specialist',
      ],
      [
        'Risk Manager',
        'specialist',
        'reasoning',
        ['risk-assessment', 'mitigation', 'compliance', 'frameworks'],
        'Risk assessment and management expert',
      ],
      [
        'SEO Specialist',
        'specialist',
        'flash',
        ['seo', 'schema-markup', 'core-web-vitals', 'analytics'],
        'Search engine optimization expert',
      ],
    ],
  },
  {
    name: 'Business & Product',
    type: 'general',
    goal: 'Product strategy, business analysis, UX research, and requirements',
    icon: 'briefcase',
    agents: [
      [
        'Business Analyst',
        'planner',
        'reasoning',
        ['requirements', 'process-modeling', 'specifications', 'stakeholders'],
        'Requirements specialist',
      ],
      [
        'Content Marketer',
        'executor',
        'agentic',
        ['content-marketing', 'copywriting', 'seo-content', 'social'],
        'Content marketing specialist',
      ],
      [
        'Customer Success Manager',
        'specialist',
        'reasoning',
        ['customer-success', 'onboarding', 'retention', 'nps'],
        'Customer success expert',
      ],
      [
        'Legal Advisor',
        'reviewer',
        'reasoning',
        ['legal', 'contracts', 'compliance', 'ip'],
        'Legal and compliance specialist',
      ],
      [
        'Product Manager',
        'planner',
        'reasoning',
        ['product-strategy', 'user-stories', 'roadmapping', 'metrics'],
        'Product strategy expert',
      ],
      [
        'Project Manager',
        'planner',
        'agentic',
        ['project-management', 'gantt', 'risk', 'stakeholders'],
        'Project management specialist',
      ],
      [
        'Sales Engineer',
        'specialist',
        'reasoning',
        ['technical-sales', 'demos', 'poc', 'solution-architecture'],
        'Technical sales expert',
      ],
      [
        'Scrum Master',
        'specialist',
        'agentic',
        ['agile', 'scrum', 'retrospectives', 'velocity'],
        'Agile methodology expert',
      ],
      [
        'Technical Writer',
        'specialist',
        'agentic',
        ['technical-writing', 'manuals', 'api-docs', 'tutorials'],
        'Technical documentation specialist',
      ],
      [
        'UX Researcher',
        'reviewer',
        'reasoning',
        ['ux-research', 'usability-testing', 'interviews', 'personas'],
        'User research expert',
      ],
      [
        'WordPress Master',
        'specialist',
        'coder',
        ['wordpress', 'php', 'themes', 'plugins'],
        'WordPress development and optimization expert',
      ],
    ],
  },
  {
    name: 'Meta & Orchestration',
    type: 'system',
    goal: 'Multi-agent coordination, task routing, and workflow automation',
    icon: 'network',
    agents: [
      [
        'Agent Installer',
        'executor',
        'agentic',
        ['agent-install', 'github', 'marketplace', 'configuration'],
        'Browse and install agents from repository',
      ],
      [
        'Agent Organizer',
        'executor',
        'router',
        ['agent-management', 'coordination', 'hierarchy', 'roles'],
        'Multi-agent coordinator',
      ],
      [
        'Context Manager',
        'specialist',
        'flash',
        ['context-optimization', 'token-management', 'summarization', 'pruning'],
        'Context optimization expert',
      ],
      [
        'Error Coordinator',
        'executor',
        'flash',
        ['error-handling', 'recovery', 'retry', 'escalation'],
        'Error handling and recovery specialist',
      ],
      [
        'IT Ops Orchestrator',
        'executor',
        'agentic',
        ['it-ops', 'automation', 'runbooks', 'incident-management'],
        'IT operations workflow orchestration specialist',
      ],
      [
        'Knowledge Synthesizer',
        'specialist',
        'reasoning',
        ['knowledge-aggregation', 'synthesis', 'cross-domain', 'insights'],
        'Knowledge aggregation expert',
      ],
      [
        'Multi-Agent Coordinator',
        'executor',
        'router',
        ['multi-agent', 'coordination', 'delegation', 'a2a'],
        'Advanced multi-agent orchestration',
      ],
      [
        'Performance Monitor',
        'specialist',
        'flash',
        ['agent-performance', 'metrics', 'optimization', 'cost'],
        'Agent performance optimization',
      ],
      [
        'Pied Piper',
        'executor',
        'router',
        ['sdlc', 'team-orchestration', 'workflows', 'automation'],
        'Orchestrate team of AI subagents for SDLC workflows',
      ],
      [
        'Task Distributor',
        'executor',
        'router',
        ['task-routing', 'load-balancing', 'priority', 'scheduling'],
        'Task allocation specialist',
      ],
      [
        'Taskade',
        'specialist',
        'agentic',
        ['workspace', 'collaboration', 'mcp', 'workflow-automation'],
        'AI-powered workspace with autonomous agents',
      ],
      [
        'Workflow Orchestrator',
        'planner',
        'agentic',
        ['workflow', 'dag', 'parallel', 'conditional'],
        'Complex workflow automation',
      ],
    ],
  },
  {
    name: 'Research & Analysis',
    type: 'general',
    goal: 'Information gathering, trend analysis, and competitive intelligence',
    icon: 'search',
    agents: [
      [
        'Research Analyst',
        'specialist',
        'reasoning',
        ['research', 'analysis', 'synthesis', 'reports'],
        'Comprehensive research specialist',
      ],
      [
        'Search Specialist',
        'executor',
        'agentic',
        ['search', 'information-retrieval', 'ranking', 'filtering'],
        'Advanced information retrieval expert',
      ],
      [
        'Trend Analyst',
        'specialist',
        'reasoning',
        ['trends', 'forecasting', 'emerging-tech', 'market-signals'],
        'Emerging trends and forecasting expert',
      ],
      [
        'Competitive Analyst',
        'specialist',
        'reasoning',
        ['competitive-intel', 'market-mapping', 'product-comparison', 'swot'],
        'Competitive intelligence specialist',
      ],
      [
        'Market Researcher',
        'specialist',
        'reasoning',
        ['market-research', 'consumer-insights', 'segmentation', 'surveys'],
        'Market analysis and consumer insights',
      ],
      [
        'Data Researcher',
        'executor',
        'agentic',
        ['data-discovery', 'datasets', 'analysis', 'verification'],
        'Data discovery and analysis expert',
      ],
      [
        'Scientific Researcher',
        'specialist',
        'reasoning',
        ['scientific-literature', 'papers', 'evidence-synthesis', 'citations'],
        'Scientific paper search and evidence synthesis',
      ],
    ],
  },
  {
    name: 'Astrology & Ephemeris',
    type: 'general',
    goal: 'Astrological computation, chart interpretation, predictive timing, and report generation using the Swiss Ephemeris engine',
    icon: 'astrology',
    agents: [
      [
        'Natal Chart Reader',
        'specialist',
        'reasoning',
        [
          'natal-charts',
          'planetary-positions',
          'house-interpretation',
          'aspect-analysis',
          'dignity-assessment',
        ],
        'Computes and interprets full natal charts using the Swiss Ephemeris engine. Analyzes planetary positions, house placements, aspects, dignities, chart shape, and dominant element/mode to provide comprehensive birth chart readings.',
      ],
      [
        'Transit Analyst',
        'specialist',
        'reasoning',
        [
          'transit-tracking',
          'solar-returns',
          'transit-calendar',
          'predictive-timing',
          'lunar-returns',
        ],
        'Tracks planetary transits, computes solar and lunar returns, generates transit calendars, and provides predictive timing analysis. Specializes in identifying significant upcoming astrological events.',
      ],
      [
        'Vedic Astrologer',
        'specialist',
        'reasoning',
        [
          'panchanga',
          'vimshottari-dasha',
          'divisional-charts',
          'shadbala',
          'nakshatra-analysis',
          'ashtakavarga',
        ],
        'Vedic/Jyotish specialist. Calculates Panchanga (tithi, vara, nakshatra, yoga, karana), Vimshottari Dasha periods, 16 divisional charts (Shodashavarga), Shadbala strength, Ashtakavarga, and Chara Karakas.',
      ],
      [
        'Synastry & Composite Reader',
        'specialist',
        'reasoning',
        ['synastry', 'composite-charts', 'relationship-analysis', 'compatibility'],
        'Relationship astrology specialist. Computes synastry aspects between two charts and composite midpoint charts. Analyzes compatibility, attraction patterns, and relationship dynamics.',
      ],
      [
        'Classical Astrologer',
        'specialist',
        'reasoning',
        [
          'essential-dignities',
          'arabic-parts',
          'firdaria',
          'zodiacal-releasing',
          'profections',
          'sect-analysis',
          'fixed-stars',
        ],
        'Traditional/Hellenistic astrology specialist. Assesses essential and accidental dignities, Arabic Parts/Lots, Firdaria, Zodiacal Releasing, annual profections, sect analysis, primary directions, and fixed star conjunctions.',
      ],
      [
        'Astrology Report Generator',
        'planner',
        'reasoning',
        [
          'report-generation',
          'chart-synthesis',
          'multi-section-reports',
          'interpretation-compilation',
        ],
        'Orchestrates multiple astrology agents to produce comprehensive natal reports. Coordinates chart computation, pattern analysis, predictive timing, and dignities into a single cohesive reading with interpretive text.',
      ],
    ],
  },
]

/** Generate a soul (system prompt) from agent definition.
 *  First checks for a rich MD definition file; falls back to a compact prompt. */
function makeSoul(name: string, desc: string, skills: string[]): string {
  const rich = getAgentSoul(name)
  if (rich?.soul) return rich.soul
  return `You are ${name}, a specialized AI agent. ${desc}. Your core skills: ${skills.join(', ')}. Be precise, thorough, and actionable in your responses.`
}

/**
 * Seed the brain with 10 category workspaces and 141 agents.
 * Idempotent — skips workspaces that already exist, adds missing agents.
 */
export async function seedBrainWorkspaces(db: Database): Promise<{
  workspacesCreated: number
  agentsCreated: number
  skipped: string[]
}> {
  let workspacesCreated = 0
  let agentsCreated = 0
  const skipped: string[] = []

  // Find system orchestrator for parent linking
  const systemWs = await db.query.workspaces.findFirst({
    where: eq(workspaces.isSystemProtected, true),
  })
  let parentOrchestratorId: string | null = null
  if (systemWs) {
    const systemOrch = await db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, systemWs.id), eq(agents.isWsOrchestrator, true)),
    })
    parentOrchestratorId = systemOrch?.id ?? null
  }

  for (const wsDef of W) {
    // Check if workspace already exists
    let ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.name, wsDef.name),
    })

    if (ws) {
      // Workspace exists — add any missing agents
      const existingAgents = await db.query.agents.findMany({
        where: eq(agents.workspaceId, ws.id),
      })
      const existingNames = new Set(existingAgents.map((a) => a.name))

      for (const [name, type, cap, skills, desc] of wsDef.agents) {
        if (existingNames.has(name)) continue
        const richDef = getAgentSoul(name)
        await db.insert(agents).values({
          name,
          type,
          workspaceId: ws.id,
          description: richDef?.description || desc,
          soul: makeSoul(name, desc, skills),
          requiredModelType: cap,
          skills,
          tags: [wsDef.name.toLowerCase().replace(/\s+/g, '-'), type],
          toolAccess: richDef?.tools ?? [],
        })
        agentsCreated++
      }
      skipped.push(wsDef.name)
      continue
    }

    // Create workspace
    const [created] = await db
      .insert(workspaces)
      .values({
        name: wsDef.name,
        type: wsDef.type,
        goal: wsDef.goal,
        icon: wsDef.icon,
      })
      .returning()
    if (!created) continue
    ws = created
    workspacesCreated++

    // Log lifecycle event
    await db.insert(workspaceLifecycleEvents).values({
      workspaceId: ws.id,
      eventType: 'created',
      toState: 'draft',
      payload: { name: ws.name, type: ws.type, seededBy: 'brain-seed' },
    })

    // Create orchestrator
    await db.insert(agents).values({
      name: `${wsDef.name} Orchestrator`,
      type: 'orchestrator',
      workspaceId: ws.id,
      isWsOrchestrator: true,
      parentOrchestratorId,
      description: `Orchestrator for ${wsDef.name} — coordinates all agents within this domain.`,
      soul: `You are the orchestrator for the ${wsDef.name} workspace. Coordinate agents, route tasks to the best specialist, monitor progress, and escalate when needed. Goal: ${wsDef.goal}`,
      skills: ['coordination', 'task-routing', 'monitoring', 'escalation'],
      requiredModelType: 'router',
      tags: ['orchestrator', wsDef.name.toLowerCase().replace(/\s+/g, '-')],
    })

    // Create all agents
    for (const [name, type, cap, skills, desc] of wsDef.agents) {
      const richDef = getAgentSoul(name)
      await db.insert(agents).values({
        name,
        type,
        workspaceId: ws.id,
        description: richDef?.description || desc,
        soul: makeSoul(name, desc, skills),
        requiredModelType: cap,
        skills,
        tags: [wsDef.name.toLowerCase().replace(/\s+/g, '-'), type],
        toolAccess: richDef?.tools ?? [],
      })
      agentsCreated++
    }
  }

  return { workspacesCreated, agentsCreated, skipped }
}
