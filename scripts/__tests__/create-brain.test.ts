import { describe, expect, it } from 'vitest'

import {
  buildTokens,
  EXPECTED_APP_FILES,
  EXPECTED_BRAIN_FILES,
  FORBIDDEN_DEV_DEPS,
  replaceTokens,
  sanitizeDomain,
  simpleHash,
} from '../lib/generator'

describe('Template Generator', () => {
  describe('sanitizeDomain', () => {
    it('lowercases input', () => {
      expect(sanitizeDomain('Astrology')).toBe('astrology')
    })

    it('strips non-alphanumeric characters', () => {
      expect(sanitizeDomain('my-brain_v2!')).toBe('mybrainv2')
    })

    it('handles empty string', () => {
      expect(sanitizeDomain('')).toBe('')
    })
  })

  describe('simpleHash', () => {
    it('is deterministic', () => {
      expect(simpleHash('astrology')).toBe(simpleHash('astrology'))
    })

    it('produces different hashes for different inputs', () => {
      expect(simpleHash('astrology')).not.toBe(simpleHash('hospitality'))
    })

    it('returns non-negative numbers', () => {
      expect(simpleHash('test')).toBeGreaterThanOrEqual(0)
      expect(simpleHash('')).toBeGreaterThanOrEqual(0)
    })
  })

  describe('buildTokens', () => {
    const tokens = buildTokens('astrology')

    it('generates all 9 tokens', () => {
      expect(Object.keys(tokens)).toHaveLength(9)
    })

    it('domain is lowercase', () => {
      expect(tokens['{{DOMAIN}}']).toBe('astrology')
    })

    it('domain title is capitalized', () => {
      expect(tokens['{{DOMAIN_TITLE}}']).toBe('Astrology')
    })

    it('package name follows convention', () => {
      expect(tokens['{{PACKAGE_NAME}}']).toBe('@solarc/astrology-brain')
    })

    it('app package name follows convention', () => {
      expect(tokens['{{APP_PACKAGE_NAME}}']).toBe('@solarc/astrology-app')
    })

    it('port is in valid range', () => {
      const port = Number(tokens['{{PORT}}'])
      expect(port).toBeGreaterThanOrEqual(3100)
      expect(port).toBeLessThan(3200)
    })

    it('app port is brain port + 100', () => {
      const port = Number(tokens['{{PORT}}'])
      const appPort = Number(tokens['{{APP_PORT}}'])
      expect(appPort).toBe(port + 100)
    })

    it('route path starts with domain', () => {
      expect(tokens['{{ROUTE_PATH}}']).toBe('/astrology/example')
    })

    it('cookie name is max 8 chars + -session', () => {
      const cookie = tokens['{{COOKIE_NAME}}']
      expect(cookie).toMatch(/^.{1,8}-session$/)
    })

    it('brain env prefix is uppercase', () => {
      expect(tokens['{{BRAIN_ENV_PREFIX}}']).toBe('ASTROLOGY')
    })
  })

  describe('replaceTokens', () => {
    it('replaces all tokens in content', () => {
      const tokens = buildTokens('test')
      const content = 'domain={{DOMAIN}} title={{DOMAIN_TITLE}} port={{PORT}}'
      const result = replaceTokens(content, tokens)
      expect(result).not.toContain('{{')
      expect(result).toContain('domain=test')
      expect(result).toContain('title=Test')
    })

    it('handles content with no tokens', () => {
      const result = replaceTokens('no tokens here', {})
      expect(result).toBe('no tokens here')
    })

    it('replaces multiple occurrences of same token', () => {
      const tokens = { '{{X}}': 'Y' }
      expect(replaceTokens('{{X}} and {{X}}', tokens)).toBe('Y and Y')
    })
  })

  describe('Expected file lists', () => {
    it('brain expects 4 files', () => {
      expect(EXPECTED_BRAIN_FILES).toHaveLength(4)
    })

    it('app expects 14 files', () => {
      expect(EXPECTED_APP_FILES).toHaveLength(14)
    })
  })

  describe('Forbidden dependencies', () => {
    it('includes brain-sdk', () => {
      expect(FORBIDDEN_DEV_DEPS).toContain('@solarc/brain-sdk')
    })

    it('includes db', () => {
      expect(FORBIDDEN_DEV_DEPS).toContain('@solarc/db')
    })

    it('includes ephemeris', () => {
      expect(FORBIDDEN_DEV_DEPS).toContain('@solarc/ephemeris')
    })
  })
})
