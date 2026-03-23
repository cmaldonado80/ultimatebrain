import { router } from '../trpc'
import { checkpointingRouter } from './checkpointing'
import { taskRunnerRouter } from './task-runner'
import { flowsRouter } from './flows'
import { playbooksRouter } from './playbooks'
import { workspacesRouter } from './workspaces'
import { agentsRouter } from './agents'
import { ticketsRouter } from './tickets'
import { projectsRouter } from './projects'
import { memoryRouter } from './memory'
import { approvalsRouter } from './approvals'
import { gatewayRouter } from './gateway'
import { evalsRouter } from './evals'
import { entitiesRouter } from './entities'
import { tracesRouter } from './traces'
import { guardrailsRouter } from './guardrails'
import { orchestrationRouter } from './orchestration'
import { intelligenceRouter } from './intelligence'
import { platformRouter } from './platform'
import { a2aRouter } from './a2a'
import { healingRouter } from './healing'
import { integrationsRouter } from './integrations'
import { mcpRouter } from './mcp'
import { skillsRouter } from './skills'

export const appRouter = router({
  workspaces: workspacesRouter,
  agents: agentsRouter,
  tickets: ticketsRouter,
  projects: projectsRouter,
  memory: memoryRouter,
  approvals: approvalsRouter,
  gateway: gatewayRouter,
  evals: evalsRouter,
  entities: entitiesRouter,
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
})

export type AppRouter = typeof appRouter
