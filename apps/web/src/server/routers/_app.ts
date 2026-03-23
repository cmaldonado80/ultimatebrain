import { router } from '../trpc'
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
})

export type AppRouter = typeof appRouter
