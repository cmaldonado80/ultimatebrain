/**
 * Deployment Workflow Engine — controlled lifecycle from creation to activation.
 *
 * Tracks multi-step deployment progress and enforces the entity lifecycle:
 *   provisioning → configured → deployed → verified → active
 *
 * Each step is auditable, failure-safe, and operator-visible.
 */

import type { Database } from '@solarc/db'
import { brainEntities, deploymentWorkflows, incidents } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { encrypt } from '../gateway/key-vault'
import { createNeonBranch } from '../neon/neon-api'
import { auditEvent } from './audit'
import { createSecret } from './secret-manager'

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkflowStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: string
  completedAt?: string
  error?: string
  result?: Record<string, unknown>
  manual?: boolean
}

export interface WorkflowConfig {
  miniBrain: {
    ENTITY_ID: string
    BRAIN_URL: string
    DATABASE_URL: string
    DOMAIN_NAME: string
    PORT: string
    APP_SECRET: string
  }
  development?: {
    MINI_BRAIN_URL: string
    AUTH_SECRET: string
    COOKIE_NAME: string
  }
}

// ── Step Definitions ─────────────────────────────────────────────────

const MINI_BRAIN_STEPS: WorkflowStep[] = [
  { name: 'provision_db', status: 'pending' },
  { name: 'configure', status: 'pending' },
  { name: 'deploy_mini_brain', status: 'pending', manual: true },
  { name: 'register_mini_brain', status: 'pending', manual: true },
  { name: 'verify_mini_brain', status: 'pending' },
  { name: 'activate', status: 'pending' },
]

const FULL_STEPS: WorkflowStep[] = [
  { name: 'provision_db', status: 'pending' },
  { name: 'configure', status: 'pending' },
  { name: 'deploy_mini_brain', status: 'pending', manual: true },
  { name: 'register_mini_brain', status: 'pending', manual: true },
  { name: 'verify_mini_brain', status: 'pending' },
  { name: 'deploy_development', status: 'pending', manual: true },
  { name: 'register_development', status: 'pending', manual: true },
  { name: 'verify_development', status: 'pending' },
  { name: 'activate', status: 'pending' },
]

// ── Create ───────────────────────────────────────────────────────────

export async function createDeploymentWorkflow(
  db: Database,
  entityId: string,
  devEntityId: string | null,
  triggeredBy: string,
): Promise<string> {
  const steps = devEntityId ? FULL_STEPS : MINI_BRAIN_STEPS
  const [wf] = await db
    .insert(deploymentWorkflows)
    .values({
      entityId,
      devEntityId,
      status: 'pending',
      currentStep: steps[0]!.name,
      steps: JSON.parse(JSON.stringify(steps)),
      triggeredBy,
    })
    .returning()

  if (!wf) throw new Error('Failed to create deployment workflow')

  await auditEvent(db, triggeredBy, 'create_deployment', 'deployment_workflow', wf.id, {
    entityId,
    devEntityId,
    stepCount: steps.length,
  })

  return wf.id
}

// ── Advance ──────────────────────────────────────────────────────────

/**
 * Advance to the next auto-executable step. Skips manual steps.
 * Returns the updated workflow.
 */
