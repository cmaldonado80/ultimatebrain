import { describe, it, expect } from 'vitest'

// PII detection utilities — these will be exported from the guardrails engine
// once implemented. For now we define the expected behaviour inline.

/** Detect emails in text */
function detectEmails(text: string): string[] {
  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  return text.match(pattern) ?? []
}

/** Detect US phone numbers (various formats) */
function detectPhoneNumbers(text: string): string[] {
  const pattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g
  return text.match(pattern) ?? []
}

/** Detect US Social Security Numbers */
function detectSSNs(text: string): string[] {
  const pattern = /\b\d{3}-\d{2}-\d{4}\b/g
  return text.match(pattern) ?? []
}

/** Returns true when no PII patterns are found */
function isClean(text: string): boolean {
  return (
    detectEmails(text).length === 0 &&
    detectPhoneNumbers(text).length === 0 &&
    detectSSNs(text).length === 0
  )
}

/** Redact all detected PII with placeholder tokens */
function redactPII(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PII Detector', () => {
  describe('detectEmails', () => {
    it('detects a simple email address', () => {
      const result = detectEmails('Contact me at alice@example.com for details.')
      expect(result).toEqual(['alice@example.com'])
    })

    it('detects multiple email addresses', () => {
      const result = detectEmails('Send to alice@example.com and bob@corp.io please.')
      expect(result).toEqual(['alice@example.com', 'bob@corp.io'])
    })

    it('detects emails with subdomains and plus addressing', () => {
      const result = detectEmails('user+tag@mail.sub.example.co.uk')
      expect(result).toEqual(['user+tag@mail.sub.example.co.uk'])
    })

    it('returns empty array when no email is present', () => {
      expect(detectEmails('No email here.')).toEqual([])
    })
  })

  describe('detectPhoneNumbers', () => {
    it('detects a 10-digit US phone number with dashes', () => {
      const result = detectPhoneNumbers('Call 555-867-5309 now.')
      expect(result).toEqual(['555-867-5309'])
    })

    it('detects phone number with parentheses', () => {
      const result = detectPhoneNumbers('Call (555) 867-5309.')
      expect(result).toEqual(['(555) 867-5309'])
    })

    it('detects phone number with +1 prefix', () => {
      const result = detectPhoneNumbers('Reach me at +1-555-867-5309.')
      expect(result).toEqual(['+1-555-867-5309'])
    })

    it('returns empty array when no phone number is present', () => {
      expect(detectPhoneNumbers('No phone here.')).toEqual([])
    })
  })

  describe('detectSSNs', () => {
    it('detects a standard SSN format', () => {
      const result = detectSSNs('SSN: 123-45-6789')
      expect(result).toEqual(['123-45-6789'])
    })

    it('detects multiple SSNs', () => {
      const result = detectSSNs('Records: 123-45-6789 and 987-65-4321')
      expect(result).toEqual(['123-45-6789', '987-65-4321'])
    })

    it('returns empty array when no SSN is present', () => {
      expect(detectSSNs('No sensitive data.')).toEqual([])
    })
  })

  describe('isClean', () => {
    it('returns true for plain text without PII', () => {
      expect(isClean('This is a perfectly safe sentence.')).toBe(true)
    })

    it('returns false when an email is present', () => {
      expect(isClean('Reach out to admin@corp.com')).toBe(false)
    })

    it('returns false when a phone number is present', () => {
      expect(isClean('Call 555-123-4567')).toBe(false)
    })

    it('returns false when an SSN is present', () => {
      expect(isClean('SSN 123-45-6789')).toBe(false)
    })
  })

  describe('redactPII', () => {
    it('redacts emails', () => {
      expect(redactPII('Email alice@example.com')).toBe('Email [EMAIL_REDACTED]')
    })

    it('redacts SSNs', () => {
      expect(redactPII('SSN: 123-45-6789')).toBe('SSN: [SSN_REDACTED]')
    })

    it('redacts all PII types in one pass', () => {
      const input = 'Contact alice@example.com or 555-123-4567. SSN: 123-45-6789'
      const output = redactPII(input)
      expect(output).toContain('[EMAIL_REDACTED]')
      expect(output).toContain('[PHONE_REDACTED]')
      expect(output).toContain('[SSN_REDACTED]')
      expect(output).not.toContain('alice@example.com')
      expect(output).not.toContain('123-45-6789')
    })

    it('leaves clean text unchanged', () => {
      const text = 'Nothing sensitive here.'
      expect(redactPII(text)).toBe(text)
    })
  })
})
