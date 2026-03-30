/**
 * Execution Engine — translates roadmap steps into concrete, executable actions.
 *
 * Generates typed action plans from gap reports and blueprints.
 * Supports dry-run (inspect only) and guided execution (step-by-step with approval).
 *
 * For v1, only `create_table` actions are auto-executable.
 * Other action types produce instructions for manual execution.
 */

import type { Database } from '@solarc/db'
import { randomUUID } from 'crypto'
import { sql } from 'drizzle-orm'

import type { DomainBlueprint } from './blueprint-generator'
import type { GapReport } from './gap-detector'

// ── Inline Templates ─────────────────────────────────────────────────

const ROUTE_TEMPLATE = `/**
 * {{PURPOSE}}
 *
 * POST {{ROUTE_PATH}}
 */

import type { BrainClient } from '@solarc/brain-sdk'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

export const route = {
  method: 'post' as const,
  path: '{{ROUTE_PATH}}',
  handler: async (c: HonoContext, brain: BrainClient): Promise<Response> => {
    try {
      const input = await c.req.json()

      // TODO: Implement {{DOMAIN}} domain logic for {{PURPOSE}}
      // Examples:
      //   const memory = await brain.memory.search({ query: '...' })
      //   const llm = await brain.llm.chat({ messages: [...] })

      return c.json({
        domain: '{{DOMAIN}}',
        input,
        result: 'Replace with real computation',
        computedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Request failed' },
        500,
      )
    }
  },
}
`

const PROXY_ROUTE_TEMPLATE = `/**
 * Server-Side Proxy — {{PURPOSE}}
 */

const BRAIN_URL = process.env.{{ENV_PREFIX}}_BRAIN_URL ?? 'http://localhost:3100'
const BRAIN_SECRET = process.env.{{ENV_PREFIX}}_BRAIN_SECRET ?? ''

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(\`\${BRAIN_URL}{{ROUTE_PATH}}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BRAIN_SECRET ? { Authorization: \`Bearer \${BRAIN_SECRET}\` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Service unavailable' },
      { status: 502 },
    )
  }
}
`

// ── Types ─────────────────────────────────────────────────────────────

export type ActionType =
  | 'create_table'
  | 'create_entity'
  | 'create_workspace'
  | 'scaffold_files'
  | 'generate_file'
  | 'add_route'
  | 'add_page'
  | 'informational'

export interface ExecutionAction {
  id: string
  type: ActionType
  layer: string
  description: string
  payload: Record<string, unknown>
  status: 'pending' | 'completed' | 'failed' | 'skipped'
  autoExecutable: boolean
  result?: string
  error?: string
}

export interface ExecutionPlan {
  domain: string
  actions: ExecutionAction[]
  totalActions: number
  completedActions: number
}

// ── Plan Generation ──────────────────────────────────────────────────

/**
 * Generate an execution plan from a blueprint and gap report.
 * Each missing/partial layer produces concrete typed actions.
 */
