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

let _orchestrator: import('./sandbox-orchestrator').SandboxOrchestrator | null = null

export function getSandboxOrchestrator() {
  if (!_orchestrator) {
    _orchestrator = new (
      require('./sandbox-orchestrator') as typeof import('./sandbox-orchestrator')
    ).SandboxOrchestrator()
  }
  return _orchestrator
}
