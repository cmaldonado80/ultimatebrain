import { createDb } from './index'
import {
  workspaces,
  agents,
  tickets,
  memories,
  evalDatasets,
  evalCases,
  channels,
  brainEntities,
} from './schema/index'

async function seed() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }

  const db = createDb(connectionString)
  console.log('Seeding database...')

  try {
    await db.transaction(async (tx) => {
      // -------------------------------------------------------
      // 1. Workspace
      // -------------------------------------------------------
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name: 'Dev Workspace',
          type: 'development',
          goal: 'Local development and testing workspace',
          color: '#6366f1',
          icon: 'brain',
          autonomyLevel: 3,
          settings: { notifications: true, autoAssign: true },
        })
        .returning()

      console.log(`  ✓ Workspace: ${workspace.id}`)

      // -------------------------------------------------------
      // 2. Agents (planner, executor, reviewer)
      // -------------------------------------------------------
      const [planner, executor, reviewer] = await tx
        .insert(agents)
        .values([
          {
            name: 'Planner',
            type: 'planner',
            workspaceId: workspace.id,
            status: 'idle',
            model: 'claude-sonnet-4-20250514',
            color: '#8b5cf6',
            bg: '#ede9fe',
            description: 'Breaks down goals into actionable tickets and execution plans',
            tags: ['planning', 'strategy'],
            skills: ['decomposition', 'prioritization', 'dependency-analysis'],
            isWsOrchestrator: true,
            triggerMode: 'auto',
          },
          {
            name: 'Executor',
            type: 'executor',
            workspaceId: workspace.id,
            status: 'executing',
            model: 'claude-sonnet-4-20250514',
            color: '#10b981',
            bg: '#d1fae5',
            description: 'Executes tasks autonomously using available tools',
            tags: ['execution', 'coding'],
            skills: ['code-generation', 'file-ops', 'testing'],
            isWsOrchestrator: false,
            triggerMode: 'auto',
          },
          {
            name: 'Reviewer',
            type: 'reviewer',
            workspaceId: workspace.id,
            status: 'reviewing',
            model: 'claude-sonnet-4-20250514',
            color: '#f59e0b',
            bg: '#fef3c7',
            description: 'Reviews completed work for quality, correctness, and safety',
            tags: ['review', 'qa'],
            skills: ['code-review', 'testing', 'security-audit'],
            isWsOrchestrator: false,
            triggerMode: 'on-demand',
          },
        ])
        .returning()

      console.log(`  ✓ Agents: ${planner.id}, ${executor.id}, ${reviewer.id}`)

      // -------------------------------------------------------
      // 3. Tickets (5 with various statuses)
      // -------------------------------------------------------
      const insertedTickets = await tx
        .insert(tickets)
        .values([
          {
            title: 'Set up project scaffolding',
            description: 'Initialize monorepo structure with turborepo, configure shared packages',
            status: 'done',
            priority: 'high',
            complexity: 'medium',
            executionMode: 'autonomous',
            workspaceId: workspace.id,
            assignedAgentId: executor.id,
            result: 'Monorepo scaffolding complete with packages/api, packages/db, packages/ui',
          },
          {
            title: 'Implement agent message bus',
            description: 'Build inter-agent communication layer with pub/sub and direct messaging',
            status: 'in_progress',
            priority: 'high',
            complexity: 'hard',
            executionMode: 'deep_work',
            workspaceId: workspace.id,
            assignedAgentId: executor.id,
            metadata: { branch: 'feat/agent-bus', filesChanged: 12 },
          },
          {
            title: 'Design memory consolidation pipeline',
            description: 'Plan the recall→core promotion pathway with confidence scoring',
            status: 'queued',
            priority: 'medium',
            complexity: 'hard',
            executionMode: 'autonomous',
            workspaceId: workspace.id,
            assignedAgentId: planner.id,
          },
          {
            title: 'Add retry logic to tool executor',
            description: 'Implement exponential backoff and circuit-breaker for external tool calls',
            status: 'failed',
            priority: 'critical',
            complexity: 'medium',
            executionMode: 'quick',
            workspaceId: workspace.id,
            assignedAgentId: executor.id,
            result: 'Error: timeout connecting to tool-registry service',
            metadata: { retryCount: 3, lastError: 'ECONNREFUSED' },
          },
          {
            title: 'Review checkpoint restore implementation',
            description: 'Verify checkpoint save/restore handles partial state and edge cases correctly',
            status: 'review',
            priority: 'medium',
            complexity: 'medium',
            executionMode: 'autonomous',
            workspaceId: workspace.id,
            assignedAgentId: reviewer.id,
          },
        ])
        .returning()

      console.log(`  ✓ Tickets: ${insertedTickets.length} created`)

      // -------------------------------------------------------
      // 4. Eval dataset + 3 eval cases
      // -------------------------------------------------------
      const [dataset] = await tx
        .insert(evalDatasets)
        .values({
          name: 'Agent Routing Accuracy',
          description: 'Evaluates whether the orchestrator routes tasks to the correct agent type',
        })
        .returning()

      const insertedCases = await tx
        .insert(evalCases)
        .values([
          {
            datasetId: dataset.id,
            input: { task: 'Write unit tests for the auth module', context: 'testing' },
            expectedOutput: { assignedType: 'executor', confidence: 0.95 },
          },
          {
            datasetId: dataset.id,
            input: { task: 'Break down the Q3 roadmap into milestones', context: 'strategy' },
            expectedOutput: { assignedType: 'planner', confidence: 0.9 },
          },
          {
            datasetId: dataset.id,
            input: { task: 'Audit the PR for security vulnerabilities', context: 'security' },
            expectedOutput: { assignedType: 'reviewer', confidence: 0.92 },
          },
        ])
        .returning()

      console.log(`  ✓ Eval dataset: ${dataset.id} with ${insertedCases.length} cases`)

      // -------------------------------------------------------
      // 5. Memories (5 entries across tiers)
      // -------------------------------------------------------
      const insertedMemories = await tx
        .insert(memories)
        .values([
          {
            key: 'project.architecture',
            content: 'The system uses a monorepo with turborepo. Core packages: api, db, ui, shared.',
            source: planner.id,
            confidence: 0.95,
            workspaceId: workspace.id,
            tier: 'core',
          },
          {
            key: 'convention.naming',
            content: 'All database tables use snake_case. TypeScript interfaces use PascalCase.',
            source: reviewer.id,
            confidence: 0.9,
            workspaceId: workspace.id,
            tier: 'core',
          },
          {
            key: 'task.agent-bus.progress',
            content: 'Agent message bus implementation is 60% complete. PubSub layer done, direct messaging pending.',
            source: executor.id,
            confidence: 0.8,
            workspaceId: workspace.id,
            tier: 'recall',
          },
          {
            key: 'incident.tool-registry-outage',
            content: 'Tool registry service experienced 15min outage due to connection pool exhaustion. Resolved by increasing pool size.',
            source: executor.id,
            confidence: 0.7,
            workspaceId: workspace.id,
            tier: 'recall',
          },
          {
            key: 'decision.checkpoint-format',
            content: 'Team decided to use JSON-based checkpoints over protobuf for easier debugging during development phase.',
            source: planner.id,
            confidence: 0.6,
            workspaceId: workspace.id,
            tier: 'archival',
          },
        ])
        .returning()

      console.log(`  ✓ Memories: ${insertedMemories.length} created`)

      // -------------------------------------------------------
      // 6. Webhook channel
      // -------------------------------------------------------
      const [channel] = await tx
        .insert(channels)
        .values({
          type: 'webhook',
          config: {
            url: 'https://hooks.example.com/dev-workspace',
            events: ['ticket.created', 'ticket.completed', 'agent.error'],
            retries: 3,
          },
          enabled: true,
        })
        .returning()

      console.log(`  ✓ Channel: ${channel.id}`)

      // -------------------------------------------------------
      // 7. Brain entity
      // -------------------------------------------------------
      const [brain] = await tx
        .insert(brainEntities)
        .values({
          name: 'Dev Brain',
          domain: 'development',
          tier: 'development',
          enginesEnabled: ['planning', 'execution', 'review'],
          domainEngines: { planning: { model: 'claude-sonnet-4-20250514' }, execution: { model: 'claude-sonnet-4-20250514' } },
          endpoint: 'http://localhost:4000',
          healthEndpoint: 'http://localhost:4000/health',
          status: 'active',
          config: { maxConcurrentTickets: 5, autoHeal: true },
          hookProfile: 'standard',
        })
        .returning()

      console.log(`  ✓ Brain entity: ${brain.id}`)

      console.log('\nSeed complete.')
    })
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  }

  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
