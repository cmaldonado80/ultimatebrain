import { router } from '../trpc'
import { a2aRouter } from './a2a'
import { adaptiveRouter } from './adaptive'
import { agentsRouter } from './agents'
import { aitmplRouter } from './aitmpl'
import { alertingRouter } from './alerting'
import { approvalsRouter } from './approvals'
import { astrologyRouter } from './astrology'
import { browserAgentRouter } from './browser-agent'
import { checkpointingRouter } from './checkpointing'
import { deploymentsRouter } from './deployments'
import { engineRegistryRouter } from './engine-registry'
import { entitiesRouter } from './entities'
import { ephemerisRouter } from './ephemeris'
import { evalsRouter } from './evals'
import { flowsRouter } from './flows'
import { gatewayRouter } from './gateway'
import { governanceRouter } from './governance'
import { guardrailsRouter } from './guardrails'
import { healingRouter } from './healing'
import { instinctsRouter } from './instincts'
import { integrationsRouter } from './integrations'
import { intelligenceRouter } from './intelligence'
import { journeysRouter } from './journeys'
import { mcpRouter } from './mcp'
import { memoryRouter } from './memory'
import { miniBrainFactoryRouter } from './mini-brain-factory'
import { modelRegistryRouter } from './model-registry'
import { orchestrationRouter } from './orchestration'
import { organizationsRouter } from './organizations'
import { platformRouter } from './platform'
import { playbooksRouter } from './playbooks'
import { presenceRouter } from './presence'
import { projectsRouter } from './projects'
import { runtimeStatusRouter } from './runtime-status'
import { runtimesRouter } from './runtimes'
import { secretsRouter } from './secrets'
import { skillsRouter } from './skills'
import { systemOrchestratorRouter } from './system-orchestrator'
import { taskRunnerRouter } from './task-runner'
import { ticketsRouter } from './tickets'
import { topologyRouter } from './topology'
import { tracesRouter } from './traces'
import { visualQaRouter } from './visual-qa'
import { workspacesRouter } from './workspaces'

export const appRouter = router({
  workspaces: workspacesRouter,
  agents: agentsRouter,
  tickets: ticketsRouter,
  projects: projectsRouter,
  runtimeStatus: runtimeStatusRouter,
  runtimes: runtimesRouter,
  memory: memoryRouter,
  approvals: approvalsRouter,
  gateway: gatewayRouter,
  governance: governanceRouter,
  evals: evalsRouter,
  entities: entitiesRouter,
  topology: topologyRouter,
  traces: tracesRouter,
  guardrails: guardrailsRouter,
  orchestration: orchestrationRouter,
  intelligence: intelligenceRouter,
  platform: platformRouter,
  a2a: a2aRouter,
  healing: healingRouter,
  integrations: integrationsRouter,
  checkpointing: checkpointingRouter,
  taskRunner: taskRunnerRouter,
  flows: flowsRouter,
  playbooks: playbooksRouter,
  mcp: mcpRouter,
  skills: skillsRouter,
  instincts: instinctsRouter,
  aitmpl: aitmplRouter,
  engineRegistry: engineRegistryRouter,
  browserAgent: browserAgentRouter,
  visualQa: visualQaRouter,
  presence: presenceRouter,
  adaptive: adaptiveRouter,
  alerting: alertingRouter,
  factory: miniBrainFactoryRouter,
  systemOrchestrator: systemOrchestratorRouter,
  models: modelRegistryRouter,
  ephemeris: ephemerisRouter,
  journeys: journeysRouter,
  deployments: deploymentsRouter,
  secrets: secretsRouter,
  organizations: organizationsRouter,
  astrology: astrologyRouter,
})

export type AppRouter = typeof appRouter