export async function advanceWorkflow(db: Database, workflowId: string, userId?: string) {
  const wf = await db.query.deploymentWorkflows.findFirst({
    where: eq(deploymentWorkflows.id, workflowId),
  })
  if (!wf) throw new Error('Workflow not found')
  if (wf.status === 'completed' || wf.status === 'cancelled') {
    throw new Error(`Workflow is ${wf.status}`)
  }

  const steps = wf.steps as WorkflowStep[]
  const nextStep = steps.find((s) => s.status === 'pending')
  if (!nextStep) {
    // All steps done — complete workflow
    await completeWorkflow(db, workflowId, steps)
    return db.query.deploymentWorkflows.findFirst({
      where: eq(deploymentWorkflows.id, workflowId),
    })
  }

  // If next step is manual, just update status to running and wait
  if (nextStep.manual) {
    nextStep.status = 'running'
    nextStep.startedAt = new Date().toISOString()
    await db
      .update(deploymentWorkflows)
      .set({
        status: 'running',
        currentStep: nextStep.name,
        steps: JSON.parse(JSON.stringify(steps)),
        startedAt: wf.startedAt ?? new Date(),
      })
      .where(eq(deploymentWorkflows.id, workflowId))
    return db.query.deploymentWorkflows.findFirst({
      where: eq(deploymentWorkflows.id, workflowId),
    })
  }

  // Execute auto step
  nextStep.status = 'running'
  nextStep.startedAt = new Date().toISOString()
  await db
    .update(deploymentWorkflows)
    .set({
      status: 'running',
      currentStep: nextStep.name,
      steps: JSON.parse(JSON.stringify(steps)),
      startedAt: wf.startedAt ?? new Date(),
    })
    .where(eq(deploymentWorkflows.id, workflowId))

  try {
    const result = await executeStep(
      db,
      wf.entityId,
      wf.devEntityId,
      nextStep.name,
      wf.config as WorkflowConfig | null,
    )
    nextStep.status = 'completed'
    nextStep.completedAt = new Date().toISOString()
    nextStep.result = result ?? undefined

    // Merge config updates from step result
    let config = (wf.config as WorkflowConfig | null) ?? undefined
    if (result?.configUpdate) {
      config = { ...config, ...result.configUpdate } as WorkflowConfig
    }

    await db
      .update(deploymentWorkflows)
      .set({
        steps: JSON.parse(JSON.stringify(steps)),
        config: config ?? null,
      })
      .where(eq(deploymentWorkflows.id, workflowId))

    if (userId) {
      await auditEvent(db, userId, 'deployment_step', 'deployment_workflow', workflowId, {
        step: nextStep.name,
        status: 'completed',
        entityId: wf.entityId,
      })
    }

    // Continue to next step
    return advanceWorkflow(db, workflowId, userId)
  } catch (err) {
    nextStep.status = 'failed'
    nextStep.completedAt = new Date().toISOString()
    nextStep.error = err instanceof Error ? err.message : String(err)

    await db
      .update(deploymentWorkflows)
      .set({
        status: 'failed',
        steps: JSON.parse(JSON.stringify(steps)),
        error: nextStep.error,
      })
      .where(eq(deploymentWorkflows.id, workflowId))

    // Create incident for failed step
    await createDeploymentIncident(db, wf.entityId, nextStep.name, nextStep.error)

    if (userId) {
      await auditEvent(db, userId, 'deployment_step', 'deployment_workflow', workflowId, {
        step: nextStep.name,
        status: 'failed',
        error: nextStep.error,
        entityId: wf.entityId,
      })
    }

    return db.query.deploymentWorkflows.findFirst({
      where: eq(deploymentWorkflows.id, workflowId),
    })
  }
}

// ── Confirm Manual Step ──────────────────────────────────────────────

export async function confirmManualStep(
  db: Database,
  workflowId: string,
  stepName: string,
  data: {
    endpoint?: string
    healthEndpoint?: string
    deploymentRef?: string
    deploymentProvider?: string
    version?: string
  },
  userId: string,
) {
  const wf = await db.query.deploymentWorkflows.findFirst({
    where: eq(deploymentWorkflows.id, workflowId),
  })
  if (!wf) throw new Error('Workflow not found')
  if (wf.status !== 'running') throw new Error('Workflow is not running')

  const steps = wf.steps as WorkflowStep[]
  const step = steps.find((s) => s.name === stepName)
  if (!step) throw new Error(`Step '${stepName}' not found`)
  if (step.status !== 'running') throw new Error(`Step '${stepName}' is not running`)

  // Handle deploy confirmation — record deployment info
  if (stepName === 'deploy_mini_brain' || stepName === 'deploy_development') {
    const targetId = stepName === 'deploy_development' ? wf.devEntityId : wf.entityId
    if (targetId && (data.deploymentRef || data.deploymentProvider || data.version)) {
      await db
        .update(brainEntities)
        .set({
          deploymentProvider: data.deploymentProvider ?? undefined,
          deploymentRef: data.deploymentRef ?? undefined,
          version: data.version ?? undefined,
          lastDeployedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(brainEntities.id, targetId))
    }
  }

  // Handle registration — write endpoint to entity
  if (stepName === 'register_mini_brain' || stepName === 'register_development') {
    const targetId = stepName === 'register_development' ? wf.devEntityId : wf.entityId
    if (targetId && data.endpoint) {
      await db
        .update(brainEntities)
        .set({
          endpoint: data.endpoint,
          healthEndpoint: data.healthEndpoint ?? `${data.endpoint}/health`,
          status: 'deployed',
          updatedAt: new Date(),
        })
        .where(eq(brainEntities.id, targetId))

      // Update config with mini brain URL for dev app
      if (stepName === 'register_mini_brain') {
        const config = (wf.config ?? {}) as Record<string, unknown>
        const devConfig = (config.development ?? {}) as Record<string, unknown>
        devConfig.MINI_BRAIN_URL = data.endpoint
        config.development = devConfig
        await db
          .update(deploymentWorkflows)
          .set({ config })
          .where(eq(deploymentWorkflows.id, workflowId))
      }
    }
  }

  step.status = 'completed'
  step.completedAt = new Date().toISOString()
  step.result = data as Record<string, unknown>

  await db
    .update(deploymentWorkflows)
    .set({ steps: JSON.parse(JSON.stringify(steps)) })
    .where(eq(deploymentWorkflows.id, workflowId))

  await auditEvent(db, userId, 'deployment_step', 'deployment_workflow', workflowId, {
    step: stepName,
    status: 'confirmed',
    entityId: wf.entityId,
  })

  // Auto-advance to next step
  return advanceWorkflow(db, workflowId, userId)
}

// ── Retry ────────────────────────────────────────────────────────────

export async function retryStep(
  db: Database,
  workflowId: string,
  stepName: string,
  userId: string,
) {
  const wf = await db.query.deploymentWorkflows.findFirst({
    where: eq(deploymentWorkflows.id, workflowId),
  })
  if (!wf) throw new Error('Workflow not found')

  const steps = wf.steps as WorkflowStep[]
  const step = steps.find((s) => s.name === stepName)
  if (!step) throw new Error(`Step '${stepName}' not found`)
  if (step.status !== 'failed') throw new Error('Can only retry failed steps')

  step.status = 'pending'
  step.error = undefined
  step.completedAt = undefined
  step.startedAt = undefined

  await db
    .update(deploymentWorkflows)
    .set({
      status: 'running',
      error: null,
      steps: JSON.parse(JSON.stringify(steps)),
    })
    .where(eq(deploymentWorkflows.id, workflowId))

  await auditEvent(db, userId, 'deployment_retry', 'deployment_workflow', workflowId, {
    step: stepName,
    entityId: wf.entityId,
  })

  return advanceWorkflow(db, workflowId, userId)
}

// ── Cancel ───────────────────────────────────────────────────────────

export async function cancelWorkflow(db: Database, workflowId: string, userId: string) {
  await db
    .update(deploymentWorkflows)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(deploymentWorkflows.id, workflowId))

  await auditEvent(db, userId, 'cancel_deployment', 'deployment_workflow', workflowId)
}

