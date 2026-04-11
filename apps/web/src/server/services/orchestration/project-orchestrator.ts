/**
 * Project Orchestrator — decomposes a user brief into a DAG of tickets,
 * forms an agent swarm, and drives autonomous execution through waves.
 *
 * Uses existing infrastructure:
 * - projects + tickets tables (with DAG dependencies)
 * - SwarmEngine for team formation
 * - TicketExecutionEngine for agent assignment + DAG resolution
 * - ModeRouter for autonomous agent execution
 * - workspace_files / generate_design_system / render_preview tools
 */

import type { Database } from '@solarc/db'
import { agents, artifacts, projects, ticketDependencies, tickets } from '@solarc/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { GatewayRouter } from '../gateway'
import { recommendDesignSystem } from '../intelligence/design-intelligence'

// ── Types ────────────────────────────────────────────────────────────────

export interface TaskDef {
  id: string // slug, e.g. 'design_system'
  title: string
  description: string // detailed agent instructions
  skills: string[]
  tools: string[]
  dependsOn: string[] // other task IDs
  complexity: 'easy' | 'medium' | 'hard'
  expectedArtifact?: string // e.g. 'hero.html'
}

export interface ProjectPlan {
  name: string
  goal: string
  domain: string
  tasks: TaskDef[]
  requiredSkills: string[]
}

export interface ProjectStatus {
  id: string
  name: string
  goal: string | null
  status: string
  createdAt: Date
  tasks: Array<{
    id: string
    title: string
    status: string
    assignedAgentId: string | null
    agentName: string | null
    result: string | null
    dagId: string | null
    dagNodeType: string | null
    metadata: Record<string, unknown> | null
    dependsOn: string[] // ticket IDs this task is blocked by
  }>
  artifacts: Array<{
    id: string
    name: string
    type: string | null
    ticketId: string | null
    createdAt: Date
  }>
  progress: { total: number; done: number; inProgress: number; failed: number; pct: number }
}

// ── Decomposition ────────────────────────────────────────────────────────

const AVAILABLE_TOOLS_DOC = `
Available tools agents can use:
- generate_design_system: Generate color palette, typography, spacing, CSS custom properties for a brand
- design_intelligence: Get deterministic design pattern recommendations for 161+ product categories
- workspace_files: Read/write artifacts (HTML, code, documents) to shared workspace storage
- web_search: Search the internet for reference material
- code_review: Automated code review with severity ratings
- render_preview: Render HTML to PNG screenshot via Playwright
- file_system: Read/write files to filesystem
- memory_store: Save important findings to persistent memory
`.trim()

const DECOMPOSITION_PROMPT = `You are a project architect. Given a user brief, decompose it into a DAG of executable tasks.

Each task will be executed by an autonomous AI agent with access to tools. The agent runs in a loop of up to 10 tool calls.

${AVAILABLE_TOOLS_DOC}

Return a JSON object with this EXACT structure:
{
  "name": "<short project name>",
  "goal": "<1-sentence goal>",
  "domain": "<web|api|design|marketing|general>",
  "tasks": [
    {
      "id": "<unique_slug>",
      "title": "<short task title>",
      "description": "<detailed instructions for the agent, including which tools to use, what artifacts to read/write, expected output format>",
      "skills": ["<skill1>", "<skill2>"],
      "tools": ["<tool_name1>", "<tool_name2>"],
      "dependsOn": ["<other_task_id>"],
      "complexity": "easy|medium|hard",
      "expectedArtifact": "<filename.ext or null>"
    }
  ],
  "requiredSkills": ["<all unique skills>"]
}

RULES:
1. Tasks must form a valid DAG (no cycles). Independent tasks can run in parallel.
2. Each task description must explicitly name which artifacts to read (from dependencies) and write.
3. For web projects: start with design_system + research, then content/copy, then HTML sections, then assembly, then review.
4. The assembly task must read all section artifacts by name and combine them into a single HTML page with Tailwind CSS.
5. The final review task should use code_review and render_preview.
6. Use workspace_files (action: write) to save all artifacts — this stores them in the database.
7. Keep tasks focused — one concern per task. More tasks = more parallelism.
8. Return ONLY valid JSON, no markdown wrapping.`

