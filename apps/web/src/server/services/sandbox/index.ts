export { SandboxAuditBridge, type SandboxAuditEntry } from './sandbox-audit-bridge'
export {
  type ExecutionContext,
  type SandboxedExecResult,
  SandboxExecutor,
} from './sandbox-executor'
export {
  type SandboxConfig,
  type SandboxExecResult,
  type SandboxInstance,
  SandboxManager,
  type SandboxResourceLimits,
  type SandboxStatus,
  type SandboxViolation,
} from './sandbox-manager'
export {
  type DelegationRequest,
  type DelegationResult,
  type DepartmentQuota,
  type OrchestratorStatus,
  SandboxOrchestrator,
} from './sandbox-orchestrator'
export { type PolicyCheckResult, type SandboxPolicy, SandboxPolicyEngine } from './sandbox-policy'

// ── Singleton ────────────────────────────────────────────────────────────

import { SandboxOrchestrator as OrchestratorClass } from './sandbox-orchestrator'

let _orchestrator: InstanceType<typeof OrchestratorClass> | null = null

export function getSandboxOrchestrator() {
  if (!_orchestrator) {
    _orchestrator = new OrchestratorClass()
  }
  return _orchestrator
}
