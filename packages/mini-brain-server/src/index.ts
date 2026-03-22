// @solarc/mini-brain-server — Mini Brain exposes DOWN to Developments

export interface MiniBrainServerConfig {
  engines: Record<string, unknown>
  agents: unknown[]
  guardrails: unknown[]
  proxy: Record<string, unknown>
}

export function createMiniBrainServer(_config: MiniBrainServerConfig) {
  // TODO: Phase 17B — implement Mini Brain server that exposes domain engines to Developments
  throw new Error('@solarc/mini-brain-server: Not yet implemented. Build Mini Brain Factory first (Phase 17B).')
}
