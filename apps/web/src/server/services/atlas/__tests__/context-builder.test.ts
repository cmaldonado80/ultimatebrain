import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs and path before import
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(`
<!-- @section:stack -->
## Tech Stack
- Node 22
- TypeScript
<!-- @end -->

<!-- @section:conventions -->
## Conventions
- Drizzle ORM
<!-- @end -->

<!-- @section:structure -->
## Structure
- apps/web
<!-- @end -->

<!-- @section:coder -->
## For Coders
- Import from @solarc/db
<!-- @end -->

<!-- @section:planner -->
## For Planners
- Clean Architecture
<!-- @end -->

<!-- @section:reviewer -->
## For Reviewers
- No silent catches
<!-- @end -->

<!-- @section:ops -->
## Ops
- Health monitoring
<!-- @end -->

<!-- @section:dev -->
## Dev
- SKIP_AUTH=true
<!-- @end -->

<!-- @section:anti-hallucination -->
## Anti-Hallucination
- DO NOT reference nonexistent files
<!-- @end -->

<!-- @section:multimodal -->
## Multimodal
- Image inputs supported
<!-- @end -->
`),
}))

vi.mock('path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

// Must import AFTER mocks
const { buildAtlasContext, invalidateAtlasCache } = await import('../context-builder')

describe('AtlasContextBuilder', () => {
  beforeEach(() => {
    invalidateAtlasCache()
  })

  it('should return base sections for any agent', () => {
    const ctx = buildAtlasContext({})
    expect(ctx).toContain('Tech Stack')
    expect(ctx).toContain('Conventions')
    expect(ctx).toContain('Structure')
    expect(ctx).toContain('Anti-Hallucination')
  })

  it('should include coder section for coder capability', () => {
    const ctx = buildAtlasContext({ capability: 'coder' })
    expect(ctx).toContain('For Coders')
    expect(ctx).toContain('Import from @solarc/db')
  })

  it('should include planner section for reasoning capability', () => {
    const ctx = buildAtlasContext({ capability: 'reasoning' })
    expect(ctx).toContain('For Planners')
    expect(ctx).toContain('Clean Architecture')
  })

  it('should include reviewer section for guard capability', () => {
    const ctx = buildAtlasContext({ capability: 'guard' })
    expect(ctx).toContain('For Reviewers')
    expect(ctx).toContain('No silent catches')
  })

  it('should include ops section for system workspace', () => {
    const ctx = buildAtlasContext({ workspaceType: 'system' })
    expect(ctx).toContain('Ops')
    expect(ctx).toContain('Health monitoring')
  })

  it('should include dev section for development workspace', () => {
    const ctx = buildAtlasContext({ workspaceType: 'development' })
    expect(ctx).toContain('Dev')
    expect(ctx).toContain('SKIP_AUTH=true')
  })

  it('should include multimodal section for vision capability', () => {
    const ctx = buildAtlasContext({ capability: 'vision' })
    expect(ctx).toContain('Multimodal')
    expect(ctx).toContain('Image inputs supported')
  })

  it('should include coder section for executor agent type', () => {
    const ctx = buildAtlasContext({ agentType: 'executor' })
    expect(ctx).toContain('For Coders')
  })

  it('should include planner + coder for agentic capability', () => {
    const ctx = buildAtlasContext({ capability: 'agentic' })
    expect(ctx).toContain('For Planners')
    expect(ctx).toContain('For Coders')
  })

  it('should return empty string if ATLAS.md unreadable', async () => {
    const fs = await import('fs')
    ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    invalidateAtlasCache()
    const ctx = buildAtlasContext({})
    expect(ctx).toBe('')
  })

  it('should wrap context in ATLAS markers', () => {
    const ctx = buildAtlasContext({})
    expect(ctx).toContain('[ATLAS Context')
  })
})
