/**
 * Browser Agent Stream
 *
 * Extends OpenClaw's Playwright integration to provide real-time
 * streaming of browser automation sessions:
 * - SSE events: screenshot, action, navigation, error
 * - Screenshot capture every 2s during automation
 * - Storage with 24h retention (S3 or local disk)
 */

export type StreamEventType = 'screenshot' | 'action' | 'navigation' | 'error' | 'status'

export interface StreamEvent {
  type: StreamEventType
  sessionId: string
  timestamp: Date
  data: ScreenshotEvent | ActionEvent | NavigationEvent | ErrorEvent | StatusEvent
}

export interface ScreenshotEvent {
  /** Base64-encoded PNG or a URL to stored screenshot */
  imageUrl: string
  /** Width/height of the screenshot */
  width: number
  height: number
  /** Sequential screenshot number */
  sequence: number
}

export interface ActionEvent {
  action: string
  selector?: string
  value?: string
  description: string
}

export interface NavigationEvent {
  from: string
  to: string
  statusCode?: number
}

export interface ErrorEvent {
  message: string
  code?: string
  recoverable: boolean
}

export interface StatusEvent {
  status: 'started' | 'paused' | 'resumed' | 'stopped' | 'takeover'
  reason?: string
}

// ── Session ─────────────────────────────────────────────────────────────

export interface BrowserSession {
  id: string
  agentId: string
  agentName: string
  startedAt: Date
  status: 'running' | 'paused' | 'stopped'
  currentUrl: string
  /** All events in this session */
  events: StreamEvent[]
  /** Latest screenshot URL */
  latestScreenshot?: string
  /** Connected SSE listeners */
  listeners: Set<(event: StreamEvent) => void>
  /** Screenshot capture interval handle */
  captureInterval?: ReturnType<typeof setInterval>
}

export interface StoredScreenshot {
  sessionId: string
  sequence: number
  url: string
  capturedAt: Date
  /** Auto-delete after this time */
  expiresAt: Date
}

// ── Stream Manager ──────────────────────────────────────────────────────

const SCREENSHOT_INTERVAL_MS = 2000
const SCREENSHOT_RETENTION_HOURS = 24

const activeSessions = new Map<string, BrowserSession>()
const storedScreenshots: StoredScreenshot[] = []

export class BrowserAgentStream {
  // ── Session Lifecycle ─────────────────────────────────────────────────

  /** Start a new browser streaming session */
  startSession(agentId: string, agentName: string, initialUrl: string = 'about:blank'): string {
    const sessionId = crypto.randomUUID()

    const session: BrowserSession = {
      id: sessionId,
      agentId,
      agentName,
      startedAt: new Date(),
      status: 'running',
      currentUrl: initialUrl,
      events: [],
      listeners: new Set(),
    }

    activeSessions.set(sessionId, session)

    // Start periodic screenshot capture
    session.captureInterval = setInterval(() => {
      if (session.status === 'running') {
        this.captureScreenshot(sessionId)
      }
    }, SCREENSHOT_INTERVAL_MS)

    this.emit(sessionId, {
      type: 'status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'started' } as StatusEvent,
    })

    return sessionId
  }

