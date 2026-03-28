import { beforeEach, describe, expect, it } from 'vitest'

import { VisualQARecorder } from '../recorder'

describe('VisualQARecorder', () => {
  let recorder: VisualQARecorder

  beforeEach(() => {
    recorder = new VisualQARecorder()
  })

  describe('startRecording()', () => {
    it('should create a new recording', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent')
      expect(rec.id).toBeTruthy()
      expect(rec.sessionId).toBe('session-1')
      expect(rec.agentId).toBe('agent-1')
      expect(rec.status).toBe('recording')
    })

    it('should accept options', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent', {
        ticketId: 'ticket-1',
        resolution: { width: 1920, height: 1080 },
      })
      expect(rec.ticketId).toBe('ticket-1')
    })
  })

  describe('annotate()', () => {
    it('should add an annotation to the recording', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent')
      recorder.annotate(rec.id, 'Clicked button', 'action')
      const updated = recorder.getRecording(rec.id)
      expect(updated?.annotations).toHaveLength(1)
      expect(updated?.annotations[0].label).toBe('Clicked button')
      expect(updated?.annotations[0].type).toBe('action')
    })
  })

  describe('addAssertion()', () => {
    it('should add a pass assertion', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent')
      recorder.addAssertion(rec.id, 'Logo visible', true)
      const updated = recorder.getRecording(rec.id)
      const assertion = updated?.annotations.find((a) => a.type === 'assertion')
      expect(assertion?.label).toBe('Logo visible')
    })

    it('should add a fail assertion', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent')
      recorder.addAssertion(rec.id, 'Button missing', false, 'Expected .submit-btn to exist')
      const updated = recorder.getRecording(rec.id)
      expect(updated?.annotations).toHaveLength(1)
    })
  })

  describe('stopRecording()', () => {
    it('should finalize the recording', () => {
      const rec = recorder.startRecording('session-1', 'agent-1', 'Test Agent')
      recorder.stopRecording(rec.id)
      const updated = recorder.getRecording(rec.id)
      expect(updated?.status).toBe('processing')
    })
  })

  describe('listRecordings()', () => {
    it('should return an array of recordings', () => {
      recorder.startRecording('list-s1', 'a1', 'Agent 1')
      const list = recorder.listRecordings()
      expect(Array.isArray(list)).toBe(true)
      expect(list.length).toBeGreaterThan(0)
    })
  })

  describe('cleanExpired()', () => {
    it('should not crash on fresh recordings', () => {
      recorder.startRecording('s1', 'a1', 'Agent 1')
      expect(() => recorder.cleanExpired()).not.toThrow()
    })
  })
})