// ── Query ────────────────────────────────────────────────────────────

export async function getWorkflowWithEntity(db: Database, workflowId: string) {
  const wf = await db.query.deploymentWorkflows.findFirst({
    where: eq(deploymentWorkflows.id, workflowId),
  })
  if (!wf) return null

  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, wf.entityId),
  })

  const devEntity = wf.devEntityId
    ? await db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, wf.devEntityId),
      })
    : null

  const steps = wf.steps as WorkflowStep[]
  const completedCount = steps.filter((s) => s.status === 'completed').length
  const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0

  return {
    ...wf,
    entity: entity
      ? {
          id: entity.id,
          name: entity.name,
          tier: entity.tier,
          status: entity.status,
          domain: entity.domain,
        }
      : null,
    devEntity: devEntity
      ? { id: devEntity.id, name: devEntity.name, status: devEntity.status }
      : null,
    progress,
  }
}

// ── Step Execution ───────────────────────────────────────────────────

async function executeStep(
  db: Database,
  entityId: string,
  devEntityId: string | null,
  stepName: string,
  _config: WorkflowConfig | null,
): Promise<Record<string, unknown> | null> {
  switch (stepName) {
    case 'provision_db':
      return executeProvisionDb(db, entityId)
    case 'configure':
      return executeConfigure(db, entityId, devEntityId)
    case 'verify_mini_brain':
      return executeVerify(db, entityId)
    case 'verify_development':
      if (!devEntityId) return null
      return executeVerify(db, devEntityId)
    case 'activate':
      return executeActivate(db, entityId, devEntityId)
    default:
      return null
  }
}