  /** Pause a session (agent stops but browser stays open) */
  pauseSession(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId)
    session.status = 'paused'
    this.emit(sessionId, {
      type: 'status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'paused' } as StatusEvent,
    })
  }

  /** Resume a paused session */
  resumeSession(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId)
    session.status = 'running'
    this.emit(sessionId, {
      type: 'status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'resumed' } as StatusEvent,
    })
  }

  /** Human takes over the browser session */
  takeoverSession(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId)
    session.status = 'paused'
    this.emit(sessionId, {
      type: 'status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'takeover', reason: 'Human took control of browser session' } as StatusEvent,
    })
  }

  /** Stop and clean up a session */
  stopSession(sessionId: string): void {
    const session = activeSessions.get(sessionId)
    if (!session) return

    session.status = 'stopped'
    if (session.captureInterval) clearInterval(session.captureInterval)

    this.emit(sessionId, {
      type: 'status',
      sessionId,
      timestamp: new Date(),
      data: { status: 'stopped' } as StatusEvent,
    })

    session.listeners.clear()
    activeSessions.delete(sessionId)
  }

  // ── Event Emission ────────────────────────────────────────────────────

  /** Record an action event (click, type, scroll, etc.) */
  emitAction(
    sessionId: string,
    action: string,
    description: string,
    selector?: string,
    value?: string,
  ): void {
    this.emit(sessionId, {
      type: 'action',
      sessionId,
      timestamp: new Date(),
      data: { action, description, selector, value } as ActionEvent,
    })
  }

  /** Record a navigation event */
  emitNavigation(sessionId: string, from: string, to: string, statusCode?: number): void {
    const session = this.getSessionOrThrow(sessionId)
    session.currentUrl = to
    this.emit(sessionId, {
      type: 'navigation',
      sessionId,
      timestamp: new Date(),
      data: { from, to, statusCode } as NavigationEvent,
    })
  }

  /** Record an error */
  emitError(sessionId: string, message: string, recoverable: boolean, code?: string): void {
    this.emit(sessionId, {
      type: 'error',
      sessionId,
      timestamp: new Date(),
      data: { message, recoverable, code } as ErrorEvent,
    })
  }

  // ── Screenshots ───────────────────────────────────────────────────────

  /** Whether we already logged the playwright-missing warning */
  private playwrightWarned = false

  /**
   * Capture and store a screenshot.
   * Attempts to use Playwright for a real capture; falls back to placeholder URL.
   */
  captureScreenshot(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId)
    const sequence = session.events.filter((e) => e.type === 'screenshot').length

    // Default placeholder
    let screenshotUrl = `/screenshots/${sessionId}/${sequence}.png`
    let width = 1280
    let height = 720

    // Try real Playwright capture asynchronously
    void (async () => {
      try {
        // Playwright is an optional peer dependency — dynamically imported
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pw = await (Function('return import("playwright")')() as Promise<any>).catch(
          () => null,
        )
        if (!pw) {
          if (!this.playwrightWarned) {
            console.warn(
              '[BrowserAgentStream] playwright not available — using placeholder screenshot URLs',
            )
            this.playwrightWarned = true
          }
          return
        }

        const browser = await pw.chromium.launch({ headless: true })
        const page = await browser.newPage()
        await page
          .goto(session.currentUrl, { timeout: 8000 })
          .catch((err: unknown) =>
            console.warn(
              '[BrowserAgent] navigation failed:',
              err instanceof Error ? err.message : String(err),
            ),
          )
        const buf = await page.screenshot({ type: 'png' })
        await browser.close()

        const base64 = `data:image/png;base64,${buf.toString('base64')}`
        screenshotUrl = base64
        const viewport = page.viewportSize()
        if (viewport) {
          width = viewport.width
          height = viewport.height
        }

        // Update the already-stored record with real data
        const existing = storedScreenshots.find(
          (s) => s.sessionId === sessionId && s.sequence === sequence,
        )
        if (existing) existing.url = screenshotUrl
        session.latestScreenshot = screenshotUrl
      } catch (err) {
        console.warn(`[BrowserStream] Screenshot capture failed for session ${sessionId}:`, err)
      }
    })()

    const stored: StoredScreenshot = {
      sessionId,
      sequence,
      url: screenshotUrl,
      capturedAt: new Date(),
      expiresAt: new Date(Date.now() + SCREENSHOT_RETENTION_HOURS * 60 * 60 * 1000),
    }
    storedScreenshots.push(stored)
    session.latestScreenshot = screenshotUrl

    this.emit(sessionId, {
      type: 'screenshot',
      sessionId,
      timestamp: new Date(),
      data: {
        imageUrl: screenshotUrl,
        width,
        height,
        sequence,
      } as ScreenshotEvent,
    })
  }

  /** Get all screenshots for a session */
  getScreenshots(sessionId: string): StoredScreenshot[] {
    return storedScreenshots.filter((s) => s.sessionId === sessionId)
  }

  /** Clean up expired screenshots */
  cleanExpiredScreenshots(): number {
    const now = new Date()
    const before = storedScreenshots.length
    const remaining = storedScreenshots.filter((s) => s.expiresAt > now)
    storedScreenshots.length = 0
    storedScreenshots.push(...remaining)
    return before - remaining.length
  }

  // ── SSE Subscription ──────────────────────────────────────────────────

  /** Subscribe to real-time events for a session */
  subscribe(sessionId: string, listener: (event: StreamEvent) => void): () => void {
    const session = this.getSessionOrThrow(sessionId)
    session.listeners.add(listener)
    return () => session.listeners.delete(listener)
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** List all active browser sessions */
  listActiveSessions(): Array<{
    id: string
    agentId: string
    agentName: string
    startedAt: Date
    status: string
    currentUrl: string
    eventCount: number
    latestScreenshot?: string
  }> {
    return Array.from(activeSessions.values()).map((s) => ({
      id: s.id,
      agentId: s.agentId,
      agentName: s.agentName,
      startedAt: s.startedAt,
      status: s.status,
      currentUrl: s.currentUrl,
      eventCount: s.events.length,
      latestScreenshot: s.latestScreenshot,
    }))
  }

  /** Get full event history for a session */
  getSessionEvents(sessionId: string): StreamEvent[] {
    const session = activeSessions.get(sessionId)
    return session?.events ?? []
  }

  /** Get session info */
  getSession(sessionId: string): BrowserSession | null {
    return activeSessions.get(sessionId) ?? null
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private emit(sessionId: string, event: StreamEvent): void {
    const session = activeSessions.get(sessionId)
    if (!session) return
    session.events.push(event)
    for (const listener of session.listeners) {
      listener(event)
    }
  }

  private getSessionOrThrow(sessionId: string): BrowserSession {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error(`No active session: ${sessionId}`)
    return session
  }
}