export async function decomposeProject(
  db: Database,
  brief: string,
  projectType?: string,
): Promise<ProjectPlan> {
  logger.info({ brief: brief.slice(0, 100), projectType }, '[ProjectOrchestrator] Decomposing')

  // Pre-flight: get design intelligence for grounding
  let designContext = ''
  try {
    const rec = recommendDesignSystem(brief)
    if (rec) {
      designContext = `\nDesign recommendation for this domain:\n- Pattern: ${rec.category.pattern}\n- Style: ${rec.category.stylePriority}\n- Colors: ${rec.category.colorMood}\n- Typography: ${rec.category.typographyMood}\n- Key effects: ${rec.category.keyEffects}\n- Avoid: ${rec.category.antiPatterns}\n`
    }
  } catch {
    // non-critical
  }

  // Call LLM for decomposition
  let plan: ProjectPlan | null = null
  try {
    const gateway = new GatewayRouter(db)
    const model = process.env.DEFAULT_MODEL ?? 'qwen3-coder:480b-cloud'
    const response = await gateway.chat({
      model,
      messages: [
        { role: 'system', content: DECOMPOSITION_PROMPT },
        {
          role: 'user',
          content: `Brief: ${brief}\n\nProject type: ${projectType ?? 'auto-detect'}${designContext}\n\nDecompose this into tasks.`,
        },
      ],
      temperature: 0.2,
    })

    const text = response.content
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
    if (jsonMatch?.[1]) {
      try {
        plan = JSON.parse(jsonMatch[1]) as ProjectPlan
      } catch {
        // JSON parse failed — will use fallback
      }
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : undefined },
      '[ProjectOrchestrator] LLM decomposition failed, using fallback',
    )
  }

  // Fallback: hardcoded landing page template
  if (!plan || !plan.tasks?.length) {
    plan = buildFallbackPlan(brief, projectType)
  }

  // Validate no cycles (simple check)
  const taskIds = new Set(plan.tasks.map((t) => t.id))
  for (const task of plan.tasks) {
    task.dependsOn = task.dependsOn.filter((d) => taskIds.has(d))
  }

  return plan
}

