/**
 * Per-provider circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * - OPEN after `threshold` failures in `windowMs`
 * - HALF_OPEN after `cooldownMs` (allow 1 probe request)
 * - CLOSED after `successThreshold` consecutive successes in HALF_OPEN
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  /** Failures within windowMs to trip OPEN */
  threshold: number
  /** Time window for failure counting (ms) */
  windowMs: number
  /** Cooldown before transitioning OPEN → HALF_OPEN (ms) */
  cooldownMs: number
  /** Consecutive successes in HALF_OPEN to close */
  successThreshold: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  threshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
  successThreshold: 3,
}

interface ProviderCircuit {
  state: CircuitState
  failures: number[]
  lastFailureAt: number
  openedAt: number
  consecutiveSuccesses: number
}

export class CircuitBreakerRegistry {
  private circuits = new Map<string, ProviderCircuit>()
  private config: CircuitBreakerConfig

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Get or initialize a circuit for a provider */
  private getCircuit(provider: string): ProviderCircuit {
    let circuit = this.circuits.get(provider)
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failures: [],
        lastFailureAt: 0,
        openedAt: 0,
        consecutiveSuccesses: 0,
      }
      this.circuits.set(provider, circuit)
    }
    return circuit
  }

  /** Check if a provider can accept requests. Transitions OPEN → HALF_OPEN if cooldown elapsed. */
  canRequest(provider: string): boolean {
    const circuit = this.getCircuit(provider)
    const now = Date.now()

    if (circuit.state === 'CLOSED') return true

    if (circuit.state === 'OPEN') {
      if (now - circuit.openedAt >= this.config.cooldownMs) {
        circuit.state = 'HALF_OPEN'
        circuit.consecutiveSuccesses = 0
        return true // allow one probe
      }
      return false
    }

    // HALF_OPEN: allow requests (they're being tested)
    return true
  }

  /** Record a successful request. In HALF_OPEN, close circuit after enough successes. */
  recordSuccess(provider: string): void {
    const circuit = this.getCircuit(provider)

    if (circuit.state === 'HALF_OPEN') {
      circuit.consecutiveSuccesses++
      if (circuit.consecutiveSuccesses >= this.config.successThreshold) {
        circuit.state = 'CLOSED'
        circuit.failures = []
        circuit.consecutiveSuccesses = 0
      }
    } else if (circuit.state === 'CLOSED') {
      // Reset consecutive success tracking
      circuit.consecutiveSuccesses++
    }
  }

  /** Record a failure. In CLOSED, count toward threshold. In HALF_OPEN, reopen immediately. */
  recordFailure(provider: string): void {
    const circuit = this.getCircuit(provider)
    const now = Date.now()

    if (circuit.state === 'HALF_OPEN') {
      // Probe failed — back to OPEN
      circuit.state = 'OPEN'
      circuit.openedAt = now
      circuit.consecutiveSuccesses = 0
      return
    }

    // CLOSED: add failure and prune expired ones
    circuit.failures.push(now)
    circuit.lastFailureAt = now

    // Remove failures outside the window
    const windowStart = now - this.config.windowMs
    circuit.failures = circuit.failures.filter((t) => t >= windowStart)

    if (circuit.failures.length >= this.config.threshold) {
      circuit.state = 'OPEN'
      circuit.openedAt = now
      circuit.consecutiveSuccesses = 0
    }
  }

  /** Get current state for a provider (for monitoring/dashboards) */
  getState(provider: string): { state: CircuitState; failures: number; lastFailureAt: number } {
    const circuit = this.getCircuit(provider)
    return {
      state: circuit.state,
      failures: circuit.failures.length,
      lastFailureAt: circuit.lastFailureAt,
    }
  }

  /** Get all provider states (for health dashboard) */
  getAllStates(): Map<string, { state: CircuitState; failures: number }> {
    const result = new Map<string, { state: CircuitState; failures: number }>()
    for (const [provider, circuit] of this.circuits) {
      result.set(provider, { state: circuit.state, failures: circuit.failures.length })
    }
    return result
  }

  /** Force-reset a circuit (admin override) */
  reset(provider: string): void {
    this.circuits.delete(provider)
  }
}