async function executeProvisionDb(
  db: Database,
  entityId: string,
): Promise<Record<string, unknown>> {
  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, entityId),
  })
  if (!entity) throw new Error('Entity not found')

  // Skip if already provisioned
  if (entity.encryptedDatabaseUrl) {
    return { skipped: true, reason: 'Database already provisioned' }
  }

  const apiKey = process.env.NEON_API_KEY
  const projectId = process.env.NEON_PROJECT_ID

  if (!apiKey || !projectId) {
    // Neon not configured — skip gracefully
    return { skipped: true, reason: 'NEON_API_KEY or NEON_PROJECT_ID not set' }
  }

  const branchName = `mb-${entityId.slice(0, 8)}-${entity.name.replace(/\W/g, '-').toLowerCase().slice(0, 20)}`
  const result = await createNeonBranch({ apiKey, projectId, branchName })

  await db
    .update(brainEntities)
    .set({
      encryptedDatabaseUrl: encrypt(result.connectionUri),
      config: {
        ...((entity.config as Record<string, unknown>) ?? {}),
        neon: {
          branchId: result.branchId,
          endpointId: result.endpointId,
          host: result.host,
          databaseName: result.databaseName,
          createdAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(brainEntities.id, entityId))

  return { branchId: result.branchId, host: result.host }
}

async function executeConfigure(
  db: Database,
  entityId: string,
  devEntityId: string | null,
): Promise<Record<string, unknown>> {
  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, entityId),
  })
  if (!entity) throw new Error('Entity not found')

  // Create tracked secrets via secret-manager
  const triggeredBy = entity.ownerUserId ?? '00000000-0000-0000-0000-000000000000'
  const appSecretResult = await createSecret(db, entityId, 'mini_brain_secret', triggeredBy)

  const mbConfig = {
    ENTITY_ID: entity.id,
    BRAIN_URL:
      (process.env.BRAIN_URL ?? process.env.NEXT_PUBLIC_APP_URL)
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/brain`
        : 'http://localhost:3000/api/brain',
    DATABASE_URL: entity.encryptedDatabaseUrl ? '(provisioned)' : '(not provisioned)',
    DOMAIN_NAME: entity.domain ?? 'unknown',
    PORT: '3100',
    APP_SECRET: appSecretResult.plaintextKey,
  }

  const configUpdate: Record<string, unknown> = { miniBrain: mbConfig }

  if (devEntityId) {
    const authSecretResult = await createSecret(db, devEntityId, 'app_secret', triggeredBy)
    configUpdate.development = {
      MINI_BRAIN_URL: '(set after mini brain registered)',
      AUTH_SECRET: authSecretResult.plaintextKey,
      COOKIE_NAME: `solarc_${entity.domain ?? 'app'}_session`,
    }
  }

  // Transition entity to configured
  await db
    .update(brainEntities)
    .set({ status: 'configured', updatedAt: new Date() })
    .where(eq(brainEntities.id, entityId))

  if (devEntityId) {
    await db
      .update(brainEntities)
      .set({ status: 'configured', updatedAt: new Date() })
      .where(eq(brainEntities.id, devEntityId))
  }

  return { configUpdate }
}

async function executeVerify(db: Database, entityId: string): Promise<Record<string, unknown>> {
  const entity = await db.query.brainEntities.findFirst({
    where: eq(brainEntities.id, entityId),
  })
  if (!entity) throw new Error('Entity not found')
  if (!entity.endpoint) throw new Error('No endpoint registered — register endpoint first')

  const healthUrl = entity.healthEndpoint ?? `${entity.endpoint}/health`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(healthUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`Health check returned ${res.status}`)

    const body = await res.json().catch(() => null)
    const status = body?.status ?? 'unknown'

    if (status !== 'ok' && status !== 'degraded') {
      throw new Error(`Health check returned status: ${status}`)
    }

    // Transition to verified
    await db
      .update(brainEntities)
      .set({ status: 'verified', lastHealthCheck: new Date(), updatedAt: new Date() })
      .where(eq(brainEntities.id, entityId))

    return { healthStatus: status, latencyMs: Date.now() }
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(
      `Health verification failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

async function executeActivate(
  db: Database,
  entityId: string,
  devEntityId: string | null,
): Promise<Record<string, unknown>> {
  await db
    .update(brainEntities)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(brainEntities.id, entityId))

  if (devEntityId) {
    await db
      .update(brainEntities)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(brainEntities.id, devEntityId))
  }

  return { activated: true, entityId, devEntityId }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function completeWorkflow(db: Database, workflowId: string, steps: WorkflowStep[]) {
  await db
    .update(deploymentWorkflows)
    .set({
      status: 'completed',
      currentStep: null,
      steps: JSON.parse(JSON.stringify(steps)),
      completedAt: new Date(),
    })
    .where(eq(deploymentWorkflows.id, workflowId))
}

async function createDeploymentIncident(
  db: Database,
  entityId: string,
  stepName: string,
  error: string,
) {
  try {
    const entity = await db.query.brainEntities.findFirst({
      where: eq(brainEntities.id, entityId),
    })
    await db.insert(incidents).values({
      serviceId: entityId,
      serviceName: entity?.name ?? entityId,
      severity: 'medium' as const,
      status: 'triggered',
      message: `Deployment step '${stepName}' failed: ${error}`,
      metadata: { entityId, step: stepName, error },
    })
  } catch {
    // Incident creation is non-blocking
  }
}
