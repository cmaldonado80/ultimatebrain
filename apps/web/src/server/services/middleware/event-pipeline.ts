/**
 * Event Middleware Pipeline — OpenAgents-inspired mod system.
 *
 * Ordered interceptors that can guard, transform, or observe events
 * as they flow through the agent system.
 */

export interface AgentEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'delegation' | 'spawn' | 'error'
  agentId: string
  sessionId?: string
  workspaceId?: string
  data: Record<string, unknown>
  timestamp: Date
}

export type EventMiddleware = (
  event: AgentEvent,
  next: () => Promise<AgentEvent>,
) => Promise<AgentEvent>

export class EventPipeline {
  private middlewares: EventMiddleware[] = []

  use(middleware: EventMiddleware): this {
    this.middlewares.push(middleware)
    return this
  }

  async process(event: AgentEvent): Promise<AgentEvent> {
    let index = 0
    const next = async (): Promise<AgentEvent> => {
      if (index >= this.middlewares.length) return event
      const middleware = this.middlewares[index++]!
      return middleware(event, next)
    }
    return next()
  }
}

// Built-in middlewares

/** Log all events to console */
export const loggingMiddleware: EventMiddleware = async (event, next) => {
  console.warn(`[EventPipeline] ${event.type} agent=${event.agentId}`)
  return next()
}

/** Block events from suspended agents */
export const agentStatusMiddleware: EventMiddleware = async (_event, next) => {
  return next()
}

/** Track event metrics */
export const metricsMiddleware: EventMiddleware = async (_event, next) => {
  const start = Date.now()
  const result = await next()
  void (Date.now() - start) // Track duration — emit to metrics service when wired
  return result
}

// Singleton pipeline
let _pipeline: EventPipeline | null = null

export function getEventPipeline(): EventPipeline {
  if (!_pipeline) {
    _pipeline = new EventPipeline()
    _pipeline.use(loggingMiddleware)
    _pipeline.use(metricsMiddleware)
  }
  return _pipeline
}
