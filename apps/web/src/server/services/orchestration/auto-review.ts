/**
 * Auto-Review Workflow
 *
 * The Engineering Lead scans the codebase, creates review tickets for each
 * subsystem, and routes them to the right department:
 *   - UI pages/components → Design department
 *   - Architecture/services/API → Engineering department
 *   - Test coverage → QA (Engineering department)
 *
 * Can be triggered manually or via cron.
 */

import type { Database } from '@solarc/db'
import { agents, brainEntities, tickets, workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { CodebaseMapper, type ReviewTicket } from './codebase-mapper'

// ── Types ────────────────────────────────────────────────────────────────

export interface AutoReviewResult {
  scannedAt: Date
  totalFiles: number
  totalLines: number
  subsystems: number
  ticketsCreated: number
  ticketsByDepartment: Record<string, number>
  tickets: Array<{ id: string; title: string; department: string; priority: string }>
}

// ── Auto Review Engine ───────────────────────────────────────────────────

export class AutoReviewEngine {
  private mapper = new CodebaseMapper()

  constructor(private db: Database) {}

  /**
   * Run a full system review: scan codebase → generate tickets → create in DB.
   */
  async runReview(rootDir: string): Promise<AutoReviewResult> {
    // 1. Scan the codebase
    const map = this.mapper.scan(rootDir)

    // 2. Generate review tickets
    const reviewTickets = this.mapper.generateReviewTickets(map)

    // 3. Find workspace to create tickets in (use first active workspace)
    const workspace = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.type, 'general'),
    })

    if (!workspace) {
      return {
        scannedAt: map.scannedAt,
        totalFiles: map.totalFiles,
        totalLines: map.totalLines,
        subsystems: map.subsystems.length,
        ticketsCreated: 0,
        ticketsByDepartment: {},
        tickets: [],
      }
    }

    // 4. Find agents to assign tickets to based on department
    const departmentAgents = await this.findDepartmentLeads()

    // 5. Create tickets in DB
    const created: AutoReviewResult['tickets'] = []
    const deptCounts: Record<string, number> = {}

    for (const ticket of reviewTickets) {
      try {
        const assignee = departmentAgents.get(ticket.department)

        const [row] = await this.db
          .insert(tickets)
          .values({
            title: ticket.title,
            description: ticket.description,
            status: 'queued',
            priority: ticket.priority,
            workspaceId: workspace.id,
            assignedAgentId: assignee ?? null,
          })
          .returning({ id: tickets.id })

        if (row) {
          created.push({
            id: row.id,
            title: ticket.title,
            department: ticket.department,
            priority: ticket.priority,
          })
          deptCounts[ticket.department] = (deptCounts[ticket.department] ?? 0) + 1
        }
      } catch {
        // Skip individual ticket failures
      }
    }

    return {
      scannedAt: map.scannedAt,
      totalFiles: map.totalFiles,
      totalLines: map.totalLines,
      subsystems: map.subsystems.length,
      ticketsCreated: created.length,
      ticketsByDepartment: deptCounts,
      tickets: created,
    }
  }

  /**
   * Preview what a review would create (dry-run).
   */
  preview(rootDir: string): { map: ReturnType<CodebaseMapper['scan']>; tickets: ReviewTicket[] } {
    const map = this.mapper.scan(rootDir)
    const reviewTickets = this.mapper.generateReviewTickets(map)
    return { map, tickets: reviewTickets }
  }

  /**
   * Find department lead agents for ticket assignment.
   */
  private async findDepartmentLeads(): Promise<Map<string, string>> {
    const leads = new Map<string, string>()

    // Find entities by domain
    const entities = await this.db.query.brainEntities.findMany({
      where: eq(brainEntities.tier, 'mini_brain'),
    })

    for (const entity of entities) {
      const domain = (entity.domain ?? '').toLowerCase()
      let dept: string | null = null

      if (domain.includes('engineer')) dept = 'engineering'
      else if (domain.includes('design')) dept = 'design'
      else if (domain.includes('soc') || domain.includes('security')) dept = 'qa'

      if (!dept) continue

      // Find the first agent in this entity (ideally the lead)
      const entityAgents = await this.db.query.agents.findMany({
        where: eq(agents.workspaceId, entity.id),
        limit: 1,
      })

      if (entityAgents[0]) {
        leads.set(dept, entityAgents[0].id)
      }
    }

    return leads
  }
}