function buildFallbackPlan(brief: string, projectType?: string): ProjectPlan {
  const name = brief
    .slice(0, 50)
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
  const isLanding = !projectType || projectType === 'landing-page'

  if (isLanding) {
    return {
      name: name || 'Landing Page',
      goal: brief,
      domain: 'web',
      requiredSkills: ['design', 'frontend', 'copywriting', 'review'],
      tasks: [
        {
          id: 'design_system',
          title: 'Generate Design System',
          description: `Generate a design system for this project: "${brief}". Use the generate_design_system tool to create a color palette, typography, and spacing. Save the result as an artifact named "design-system.md" using workspace_files write action.`,
          skills: ['design'],
          tools: ['generate_design_system', 'design_intelligence', 'workspace_files'],
          dependsOn: [],
          complexity: 'medium',
          expectedArtifact: 'design-system.md',
        },
        {
          id: 'research',
          title: 'Research & Inspiration',
          description: `Research similar projects and best practices for: "${brief}". Use web_search to find inspiration. Save key findings as an artifact named "research-notes.md" using workspace_files write action.`,
          skills: ['research'],
          tools: ['web_search', 'workspace_files'],
          dependsOn: [],
          complexity: 'easy',
          expectedArtifact: 'research-notes.md',
        },
        {
          id: 'copy_hero',
          title: 'Write Hero Section Copy',
          description: `Write compelling hero section copy for: "${brief}". Include a headline, subheadline, and CTA button text. Read the research-notes.md artifact for context. Save as "copy-hero.md" using workspace_files write action.`,
          skills: ['copywriting'],
          tools: ['workspace_files'],
          dependsOn: ['research'],
          complexity: 'easy',
          expectedArtifact: 'copy-hero.md',
        },
        {
          id: 'copy_sections',
          title: 'Write Section Copy',
          description: `Write copy for all content sections (about, features/menu, testimonials, contact info) for: "${brief}". Read research-notes.md for context. Save as "copy-sections.md" using workspace_files write action.`,
          skills: ['copywriting'],
          tools: ['workspace_files'],
          dependsOn: ['research'],
          complexity: 'easy',
          expectedArtifact: 'copy-sections.md',
        },
        {
          id: 'html_hero',
          title: 'Build Hero Section',
          description: `Build the hero section HTML with Tailwind CSS. Read "design-system.md" for colors/fonts and "copy-hero.md" for text content. Create a visually striking hero with gradient background, headline, subheadline, and CTA button. Save as "section-hero.html" using workspace_files write action.`,
          skills: ['frontend'],
          tools: ['workspace_files'],
          dependsOn: ['design_system', 'copy_hero'],
          complexity: 'medium',
          expectedArtifact: 'section-hero.html',
        },
        {
          id: 'html_sections',
          title: 'Build Content Sections',
          description: `Build all content sections (features/menu, testimonials, contact) as HTML with Tailwind CSS. Read "design-system.md" for styling and "copy-sections.md" for text. Create responsive grid layouts. Save as "section-content.html" using workspace_files write action.`,
          skills: ['frontend'],
          tools: ['workspace_files'],
          dependsOn: ['design_system', 'copy_sections'],
          complexity: 'medium',
          expectedArtifact: 'section-content.html',
        },
        {
          id: 'assembly',
          title: 'Assemble Full Page',
          description: `Assemble the complete landing page. Read ALL artifacts: "design-system.md", "section-hero.html", "section-content.html". Combine them into a single complete HTML page with: DOCTYPE, head (Tailwind CDN, Google Fonts, meta viewport), body with all sections in order (hero, content sections, footer). Save as "${name || 'landing-page'}.html" using workspace_files write action. Then use render_preview to generate a screenshot.`,
          skills: ['frontend'],
          tools: ['workspace_files', 'render_preview'],
          dependsOn: ['html_hero', 'html_sections'],
          complexity: 'hard',
          expectedArtifact: `${(name || 'landing-page').toLowerCase().replace(/\s+/g, '-')}.html`,
        },
        {
          id: 'review',
          title: 'Review & Polish',
          description: `Review the assembled page. Read the final HTML artifact. Use code_review to check for accessibility, responsive design, and code quality. Use render_preview to capture the final result. If issues found, fix them and save the updated version using workspace_files write action.`,
          skills: ['review'],
          tools: ['code_review', 'render_preview', 'workspace_files'],
          dependsOn: ['assembly'],
          complexity: 'medium',
          expectedArtifact: undefined,
        },
      ],
    }
  }

  // Generic project fallback
  return {
    name: name || 'Project',
    goal: brief,
    domain: 'general',
    requiredSkills: ['general'],
    tasks: [
      {
        id: 'plan',
        title: 'Plan & Research',
        description: `Research and plan the implementation for: "${brief}". Use web_search for best practices. Save a plan document as "plan.md" using workspace_files write action.`,
        skills: ['research'],
        tools: ['web_search', 'workspace_files'],
        dependsOn: [],
        complexity: 'medium',
        expectedArtifact: 'plan.md',
      },
      {
        id: 'implement',
        title: 'Implement',
        description: `Implement the project based on the plan. Read "plan.md" for the approach. Save all outputs using workspace_files write action.`,
        skills: ['general'],
        tools: ['workspace_files', 'file_system'],
        dependsOn: ['plan'],
        complexity: 'hard',
        expectedArtifact: undefined,
      },
      {
        id: 'review',
        title: 'Review',
        description: `Review the implementation. Use code_review if applicable. Save findings as "review.md" using workspace_files write action.`,
        skills: ['review'],
        tools: ['code_review', 'workspace_files'],
        dependsOn: ['implement'],
        complexity: 'easy',
        expectedArtifact: 'review.md',
      },
    ],
  }
}

// ── Materialization (create project + tickets + deps) ────────────────────

