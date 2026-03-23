/**
 * Visual QA Recorder
 *
 * Records browser automation sessions as annotated video:
 * - Captures screenshot stream during Playwright automation
 * - Assembles into video via ffmpeg
 * - Annotates with action labels, pass/fail markers, timestamps
 * - Stores recordings with 7-day retention
 */

export type QAVerdict = 'pass' | 'fail' | 'pending' | 'skipped'

export interface RecordingAnnotation {
  /** Time offset in milliseconds from recording start */
  timestampMs: number
  label: string
  type: 'action' | 'assertion' | 'navigation' | 'error' | 'marker'
  verdict?: QAVerdict
  /** Screenshot index at this annotation */
  screenshotIndex: number
  /** Extra details */
  details?: string
}

export interface RecordingFrame {
  index: number
  /** Path or URL to the screenshot */
  imageUrl: string
  capturedAt: Date
  /** Time offset in ms from recording start */
  offsetMs: number
  width: number
  height: number
}

export interface QARecording {
  id: string
  sessionId: string
  agentId: string
  agentName: string
  /** Associated ticket or task */
  ticketId?: string
  startedAt: Date
  endedAt?: Date
  durationMs: number
  status: 'recording' | 'processing' | 'ready' | 'expired'
  /** URL to the assembled video file */
  videoUrl?: string
  /** Individual frames */
  frames: RecordingFrame[]
  /** Timeline annotations */
  annotations: RecordingAnnotation[]
  /** Overall QA verdict */
  verdict: QAVerdict
  /** Verdict breakdown */
  verdictSummary?: {
    totalAssertions: number
    passed: number
    failed: number
    skipped: number
  }
  /** When this recording auto-deletes */
  expiresAt: Date
}

export interface RecorderOptions {
  /** Milliseconds between screenshots (default: 500) */
  captureIntervalMs?: number
  /** Max recording duration in ms (default: 300000 = 5 min) */
  maxDurationMs?: number
  /** Screenshot resolution */
  width?: number
  height?: number
}

// ── Constants ───────────────────────────────────────────────────────────

const DEFAULT_CAPTURE_INTERVAL = 500
const DEFAULT_MAX_DURATION = 300_000
const RETENTION_DAYS = 7

// ── Active recordings ───────────────────────────────────────────────────

const activeRecordings = new Map<string, QARecording>()
const completedRecordings = new Map<string, QARecording>()

// ── Recorder ────────────────────────────────────────────────────────────

export class VisualQARecorder {
  private captureIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private maxDurationTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * Start recording a browser automation session.
   */
  startRecording(
    sessionId: string,
    agentId: string,
    agentName: string,
    options: RecorderOptions & { ticketId?: string } = {}
  ): QARecording {
    const {
      captureIntervalMs = DEFAULT_CAPTURE_INTERVAL,
      maxDurationMs = DEFAULT_MAX_DURATION,
      width = 1280,
      height = 720,
      ticketId,
    } = options

    const id = crypto.randomUUID()
    const now = new Date()

    const recording: QARecording = {
      id,
      sessionId,
      agentId,
      agentName,
      ticketId,
      startedAt: now,
      durationMs: 0,
      status: 'recording',
      frames: [],
      annotations: [],
      verdict: 'pending',
      expiresAt: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
    }

    activeRecordings.set(id, recording)

    // Periodic screenshot capture
    const interval = setInterval(() => {
      this.captureFrame(id, width, height)
    }, captureIntervalMs)
    this.captureIntervals.set(id, interval)

    // Auto-stop after max duration
    const timer = setTimeout(() => {
      this.stopRecording(id)
    }, maxDurationMs)
    this.maxDurationTimers.set(id, timer)

    return recording
  }

  /**
   * Add an annotation to the timeline.
   */
  annotate(
    recordingId: string,
    label: string,
    type: RecordingAnnotation['type'],
    options: { verdict?: QAVerdict; details?: string } = {}
  ): void {
    const recording = activeRecordings.get(recordingId)
    if (!recording) throw new Error(`No active recording: ${recordingId}`)

    const offsetMs = Date.now() - recording.startedAt.getTime()
    recording.annotations.push({
      timestampMs: offsetMs,
      label,
      type,
      verdict: options.verdict,
      screenshotIndex: recording.frames.length - 1,
      details: options.details,
    })
  }

