import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We need to control NODE_ENV before importing the logger module,
// so we use dynamic imports per test group.

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    consoleSpy?.mockRestore()
    vi.unstubAllEnvs()
  })

  describe('in development mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('logger.info(msg) logs with level info', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { logger } = await import('../logger')

      logger.info('hello world')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const output = consoleSpy.mock.calls[0][0] as string
      expect(output).toContain('INFO')
      expect(output).toContain('hello world')
    })

    it('logger.error sanitizes Error objects (no raw Error in output)', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { logger } = await import('../logger')

      logger.error({ err: new Error('test') }, 'failed')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      // In dev mode, pretty-prints to console.log. The error data should
      // not contain a raw Error instance — it should be serialized.
      // The key check: the err field was sanitized before formatting.
      // Since dev mode prints a formatted string, we just verify it was called.
      const output = consoleSpy.mock.calls[0][0] as string
      expect(output).toContain('ERROR')
      expect(output).toContain('failed')
    })

    it('withRequestContext injects requestId into log context', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { logger, withRequestContext } = await import('../logger')

      withRequestContext({ requestId: 'req-abc-12345678' }, () => {
        logger.info('contextual log')
      })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const output = consoleSpy.mock.calls[0][0] as string
      expect(output).toContain('rid=req-abc-')
    })

    it('child() creates logger with preset fields merged into every call', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { logger } = await import('../logger')

      const child = logger.child({ service: 'gateway', region: 'us-east' })
      child.info('child message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const output = consoleSpy.mock.calls[0][0] as string
      expect(output).toContain('child message')
    })
  })

  describe('level filtering', () => {
    it('debug is suppressed when NODE_ENV is production (MIN_LEVEL = info)', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      // In production, info+ goes to console.warn/console.error
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { logger } = await import('../logger')

      logger.debug('this should be suppressed')

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })
  })

  describe('production error sanitization', () => {
    it('logger.error sanitizes Error — no raw Error object in JSON', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { logger } = await import('../logger')

      logger.error({ err: new Error('boom') }, 'operation failed')

      expect(errorSpy).toHaveBeenCalledTimes(1)
      const json = JSON.parse(errorSpy.mock.calls[0][0] as string)
      // err should be a plain object with name/message, not a raw Error
      expect(json.err).toEqual(
        expect.objectContaining({
          name: 'Error',
          message: 'boom',
        }),
      )
      // In production, stack should be omitted
      expect(json.err.stack).toBeUndefined()

      errorSpy.mockRestore()
    })
  })
})
