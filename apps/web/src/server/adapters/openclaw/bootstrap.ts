/**
 * OpenClaw Bootstrap — Singleton initialization & capability discovery.
 *
 * Manages the lifecycle of the Brain's connection to the OpenClaw daemon.
 * When OPENCLAW_WS is set, the Brain connects via WebSocket and discovers
 * available providers, channels, skills, and MCP servers. When unset,
 * the Brain runs standalone (direct SDK adapters only).
 *
 * Capabilities are re-discovered on every reconnect and every 5 minutes,
 * so the Brain automatically picks up OpenClaw updates without restarts.
 */
import { env } from '../../../env'
import { OpenClawClient } from './client'
import { OpenClawProviders } from './providers'
import { OpenClawHealthMonitor } from './health'

// ── Types ────────────────────────────────────────────────────────────

export interface OpenClawCapabilities {
  version: string
  providers: string[]
  channels: string[]
  skills: Array<{ name: string; description: string; params?: Record<string, unknown> }>
  mcpServers: Array<{ name: string; tools: string[] }>
}

export interface OpenClawStatus {
  connected: boolean
  version: string | null
  lastSeen: Date | null
  lastDiscovery: Date | null
  capabilities: {
    providers: number
    channels: number
    skills: number
    mcpServers: number
  }
}

// ── Singleton State ──────────────────────────────────────────────────

let client: OpenClawClient | null = null
let providers: OpenClawProviders | null = null
let healthMonitor: OpenClawHealthMonitor | null = null
let capabilities: OpenClawCapabilities | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let initialized = false

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Capability Discovery ─────────────────────────────────────────────

/**
 * Ask the OpenClaw daemon what it currently supports.
 * Called on every connect/reconnect and periodically.
 */
async function discoverCapabilities(oc: OpenClawClient): Promise<OpenClawCapabilities | null> {
  if (!oc.isConnected()) return null

  return new Promise((resolve) => {
    const requestId = crypto.randomUUID()
    const timeout = setTimeout(() => {
      oc.removeAllListeners(`response:${requestId}`)
      console.warn('[OpenClaw] Capability discovery timed out after 10s')
      resolve(null)
    }, 10_000)

    oc.once(`response:${requestId}`, (data: OpenClawCapabilities) => {
      clearTimeout(timeout)
      resolve(data)
    })

    oc.once(`error:${requestId}`, () => {
      clearTimeout(timeout)
      resolve(null)
    })

    try {
      oc.send({ type: 'system.capabilities', requestId })
    } catch {
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

function logCapabilities(caps: OpenClawCapabilities, previous: OpenClawCapabilities | null): void {
  if (!previous) {
    console.warn(
      `[OpenClaw] Connected v${caps.version} — ` +
        `${caps.providers.length} providers, ${caps.channels.length} channels, ` +
        `${caps.skills.length} skills, ${caps.mcpServers.length} MCP servers`,
    )
    return
  }

  const diffs: string[] = []
  const dp = caps.providers.length - previous.providers.length
  const dc = caps.channels.length - previous.channels.length
  const ds = caps.skills.length - previous.skills.length
  const dm = caps.mcpServers.length - previous.mcpServers.length
  if (dp !== 0) diffs.push(`${dp > 0 ? '+' : ''}${dp} providers`)
  if (dc !== 0) diffs.push(`${dc > 0 ? '+' : ''}${dc} channels`)
  if (ds !== 0) diffs.push(`${ds > 0 ? '+' : ''}${ds} skills`)
  if (dm !== 0) diffs.push(`${dm > 0 ? '+' : ''}${dm} MCP servers`)

  if (diffs.length > 0) {
    console.warn(`[OpenClaw] Capabilities updated: ${diffs.join(', ')}`)
  }
}

async function refreshCapabilities(): Promise<void> {
  if (!client || !client.isConnected()) return

  const previous = capabilities
  const discovered = await discoverCapabilities(client)
  if (discovered) {
    logCapabilities(discovered, previous)
    capabilities = discovered
    client.setDaemonVersion(discovered.version)
  }
}

// ── Initialization ───────────────────────────────────────────────────

/**
 * Initialize the OpenClaw connection if OPENCLAW_WS is configured.
 * Safe to call multiple times — only initializes once.
 * Non-blocking: startup continues even if daemon is unreachable.
 */
export async function initOpenClaw(): Promise<void> {
  if (initialized) return
  initialized = true

  const wsUrl = env.OPENCLAW_WS
  if (!wsUrl) {
    console.warn('[OpenClaw] OPENCLAW_WS not set — running without OpenClaw')
    return
  }

  const token = env.OPENCLAW_TOKEN
  client = new OpenClawClient({ wsUrl, token })
  providers = new OpenClawProviders(client)
  healthMonitor = new OpenClawHealthMonitor(client)

  // Discover capabilities on every connect/reconnect
  client.on('connected', () => {
    refreshCapabilities().catch((err) => {
      console.warn('[OpenClaw] Capability discovery failed:', err)
    })
  })

  // Periodic refresh (picks up OpenClaw updates without reconnect)
  refreshInterval = setInterval(() => {
    refreshCapabilities().catch((err) =>
      console.warn('[OpenClaw] capability refresh failed:', err.message),
    )
  }, REFRESH_INTERVAL_MS)

  // Start health pings
  healthMonitor.start()

  // Connect (non-blocking — reconnects automatically on failure)
  client.connect().catch((err) => {
    console.warn('[OpenClaw] Initial connection failed (will retry):', err)
  })
}

// ── Getters ──────────────────────────────────────────────────────────

export function getOpenClawClient(): OpenClawClient | null {
  return client
}

export function getOpenClawProviders(): OpenClawProviders | null {
  return providers
}

export function getOpenClawCapabilities(): OpenClawCapabilities | null {
  return capabilities
}

export function getOpenClawStatus(): OpenClawStatus {
  return {
    connected: client?.isConnected() ?? false,
    version: client?.getDaemonVersion() ?? null,
    lastSeen: healthMonitor?.getLastSeen() ?? null,
    lastDiscovery: capabilities ? new Date() : null,
    capabilities: {
      providers: capabilities?.providers.length ?? 0,
      channels: capabilities?.channels.length ?? 0,
      skills: capabilities?.skills.length ?? 0,
      mcpServers: capabilities?.mcpServers.length ?? 0,
    },
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────

export async function shutdownOpenClaw(): Promise<void> {
  if (refreshInterval) clearInterval(refreshInterval)
  healthMonitor?.stop()
  await client?.disconnect()
  client = null
  providers = null
  healthMonitor = null
  capabilities = null
  initialized = false
}
