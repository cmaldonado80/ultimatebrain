'use client'

/**
 * QA Playback Player
 *
 * - Video player with timeline scrubber
 * - Action annotations as markers on timeline
 * - Side panel: pass/fail results, failure details
 * - "Approve" / "Reject" buttons for human review
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { QARecording, RecordingAnnotation, QAVerdict } from '../../server/services/visual-qa/recorder'
import type { ReviewResult, CheckpointResult, FailureFrame, SuggestedFix } from '../../server/services/visual-qa/reviewer'

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_RECORDING: QARecording = {
  id: 'rec-001',
  sessionId: 'sess-001',
  agentId: 'agent-qa',
  agentName: 'QA Agent',
  ticketId: 'T-142',
  startedAt: new Date(Date.now() - 45000),
  endedAt: new Date(),
  durationMs: 45000,
  status: 'ready',
  videoUrl: '/qa-recordings/rec-001/recording.mp4',
  frames: Array.from({ length: 90 }, (_, i) => ({
    index: i,
    imageUrl: `/qa-recordings/rec-001/frame-${i}.png`,
    capturedAt: new Date(Date.now() - 45000 + i * 500),
    offsetMs: i * 500,
    width: 1280,
    height: 720,
  })),
  annotations: [
    { timestampMs: 2000, label: 'Navigate to login page', type: 'navigation', screenshotIndex: 4 },
    { timestampMs: 5000, label: 'Enter username', type: 'action', screenshotIndex: 10 },
    { timestampMs: 8000, label: 'Enter password', type: 'action', screenshotIndex: 16 },
    { timestampMs: 10000, label: 'Click login button', type: 'action', screenshotIndex: 20 },
    { timestampMs: 12000, label: 'Dashboard loaded', type: 'assertion', verdict: 'pass', screenshotIndex: 24 },
    { timestampMs: 18000, label: 'Navigate to settings', type: 'navigation', screenshotIndex: 36 },
    { timestampMs: 22000, label: 'Profile form visible', type: 'assertion', verdict: 'pass', screenshotIndex: 44 },
    { timestampMs: 30000, label: 'Save settings', type: 'action', screenshotIndex: 60 },
    { timestampMs: 33000, label: 'Success toast shown', type: 'assertion', verdict: 'fail', screenshotIndex: 66, details: 'Toast not found within 3s' },
    { timestampMs: 40000, label: 'Redirect to dashboard', type: 'assertion', verdict: 'pass', screenshotIndex: 80 },
  ],
  verdict: 'fail',
  verdictSummary: { totalAssertions: 4, passed: 3, failed: 1, skipped: 0 },
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
}

const MOCK_REVIEW: ReviewResult = {
  recordingId: 'rec-001',
  reviewedAt: new Date(),
  verdict: 'fail',
  confidence: 0.88,
  summary: 'Agent "QA Agent" for ticket T-142: 1/4 checkpoints failed (3 passed, 45s recording).',
  checkpointResults: [
    { checkpoint: { name: 'Dashboard loaded', description: 'Dashboard page visible after login' }, verdict: 'pass', confidence: 0.95, explanation: 'Dashboard elements detected', frameIndex: 24 },
    { checkpoint: { name: 'Profile form', description: 'Settings profile form is visible' }, verdict: 'pass', confidence: 0.92, explanation: 'Form fields detected', frameIndex: 44 },
    { checkpoint: { name: 'Success toast', description: 'Success notification appears after save' }, verdict: 'fail', confidence: 0.87, explanation: 'Toast element not found in frame', frameIndex: 66 },
    { checkpoint: { name: 'Dashboard redirect', description: 'Redirected back to dashboard' }, verdict: 'pass', confidence: 0.91, explanation: 'Dashboard URL and content confirmed', frameIndex: 80 },
  ],
  failureFrames: [
    { frameIndex: 66, imageUrl: '/qa-recordings/rec-001/frame-66.png', offsetMs: 33000, reason: 'Success toast not visible after save action' },
  ],
  suggestedFixes: [
    { description: 'Add wait for toast notification after save', category: 'timing', priority: 'high', suggestion: 'await page.waitForSelector(".toast-success", { timeout: 5000 })' },
    { description: 'Verify toast component is rendering in settings page', category: 'ui', priority: 'medium' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}:${String(s).padStart(2, '0')}`
}

const VERDICT_STYLES: Record<QAVerdict, { bg: string; color: string; label: string }> = {
  pass: { bg: '#052e16', color: '#4ade80', label: 'PASS' },
  fail: { bg: '#450a0a', color: '#f87171', label: 'FAIL' },
  pending: { bg: '#1c1917', color: '#a8a29e', label: 'PENDING' },
  skipped: { bg: '#1c1917', color: '#78716c', label: 'SKIP' },
}

// ── Sub-components ────────────────────────────────────────────────────────

function VerdictBadge({ verdict, size = 'sm' }: { verdict: QAVerdict; size?: 'sm' | 'lg' }) {
  const v = VERDICT_STYLES[verdict]
  return (
    <span style={{
      background: v.bg,
      color: v.color,
      padding: size === 'lg' ? '4px 12px' : '2px 8px',
      borderRadius: 4,
      fontSize: size === 'lg' ? 13 : 10,
      fontWeight: 700,
    }}>
      {v.label}
    </span>
  )
}

function TimelineMarker({
  annotation,
  totalMs,
  onClick,
  isActive,
}: {
  annotation: RecordingAnnotation
  totalMs: number
  onClick: () => void
  isActive: boolean
}) {
  const pct = (annotation.timestampMs / totalMs) * 100
  const markerColor = annotation.verdict === 'fail' ? '#ef4444'
    : annotation.verdict === 'pass' ? '#22c55e'
    : annotation.type === 'navigation' ? '#3b82f6'
    : '#f97316'

  return (
    <div
      style={{
        ...styles.marker,
        left: `${pct}%`,
        background: markerColor,
        transform: isActive ? 'translate(-50%, -50%) scale(1.4)' : 'translate(-50%, -50%)',
        zIndex: isActive ? 10 : 1,
      }}
      onClick={onClick}
      title={`${formatMs(annotation.timestampMs)} — ${annotation.label}`}
    />
  )
}

function CheckpointRow({ result }: { result: CheckpointResult }) {
  return (
    <div style={styles.checkRow}>
      <VerdictBadge verdict={result.verdict} />
      <div style={styles.checkInfo}>
        <div style={styles.checkName}>{result.checkpoint.name}</div>
        <div style={styles.checkExpl}>{result.explanation}</div>
      </div>
      <span style={styles.checkConf}>{Math.round(result.confidence * 100)}%</span>
    </div>
  )
}

function FixRow({ fix }: { fix: SuggestedFix }) {
  const prioColor = fix.priority === 'high' ? '#ef4444' : fix.priority === 'medium' ? '#f97316' : '#6b7280'
  return (
    <div style={styles.fixRow}>
      <span style={{ ...styles.fixPrio, color: prioColor }}>{fix.priority}</span>
      <div style={styles.fixInfo}>
        <div style={styles.fixDesc}>{fix.description}</div>
        {fix.suggestion && <code style={styles.fixCode}>{fix.suggestion}</code>}
      </div>
      <span style={styles.fixCat}>{fix.category}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

interface QAPlayerProps {
  recording?: QARecording
  review?: ReviewResult
  onApprove?: () => void
  onReject?: () => void
}

export default function QAPlayer({
  recording = MOCK_RECORDING,
  review = MOCK_REVIEW,
  onApprove,
  onReject,
}: QAPlayerProps) {
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [activeAnnotation, setActiveAnnotation] = useState<RecordingAnnotation | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Current frame based on playhead position
  const currentFrameIdx = Math.min(
    Math.floor(currentMs / 500),
    recording.frames.length - 1
  )

  // Play/pause
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCurrentMs((prev) => {
          if (prev >= recording.durationMs) {
            setPlaying(false)
            return recording.durationMs
          }
          return prev + 100
        })
      }, 100)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, recording.durationMs])

  const seekTo = useCallback((ms: number) => {
    setCurrentMs(Math.max(0, Math.min(ms, recording.durationMs)))
  }, [recording.durationMs])

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seekTo(pct * recording.durationMs)
  }, [recording.durationMs, seekTo])

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={styles.headerTitle}>QA Recording: {recording.agentName}</h3>
          {recording.ticketId && <span style={styles.ticketBadge}>{recording.ticketId}</span>}
          <VerdictBadge verdict={recording.verdict} size="lg" />
        </div>
        <div style={styles.headerRight}>
          {onApprove && <button style={styles.approveBtn} onClick={onApprove}>Approve</button>}
          {onReject && <button style={styles.rejectBtn} onClick={onReject}>Reject</button>}
        </div>
      </div>

      <div style={styles.body}>
        {/* Video / Frame viewer */}
        <div style={styles.playerSection}>
          <div style={styles.viewport}>
            <div style={styles.framePlaceholder}>
              <div style={styles.frameLabel}>Frame {currentFrameIdx + 1} / {recording.frames.length}</div>
              <div style={styles.frameTime}>{formatMs(currentMs)}</div>
            </div>
          </div>

          {/* Controls */}
          <div style={styles.controls}>
            <button style={styles.playBtn} onClick={() => setPlaying(!playing)}>
              {playing ? '⏸' : '▶'}
            </button>
            <span style={styles.timeDisplay}>{formatMs(currentMs)} / {formatMs(recording.durationMs)}</span>
          </div>

          {/* Timeline with markers */}
          <div style={styles.timeline} onClick={handleTimelineClick}>
            <div style={{ ...styles.timelineProgress, width: `${(currentMs / recording.durationMs) * 100}%` }} />
            {recording.annotations.map((ann) => (
              <TimelineMarker
                key={ann.timestampMs}
                annotation={ann}
                totalMs={recording.durationMs}
                onClick={() => { seekTo(ann.timestampMs); setActiveAnnotation(ann) }}
                isActive={activeAnnotation === ann}
              />
            ))}
          </div>

          {/* Active annotation detail */}
          {activeAnnotation && (
            <div style={styles.annotationDetail}>
              <span style={styles.annTime}>{formatMs(activeAnnotation.timestampMs)}</span>
              <span style={styles.annType}>{activeAnnotation.type}</span>
              <span style={styles.annLabel}>{activeAnnotation.label}</span>
              {activeAnnotation.verdict && <VerdictBadge verdict={activeAnnotation.verdict} />}
              {activeAnnotation.details && <span style={styles.annDetails}>{activeAnnotation.details}</span>}
            </div>
          )}
        </div>

        {/* Side panel: results */}
        <div style={styles.sidePanel}>
          {/* Summary */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Summary</div>
            <div style={styles.summaryText}>{review.summary}</div>
            <div style={styles.summaryStats}>
              <span style={styles.statPass}>{recording.verdictSummary?.passed ?? 0} passed</span>
              <span style={styles.statFail}>{recording.verdictSummary?.failed ?? 0} failed</span>
              <span style={styles.statSkip}>{recording.verdictSummary?.skipped ?? 0} skipped</span>
            </div>
          </div>

          {/* Checkpoints */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Checkpoints</div>
            {review.checkpointResults.map((r) => (
              <CheckpointRow key={r.checkpoint.name} result={r} />
            ))}
          </div>

          {/* Failure frames */}
          {review.failureFrames.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>Failures</div>
              {review.failureFrames.map((f) => (
                <div
                  key={f.frameIndex}
                  style={styles.failureRow}
                  onClick={() => seekTo(f.offsetMs)}
                >
                  <span style={styles.failureTime}>{formatMs(f.offsetMs)}</span>
                  <span style={styles.failureReason}>{f.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Suggested fixes */}
          {review.suggestedFixes.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>Suggested Fixes</div>
              {review.suggestedFixes.map((fix) => (
                <FixRow key={`${fix.category}-${fix.priority}-${fix.description}`} fix={fix} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  container: { background: '#111827', border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden', color: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#0f172a', borderBottom: '1px solid #1f2937' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerRight: { display: 'flex', gap: 6 },
  headerTitle: { margin: 0, fontSize: 14, fontWeight: 700 },
  ticketBadge: { fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 6px', borderRadius: 4 },
  approveBtn: { background: '#166534', border: 'none', borderRadius: 6, color: '#4ade80', padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  rejectBtn: { background: '#7f1d1d', border: 'none', borderRadius: 6, color: '#f87171', padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  body: { display: 'flex', height: 520 },
  // Player
  playerSection: { flex: 1, display: 'flex', flexDirection: 'column' as const, borderRight: '1px solid #1f2937' },
  viewport: { flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  framePlaceholder: { textAlign: 'center' as const, color: '#6b7280' },
  frameLabel: { fontSize: 13 },
  frameTime: { fontSize: 20, fontWeight: 700, fontFamily: 'monospace', marginTop: 4 },
  controls: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#0f172a' },
  playBtn: { background: '#1f2937', border: '1px solid #374151', borderRadius: 4, color: '#f9fafb', width: 32, height: 28, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  timeDisplay: { fontSize: 11, fontFamily: 'monospace', color: '#9ca3af' },
  timeline: { position: 'relative' as const, height: 20, background: '#1f2937', cursor: 'pointer', margin: '0 12px 8px' , borderRadius: 4, overflow: 'visible' },
  timelineProgress: { height: '100%', background: '#2563eb', borderRadius: 4, transition: 'width 0.1s linear' },
  marker: { position: 'absolute' as const, top: '50%', width: 8, height: 8, borderRadius: '50%', cursor: 'pointer', transition: 'transform 0.15s' },
  annotationDetail: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 8px', fontSize: 11, flexWrap: 'wrap' as const },
  annTime: { fontFamily: 'monospace', color: '#6b7280' },
  annType: { background: '#1f2937', padding: '1px 5px', borderRadius: 3, fontSize: 10, color: '#9ca3af' },
  annLabel: { color: '#d1d5db' },
  annDetails: { color: '#f87171', fontSize: 10 },
  // Side panel
  sidePanel: { width: 300, overflowY: 'auto' as const, background: '#0f172a' },
  section: { padding: '10px 12px', borderBottom: '1px solid #1f2937' },
  sectionHeader: { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
  summaryText: { fontSize: 12, color: '#d1d5db', lineHeight: 1.5, marginBottom: 8 },
  summaryStats: { display: 'flex', gap: 10, fontSize: 11 },
  statPass: { color: '#4ade80' },
  statFail: { color: '#f87171' },
  statSkip: { color: '#78716c' },
  // Checkpoint
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 0', borderBottom: '1px solid #111827' },
  checkInfo: { flex: 1 },
  checkName: { fontSize: 12, fontWeight: 600, marginBottom: 2 },
  checkExpl: { fontSize: 10, color: '#9ca3af' },
  checkConf: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace' },
  // Failure
  failureRow: { display: 'flex', gap: 6, padding: '4px 0', cursor: 'pointer', fontSize: 11 },
  failureTime: { fontFamily: 'monospace', color: '#6b7280', flexShrink: 0 },
  failureReason: { color: '#f87171' },
  // Fix
  fixRow: { display: 'flex', gap: 6, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid #111827' },
  fixPrio: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, flexShrink: 0, width: 42 },
  fixInfo: { flex: 1 },
  fixDesc: { fontSize: 11, color: '#d1d5db', marginBottom: 2 },
  fixCode: { fontSize: 10, background: '#111827', padding: '2px 6px', borderRadius: 3, color: '#93c5fd', display: 'block', marginTop: 2 },
  fixCat: { fontSize: 10, background: '#1f2937', padding: '1px 5px', borderRadius: 3, color: '#9ca3af', flexShrink: 0 },
}