export async function materializeProject(
  db: Database,
  plan: ProjectPlan,
  opts?: { workspaceId?: string },
): Promise<{ projectId: string; ticketIds: string[]; taskMap: Map<string, string> }> {
  // Create project
  const [project] = await db
    .insert(projects)
    .values({
      name: plan.name,
      goal: plan.goal,
      domain: plan.domain,
      workspaceId: opts?.workspaceId ?? null,
      status: 'active',
    })
    .returning()

  const projectId = project.id
  const taskMap = new Map<string, string>() // task slug → ticket ID
  const ticketIds: string[] = []

  // Create tickets for each task
  for (const task of plan.tasks) {
    const [ticket] = await db
      .insert(tickets)
      .values({
        title: task.title,
        description: task.description,
        projectId,
        status: 'queued',
        priority:
          task.complexity === 'hard' ? 'high' : task.complexity === 'medium' ? 'medium' : 'low',
        complexity: task.complexity,
        executionMode: task.complexity === 'hard' ? 'deep_work' : 'autonomous',
        dagId: projectId,
        dagNodeType: task.id,
        workspaceId: opts?.workspaceId ?? null,
        metadata: {
          requiredSkills: task.skills,
          requiredTools: task.tools,
          expectedArtifact: task.expectedArtifact,
          projectBuilderId: projectId,
          taskSlug: task.id,
        } as unknown as Record<string, unknown>,
      })
      .returning()

    taskMap.set(task.id, ticket.id)
    ticketIds.push(ticket.id)
  }

  // Create dependency edges
  for (const task of plan.tasks) {
    for (const depSlug of task.dependsOn) {
      const ticketId = taskMap.get(task.id)
      const blockedBy = taskMap.get(depSlug)
      if (ticketId && blockedBy) {
        await db.insert(ticketDependencies).values({
          ticketId,
          blockedByTicketId: blockedBy,
        })
      }
    }
  }

  logger.info(
    {
      projectId,
      tickets: ticketIds.length,
      deps: plan.tasks.reduce((a, t) => a + t.dependsOn.length, 0),
    },
    '[ProjectOrchestrator] Project materialized',
  )

  return { projectId, ticketIds, taskMap }
}

// ── Execution (kick off ready tickets) ───────────────────────────────────

export async function executeNextWave(
  db: Database,
  projectId: string,
): Promise<{ executed: number; remaining: number; done: boolean }> {
  // Get all project tickets
  const projectTickets = await db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
  })

  const total = projectTickets.length
  const doneCount = projectTickets.filter((t) => t.status === 'done').length
  const failedCount = projectTickets.filter((t) => t.status === 'failed').length

  if (doneCount + failedCount >= total) {
    // All done or failed — mark project complete
    await db.update(projects).set({ status: 'completed' }).where(eq(projects.id, projectId))
    return { executed: 0, remaining: 0, done: true }
  }

  // Find ready tickets (queued with all deps done)
  const queuedTickets = projectTickets.filter((t) => t.status === 'queued')
  if (queuedTickets.length === 0) {
    return { executed: 0, remaining: total - doneCount, done: false }
  }

  // Get dependency info
  const queuedIds = queuedTickets.map((t) => t.id)
  const deps = await db
    .select()
    .from(ticketDependencies)
    .where(inArray(ticketDependencies.ticketId, queuedIds))

  const doneSet = new Set(projectTickets.filter((t) => t.status === 'done').map((t) => t.id))

  const readyTickets = queuedTickets.filter((t) => {
    const blockers = deps.filter((d) => d.ticketId === t.id).map((d) => d.blockedByTicketId)
    return blockers.every((b) => doneSet.has(b))
  })

  // Execute ready tickets
  let executed = 0
  for (const ticket of readyTickets) {
    try {
      // Transition to in_progress
      await db.update(tickets).set({ status: 'in_progress' }).where(eq(tickets.id, ticket.id))

      // Try to execute via ModeRouter
      try {
        const { ModeRouter } = await import('../task-runner/mode-router')
        const router = new ModeRouter(db)
        await router.route(ticket.id, ticket.description ?? ticket.title, {
          forceMode: 'autonomous',
        })
      } catch (routerErr) {
        // If ModeRouter fails (e.g. no agents), just leave ticket in_progress
        // It will be picked up by the worker cron
        logger.warn(
          { ticketId: ticket.id, err: routerErr instanceof Error ? routerErr.message : undefined },
          '[ProjectOrchestrator] ModeRouter execution deferred',
        )
      }

      executed++
    } catch (err) {
      logger.warn(
        { ticketId: ticket.id, err: err instanceof Error ? err.message : undefined },
        '[ProjectOrchestrator] Failed to execute ticket',
      )
    }
  }

  return { executed, remaining: total - doneCount - executed, done: false }
}

// ── Status ───────────────────────────────────────────────────────────────