export function generateExecutionPlan(
  domain: string,
  blueprint: DomainBlueprint,
  gaps: GapReport,
): ExecutionPlan {
  const actions: ExecutionAction[] = []
  const domainLower = domain.toLowerCase()

  for (const step of gaps.nextSteps) {
    switch (step.layer) {
      case 'computation': {
        actions.push({
          id: randomUUID(),
          type: 'create_entity',
          layer: 'computation',
          description: `Create Mini Brain entity for ${domainLower} domain via SmartCreate`,
          payload: {
            template: domainLower,
            name: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Brain`,
          },
          status: 'pending',
          autoExecutable: false,
        })
        for (const route of blueprint.miniBrainRoutes) {
          const routeName = route.path.split('/').pop() ?? 'example'
          const routeTemplate = ROUTE_TEMPLATE.replace(/\{\{ROUTE_PATH\}\}/g, route.path)
            .replace(/\{\{DOMAIN\}\}/g, domainLower)
            .replace(/\{\{PURPOSE\}\}/g, route.purpose)
          actions.push({
            id: randomUUID(),
            type: 'generate_file',
            layer: 'computation',
            description: `Generate route: ${route.method} ${route.path} — ${route.purpose}`,
            payload: {
              template: routeTemplate,
              tokens: { '{{DOMAIN}}': domainLower },
              targetPath: `apps/${domainLower}-brain/src/routes/${routeName}.ts`,
            },
            status: 'pending',
            autoExecutable: true,
          })
        }
        break
      }

      case 'persistence': {
        for (const table of blueprint.dataModel.tables) {
          const tableName = table.name
          const columnDefs = generateColumnSQL(table.keyColumns)
          actions.push({
            id: randomUUID(),
            type: 'create_table',
            layer: 'persistence',
            description: `Create table: ${tableName} — ${table.purpose}`,
            payload: {
              tableName,
              columns: table.keyColumns,
              sql: `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columnDefs}\n)`,
            },
            status: 'pending',
            autoExecutable: true,
          })
        }
        break
      }

      case 'list_views': {
        const envPrefix = domainLower.toUpperCase()
        for (const route of blueprint.miniBrainRoutes.slice(0, 3)) {
          const routeName = route.path.split('/').pop() ?? 'api'
          const proxyContent = PROXY_ROUTE_TEMPLATE.replace(/\{\{PURPOSE\}\}/g, route.purpose)
            .replace(/\{\{ENV_PREFIX\}\}/g, envPrefix)
            .replace(/\{\{ROUTE_PATH\}\}/g, route.path)
          actions.push({
            id: randomUUID(),
            type: 'generate_file',
            layer: 'list_views',
            description: `Generate proxy route: /api/${routeName} → ${route.path}`,
            payload: {
              template: proxyContent,
              tokens: {},
              targetPath: `apps/${domainLower}-app/src/app/api/${routeName}/route.ts`,
            },
            status: 'pending',
            autoExecutable: true,
          })
        }
        for (const page of blueprint.appPages.filter(
          (p) => !p.route.includes('[') && p.route !== '/' && p.route !== '/dashboard',
        )) {
          actions.push({
            id: randomUUID(),
            type: 'add_page',
            layer: 'list_views',
            description: `Create list page: ${page.route} — ${page.purpose}`,
            payload: { route: page.route, purpose: page.purpose },
            status: 'pending',
            autoExecutable: false,
          })
        }
        break
      }

      case 'detail_views': {
        for (const page of blueprint.appPages.filter((p) => p.route.includes('[id]'))) {
          actions.push({
            id: randomUUID(),
            type: 'add_page',
            layer: 'detail_views',
            description: `Create detail page: ${page.route} — ${page.purpose}`,
            payload: { route: page.route, purpose: page.purpose },
            status: 'pending',
            autoExecutable: false,
          })
        }
        break
      }

      case 'sharing': {
        actions.push({
          id: randomUUID(),
          type: 'create_table',
          layer: 'sharing',
          description: `Create share tokens table: ${domainLower}_share_tokens`,
          payload: {
            tableName: `${domainLower}_share_tokens`,
            columns: [
              'id',
              'resourceType',
              'resourceId',
              'token (unique)',
              'revokedAt',
              'createdAt',
            ],
            sql: `CREATE TABLE IF NOT EXISTS ${domainLower}_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  token text UNIQUE NOT NULL,
  created_by_user_id uuid,
  organization_id uuid,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
)`,
          },
          status: 'pending',
          autoExecutable: true,
        })
        break
      }

      case 'engagement': {
        actions.push({
          id: randomUUID(),
          type: 'create_table',
          layer: 'engagement',
          description: `Create engagement table: ${domainLower}_engagement`,
          payload: {
            tableName: `${domainLower}_engagement`,
            columns: ['id', 'userId', 'recordId', 'lastSeenAt'],
            sql: `CREATE TABLE IF NOT EXISTS ${domainLower}_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  record_id uuid NOT NULL,
  last_seen_at timestamp NOT NULL DEFAULT now()
)`,
          },
          status: 'pending',
          autoExecutable: true,
        })
        break
      }

      case 'org_scoping': {
        actions.push({
          id: randomUUID(),
          type: 'informational',
          layer: 'org_scoping',
          description: 'Ensure all domain tables include organization_id column with index',
          payload: { note: 'Tables created by persistence step already include organization_id' },
          status: 'pending',
          autoExecutable: false,
        })
        break
      }

      default: {
        actions.push({
          id: randomUUID(),
          type: 'informational',
          layer: step.layer,
          description: step.action,
          payload: { effort: step.effort },
          status: 'pending',
          autoExecutable: false,
        })
      }
    }
  }

  return {
    domain: domainLower,
    actions,
    totalActions: actions.length,
    completedActions: 0,
  }
}

// ── Action Execution ─────────────────────────────────────────────────

/**
 * Execute a single action. Only auto-executable actions (create_table) run.
 * Others return instructions for manual execution.
 */
export async function executeAction(
  db: Database,
  action: ExecutionAction,
): Promise<ExecutionAction> {
  if (!action.autoExecutable) {
    return {
      ...action,
      status: 'skipped',
      result: 'Manual action — requires human execution',
    }
  }

  if (action.type === 'create_table') {
    const sqlStr = action.payload.sql as string
    if (!sqlStr) {
      return { ...action, status: 'failed', error: 'No SQL in payload' }
    }

    try {
      await db.execute(sql.raw(sqlStr))
      // Create index on organization_id if the table has it
      const tableName = action.payload.tableName as string
      try {
        await db.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS ${tableName}_org_idx ON ${tableName}(organization_id)`,
          ),
        )
      } catch {
        // Index creation is non-blocking (column might not exist)
      }
      return {
        ...action,
        status: 'completed',
        result: `Table ${tableName} created successfully`,
      }
    } catch (err) {
      return {
        ...action,
        status: 'failed',
        error: err instanceof Error ? err.message : 'SQL execution failed',
      }
    }
  }

  if (action.type === 'generate_file') {
    const template = action.payload.template as string
    const tokens = action.payload.tokens as Record<string, string>
    const targetPath = action.payload.targetPath as string

    if (!template) {
      return { ...action, status: 'failed', error: 'No template content in payload' }
    }

    // Apply token replacement
    let content = template
    if (tokens) {
      for (const [token, value] of Object.entries(tokens)) {
        content = content.split(token).join(value)
      }
    }

    return {
      ...action,
      status: 'completed',
      result: `Generated file for ${targetPath}:\n\n${content}`,
    }
  }

  return {
    ...action,
    status: 'skipped',
    result: `Action type '${action.type}' not auto-executable in v1`,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateColumnSQL(columns: string[]): string {
  const lines: string[] = []
  for (const col of columns) {
    const colLower = col.toLowerCase()
    const snakeCol = col
      .replace(/\s*\(.*\)/, '')
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')

    if (colLower === 'id') {
      lines.push('  id uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    } else if (colLower === 'organizationid') {
      lines.push('  organization_id uuid')
    } else if (colLower === 'createdbyuserid') {
      lines.push('  created_by_user_id uuid')
    } else if (colLower === 'createdat') {
      lines.push('  created_at timestamp NOT NULL DEFAULT now()')
    } else if (colLower === 'updatedat') {
      lines.push('  updated_at timestamp NOT NULL DEFAULT now()')
    } else if (col.includes('jsonb') || col.includes('JSONB')) {
      lines.push(`  ${snakeCol.replace('_jsonb', '')} jsonb`)
    } else if (col.includes('FK')) {
      lines.push(`  ${snakeCol.replace('_fk', '_id')} uuid`)
    } else if (col.includes('unique') || col.includes('UNIQUE')) {
      lines.push(`  ${snakeCol.replace('_unique', '')} text UNIQUE NOT NULL`)
    } else {
      lines.push(`  ${snakeCol} text`)
    }
  }
  return lines.join(',\n')
}
