/**
 * Canonical Snapshot Builders
 *
 * Each builder produces a structured, typed, deterministic view of one
 * subsystem's current state. These snapshots are the ONLY source of
 * runtime truth that agents should consume.
 *
 * Agents do NOT discover system state. They receive it.
 *
 * Rule: Snapshots are structured data, not prose. The narrative
 * is generated afterward by the LLM — the truth is the data.
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Types ────────────────────────────────────────────────────────────────

export interface SystemSnapshot {
  generatedAt: string
  cwd: string
  subsystems: SubsystemEntry[]
  totalFiles: number
  totalDirectories: number
}

export interface SubsystemEntry {
  name: string
  path: string
  type: 'directory' | 'file'
  fileCount?: number
  hasTests: boolean
  hasIndex: boolean
}

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  cortexCycles: number
  totalHealingActions: number
  totalRecoveries: number
  totalDegradations: number
  riskLevel: string
  agentProfiles: Array<{
    agentId: string
    agentName: string
    level: string
    pressure: number
  }>
}

export interface SandboxSnapshot {
  totalExecutions: number
  blockedByPolicy: number
  timeouts: number
  crashes: number
  poolSize: number
  successRate: number
}

export interface WorkspaceSnapshot {
  cwd: string
  projectRoot: string
  servicesPath: string
  servicesExist: boolean
  serviceDirectories: string[]
  totalServiceDirs: number
}

export interface AgentRoleSnapshot {
  agentId: string
  agentName: string
  role: string
  department: string
  availableTools: string[]
  capabilityLevel: string
}

// ── Builders ─────────────────────────────────────────────────────────────

/**
 * Build a canonical view of the workspace file structure.
 * This is what agents should use instead of calling file_system list.
 */
export function buildWorkspaceSnapshot(): WorkspaceSnapshot {
  const cwd = process.cwd()
  const servicesPath = path.join(cwd, 'src', 'server', 'services')
  let serviceDirectories: string[] = []

  try {
    const entries = fs.readdirSync(servicesPath, { withFileTypes: true })
    serviceDirectories = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    // Services path doesn't exist from this cwd
  }

  // Also try monorepo-relative paths
  if (serviceDirectories.length === 0) {
    const altPath = path.join(cwd, 'apps', 'web', 'src', 'server', 'services')
    try {
      const entries = fs.readdirSync(altPath, { withFileTypes: true })
      serviceDirectories = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    } catch {
      // Not found
    }
  }

  return {
    cwd,
    projectRoot: cwd,
    servicesPath: 'src/server/services',
    servicesExist: serviceDirectories.length > 0,
    serviceDirectories,
    totalServiceDirs: serviceDirectories.length,
  }
}

/**
 * Build a canonical view of a specific service subsystem.
 */
export function buildSubsystemSnapshot(subsystemName: string): SystemSnapshot {
  const cwd = process.cwd()
  const subsystemPath = path.join(cwd, 'src', 'server', 'services', subsystemName)
  const entries: SubsystemEntry[] = []
  let totalFiles = 0

  try {
    const items = fs.readdirSync(subsystemPath, { withFileTypes: true })
    for (const item of items) {
      if (item.isDirectory()) {
        // Count files in subdirectory
        try {
          const subItems = fs.readdirSync(path.join(subsystemPath, item.name))
          entries.push({
            name: item.name,
            path: `src/server/services/${subsystemName}/${item.name}`,
            type: 'directory',
            fileCount: subItems.length,
            hasTests: item.name === '__tests__',
            hasIndex: false,
          })
        } catch {
          entries.push({
            name: item.name,
            path: `src/server/services/${subsystemName}/${item.name}`,
            type: 'directory',
            hasTests: false,
            hasIndex: false,
          })
        }
      } else {
        totalFiles++
        entries.push({
          name: item.name,
          path: `src/server/services/${subsystemName}/${item.name}`,
          type: 'file',
          hasTests: false,
          hasIndex: item.name === 'index.ts',
        })
      }
    }
  } catch {
    // Subsystem doesn't exist
  }

  return {
    generatedAt: new Date().toISOString(),
    cwd,
    subsystems: entries,
    totalFiles,
    totalDirectories: entries.filter((e) => e.type === 'directory').length,
  }
}

/**
 * Build health snapshot from the cortex (if available).
 */
export function buildHealthSnapshot(): HealthSnapshot {
  try {
    const { getCortex } = require('../healing/index') as typeof import('../healing/index')
    const cortex = getCortex()
    if (!cortex) {
      return {
        status: 'unknown',
        cortexCycles: 0,
        totalHealingActions: 0,
        totalRecoveries: 0,
        totalDegradations: 0,
        riskLevel: 'unknown',
        agentProfiles: [],
      }
    }

    const status = cortex.getStatus()
    return {
      status:
        status.systemHealth === 'autonomous'
          ? 'healthy'
          : status.systemHealth === 'degraded'
            ? 'degraded'
            : 'unhealthy',
      cortexCycles: status.cycleCount,
      totalHealingActions: status.totalHealingActions,
      totalRecoveries: status.totalRecoveries,
      totalDegradations: status.totalDegradations,
      riskLevel: status.lastCycle?.phases.orient.riskLevel ?? 'unknown',
      agentProfiles: cortex.degradation.getAllProfiles().map((p) => ({
        agentId: p.agentId,
        agentName: p.agentName,
        level: p.level,
        pressure: p.pressure,
      })),
    }
  } catch {
    return {
      status: 'unknown',
      cortexCycles: 0,
      totalHealingActions: 0,
      totalRecoveries: 0,
      totalDegradations: 0,
      riskLevel: 'unknown',
      agentProfiles: [],
    }
  }
}

/**
 * Build sandbox snapshot (if available).
 */
export function buildSandboxSnapshot(): SandboxSnapshot {
  try {
    const { getSandboxOrchestrator } =
      require('../sandbox/index') as typeof import('../sandbox/index')
    const orchestrator = getSandboxOrchestrator()
    const status = orchestrator.getStatus()
    return {
      totalExecutions: status.executor.totalExecutions,
      blockedByPolicy: status.executor.blockedByPolicy,
      timeouts: status.executor.timeouts,
      crashes: status.executor.crashes,
      poolSize: status.poolStats.total,
      successRate: status.audit.successRate,
    }
  } catch {
    return {
      totalExecutions: 0,
      blockedByPolicy: 0,
      timeouts: 0,
      crashes: 0,
      poolSize: 0,
      successRate: 1,
    }
  }
}