  /**
   * Add a pass/fail assertion marker.
   */
  addAssertion(recordingId: string, label: string, passed: boolean, details?: string): void {
    this.annotate(recordingId, label, 'assertion', {
      verdict: passed ? 'pass' : 'fail',
      details,
    })
  }

  /**
   * Stop recording and assemble the video.
   */
  async stopRecording(recordingId: string): Promise<QARecording> {
    const recording = activeRecordings.get(recordingId)
    if (!recording) throw new Error(`No active recording: ${recordingId}`)

    // Clear timers
    const interval = this.captureIntervals.get(recordingId)
    if (interval) clearInterval(interval)
    this.captureIntervals.delete(recordingId)

    const timer = this.maxDurationTimers.get(recordingId)
    if (timer) clearTimeout(timer)
    this.maxDurationTimers.delete(recordingId)

    recording.endedAt = new Date()
    recording.durationMs = recording.endedAt.getTime() - recording.startedAt.getTime()
    recording.status = 'processing'

    // Assemble video from frames
    recording.videoUrl = await this.assembleVideo(recording)
    recording.status = 'ready'

    // Compute verdict summary
    recording.verdictSummary = this.computeVerdictSummary(recording)
    recording.verdict = this.computeOverallVerdict(recording.verdictSummary)

    // Move to completed
    activeRecordings.delete(recordingId)
    completedRecordings.set(recordingId, recording)

    return recording
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Get a recording by ID */
  getRecording(id: string): QARecording | null {
    return activeRecordings.get(id) ?? completedRecordings.get(id) ?? null
  }

  /** List all completed recordings */
  listRecordings(): QARecording[] {
    return Array.from(completedRecordings.values())
      .filter((r) => r.expiresAt > new Date())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  }

  /** List recordings for a specific ticket */
  listByTicket(ticketId: string): QARecording[] {
    return this.listRecordings().filter((r) => r.ticketId === ticketId)
  }

  /** Clean up expired recordings */
  cleanExpired(): number {
    const now = new Date()
    let cleaned = 0
    for (const [id, recording] of completedRecordings) {
      if (recording.expiresAt <= now) {
        completedRecordings.delete(id)
        cleaned++
      }
    }
    return cleaned
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private captureFrame(recordingId: string, width: number, height: number): void {
    const recording = activeRecordings.get(recordingId)
    if (!recording || recording.status !== 'recording') return

    const index = recording.frames.length
    const offsetMs = Date.now() - recording.startedAt.getTime()

    // Stub — real impl captures from Playwright page.screenshot()
    const imageUrl = `/qa-recordings/${recordingId}/frame-${index}.png`

    recording.frames.push({
      index,
      imageUrl,
      capturedAt: new Date(),
      offsetMs,
      width,
      height,
    })
  }

  private async assembleVideo(recording: QARecording): Promise<string> {
    // Stub — real impl uses ffmpeg to assemble frames into video:
    // ffmpeg -framerate 2 -i frame-%d.png -c:v libx264 -pix_fmt yuv420p output.mp4
    // Then uploads to S3/local storage
    return `/qa-recordings/${recording.id}/recording.mp4`
  }

  private computeVerdictSummary(recording: QARecording): QARecording['verdictSummary'] {
    const assertions = recording.annotations.filter((a) => a.type === 'assertion')
    return {
      totalAssertions: assertions.length,
      passed: assertions.filter((a) => a.verdict === 'pass').length,
      failed: assertions.filter((a) => a.verdict === 'fail').length,
      skipped: assertions.filter((a) => a.verdict === 'skipped').length,
    }
  }

  private computeOverallVerdict(
    summary: QARecording['verdictSummary']
  ): QAVerdict {
    if (!summary || summary.totalAssertions === 0) return 'pending'
    if (summary.failed > 0) return 'fail'
    if (summary.passed === summary.totalAssertions) return 'pass'
    return 'pending'
  }
}
