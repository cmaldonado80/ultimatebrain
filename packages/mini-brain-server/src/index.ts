// @solarc/mini-brain-server — Mini Brain exposes DOWN to Developments

export interface MiniBrainServerConfig {
  engines: Record<string, unknown>
  agents: unknown[]
  guardrails: unknown[]
  proxy: Record<string, unknown>
}

export function createMiniBrainServer(config: MiniBrainServerConfig) {
  const server = {
    config,
    started: false,

    async start(port = 3100) {
      this.started = true
      console.warn(`[MiniBrain] Server ready on port ${port} with ${Object.keys(config.engines).length} engines`)
      return this
    },

    async stop() {
      this.started = false
      console.warn('[MiniBrain] Server stopped')
    },

    async health() {
      return {
        status: this.started ? 'healthy' : 'stopped',
        engines: Object.keys(config.engines).length,
        agents: config.agents.length,
        guardrails: config.guardrails.length,
      }
    },
  }

  return server
}