export async function getProjectStatus(
  db: Database,
  projectId: string,
): Promise<ProjectStatus | null> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })
  if (!project) return null

  const projectTickets = await db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
    orderBy: [tickets.createdAt],
  })

  const projectArtifacts =
    projectTickets.length > 0
      ? await db
          .select()
          .from(artifacts)
          .where(
            inArray(
              artifacts.ticketId,
              projectTickets.map((t) => t.id),
            ),
          )
          .orderBy(desc(artifacts.createdAt))
      : []

  // Also get artifacts created during the project timeframe without ticketId
  const recentArtifacts = await db
    .select()
    .from(artifacts)
    .where(and(sql`${artifacts.createdAt} >= ${project.createdAt}`))
    .orderBy(desc(artifacts.createdAt))
    .limit(20)

  const allArtifacts = [
    ...projectArtifacts,
    ...recentArtifacts.filter((a) => !projectArtifacts.some((pa) => pa.id === a.id)),
  ]

  // Get dependency edges for this project's tickets
  const ticketIds = projectTickets.map((t) => t.id)
  const deps =
    ticketIds.length > 0
      ? await db
          .select()
          .from(ticketDependencies)
          .where(inArray(ticketDependencies.ticketId, ticketIds))
      : []

  // Build dependency map: ticketId → [blockedByTicketIds]
  const depMap = new Map<string, string[]>()
  for (const d of deps) {
    const existing = depMap.get(d.ticketId) ?? []
    existing.push(d.blockedByTicketId)
    depMap.set(d.ticketId, existing)
  }

  // Get agent names for assigned agents
  const assignedAgentIds = projectTickets
    .map((t) => t.assignedAgentId)
    .filter((id): id is string => !!id)
  const agentNames =
    assignedAgentIds.length > 0
      ? await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(inArray(agents.id, [...new Set(assignedAgentIds)]))
      : []
  const agentNameMap = new Map(agentNames.map((a) => [a.id, a.name]))

  const total = projectTickets.length
  const done = projectTickets.filter((t) => t.status === 'done').length
  const inProgress = projectTickets.filter((t) => t.status === 'in_progress').length
  const failed = projectTickets.filter((t) => t.status === 'failed').length

  return {
    id: project.id,
    name: project.name,
    goal: project.goal,
    status: project.status,
    createdAt: project.createdAt,
    tasks: projectTickets.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignedAgentId: t.assignedAgentId,
      agentName: t.assignedAgentId ? (agentNameMap.get(t.assignedAgentId) ?? null) : null,
      result: t.result,
      dagId: t.dagId,
      dagNodeType: t.dagNodeType,
      metadata: t.metadata as Record<string, unknown> | null,
      dependsOn: depMap.get(t.id) ?? [],
    })),
    artifacts: allArtifacts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      ticketId: a.ticketId,
      createdAt: a.createdAt,
    })),
    progress: {
      total,
      done,
      inProgress,
      failed,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    },
  }
}

// ── Revision ─────────────────────────────────────────────────────────────

export async function requestChange(
  db: Database,
  projectId: string,
  description: string,
  targetTicketId?: string,
): Promise<string> {
  const [ticket] = await db
    .insert(tickets)
    .values({
      title: `[Revision] ${description.slice(0, 60)}`,
      description: `Revise the project output: ${description}. Read existing artifacts and modify them as requested. Save updated versions using workspace_files write action.${targetTicketId ? ` This revision targets ticket ${targetTicketId}.` : ''}`,
      projectId,
      status: 'queued',
      priority: 'high',
      complexity: 'medium',
      executionMode: 'autonomous',
      dagId: projectId,
      dagNodeType: 'revision',
      metadata: {
        projectBuilderId: projectId,
        revision: true,
        targetTicketId,
      } as unknown as Record<string, unknown>,
    })
    .returning()

  return ticket.id
}

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteProject(db: Database, projectId: string): Promise<boolean> {
  // Delete tickets first (cascade doesn't exist in ticketDependencies FK)
  const projectTickets = await db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
  })
  const ticketIds = projectTickets.map((t) => t.id)

  if (ticketIds.length > 0) {
    await db.delete(ticketDependencies).where(inArray(ticketDependencies.ticketId, ticketIds))
    await db
      .delete(ticketDependencies)
      .where(inArray(ticketDependencies.blockedByTicketId, ticketIds))
    await db.delete(tickets).where(inArray(tickets.id, ticketIds))
  }

  const result = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id })

  return result.length > 0
}
