// @solarc/mini-brain-server — Mini Brain exposes DOWN to Developments

export interface MiniBrainServerConfig {
  engines: Record<string, unknown>
  agents: unknown[]
  guardrails: unknown[]
  proxy: Record<string, unknown>
  /** Connection to the parent Brain (for proxying OpenClaw requests). */
  brainUrl?: string
  brainApiKey?: string
  entityId?: string
}

export function createMiniBrainServer(config: MiniBrainServerConfig) {
  const server = {
    config,
    started: false,

    async start(port = 3100) {
      this.started = true
      console.warn(
        `[MiniBrain] Server ready on port ${port} with ${Object.keys(config.engines).length} engines`,
      )
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

    // ── OpenClaw Proxy (Development → Mini Brain → Brain → OpenClaw) ──

    /**
     * Proxy an LLM chat request from a Development up to the Brain.
     * The Brain applies budget enforcement and routes through OpenClaw.
     */
    async proxyChat(params: {
      model: string
      messages: Array<{ role: string; content: string }>
      tools?: unknown[]
    }) {
      if (!config.brainUrl || !config.entityId) {
        throw new Error('Mini Brain not connected to parent Brain — proxyChat unavailable')
      }

      const response = await fetch(`${config.brainUrl}/api/trpc/intelligence.entityChat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.brainApiKey && { Authorization: `Bearer ${config.brainApiKey}` }),
        },
        body: JSON.stringify({
          json: {
            entityId: config.entityId,
            model: params.model,
            messages: params.messages,
            tools: params.tools,
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Brain proxy chat failed: ${response.status} ${text}`)
      }

      const result = (await response.json()) as Record<string, unknown>
      return (result as { result?: { data?: { json?: unknown } } }).result?.data?.json ?? result
    },

    /**
     * Proxy a skill invocation from a Development up to the Brain.
     */
    async proxySkillInvoke(params: { skill: string; params: Record<string, unknown> }) {
      if (!config.brainUrl || !config.entityId) {
        throw new Error('Mini Brain not connected to parent Brain — proxySkillInvoke unavailable')
      }

      const response = await fetch(`${config.brainUrl}/api/trpc/intelligence.entitySkillInvoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.brainApiKey && { Authorization: `Bearer ${config.brainApiKey}` }),
        },
        body: JSON.stringify({
          json: {
            entityId: config.entityId,
            skill: params.skill,
            params: params.params,
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Brain proxy skill invoke failed: ${response.status} ${text}`)
      }

      const result = (await response.json()) as Record<string, unknown>
      return (result as { result?: { data?: { json?: unknown } } }).result?.data?.json ?? result
    },

    /**
     * Proxy a channel message send from a Development up to the Brain.
     */
    async proxyChannelSend(params: { channel: string; to: string; content: string }) {
      if (!config.brainUrl || !config.entityId) {
        throw new Error('Mini Brain not connected to parent Brain — proxyChannelSend unavailable')
      }

      const response = await fetch(`${config.brainUrl}/api/trpc/intelligence.entityChannelSend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.brainApiKey && { Authorization: `Bearer ${config.brainApiKey}` }),
        },
        body: JSON.stringify({
          json: {
            entityId: config.entityId,
            channel: params.channel,
            to: params.to,
            content: params.content,
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Brain proxy channel send failed: ${response.status} ${text}`)
      }

      const result = (await response.json()) as Record<string, unknown>
      return (result as { result?: { data?: { json?: unknown } } }).result?.data?.json ?? result
    },
  }

  return server
}
