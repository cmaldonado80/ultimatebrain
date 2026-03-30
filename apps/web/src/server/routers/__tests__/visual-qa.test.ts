import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  default: {},
}))

vi.mock('../../services/visual-qa/recorder', () => ({
  VisualQARecorder: vi.fn().mockImplementation(() => ({
    listRecordings: vi.fn().mockResolvedValue([]),
    getRecording: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  })),
}))

vi.mock('../../services/visual-qa/reviewer', () => ({
  VisualQAReviewer: vi.fn().mockImplementation(() => ({
    quickReview: vi.fn().mockResolvedValue({ passed: true }),
    review: vi.fn().mockResolvedValue({ passed: true }),
  })),
}))

const { visualQaRouter } = await import('../visual-qa')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('visual-qa router', () => {
  it('should be defined', () => {
    expect(visualQaRouter).toBeDefined()
  })

  it('should have recordings procedure', () => {
    expect(visualQaRouter.recordings).toBeDefined()
  })

  it('should have review procedure', () => {
    expect(visualQaRouter.review).toBeDefined()
  })

  it('should have startRecording procedure', () => {
    expect(visualQaRouter.startRecording).toBeDefined()
  })

  it('should have stopRecording procedure', () => {
    expect(visualQaRouter.stopRecording).toBeDefined()
  })
})
