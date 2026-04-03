/**
 * Work Verification System
 *
 * Stolen from GSD's must_haves goal-backward verification pattern.
 * Instead of "did the agent follow instructions?", we check:
 *   - TRUTHS: observable behaviors that must be true
 *   - ARTIFACTS: files/data that must exist with real content
 *   - KEY_LINKS: critical wiring between components
 *
 * Every agent task can define must_haves. After execution, the verifier
 * checks each one and reports pass/fail with evidence.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface Truth {
  description: string
  check: () => Promise<boolean>
}

export interface Artifact {
  path: string
  provides: string
  minLines?: number
  mustContain?: string[]
  mustNotContain?: string[]
}

export interface KeyLink {
  from: string
  to: string
  via: string
}

export interface MustHaves {
  truths: Truth[]
  artifacts: Artifact[]
  keyLinks: KeyLink[]
}

export interface VerificationResult {
  timestamp: Date
  passed: boolean
  score: number // 0-1
  truthResults: Array<{ description: string; passed: boolean; error?: string }>
  artifactResults: Array<{
    path: string
    passed: boolean
    reason?: string
    lineCount?: number
  }>
  keyLinkResults: Array<{
    from: string
    to: string
    via: string
    passed: boolean
    reason?: string
  }>
  summary: string
}

// ── Preset Must-Have Builders ────────────────────────────────────────────

/**
 * Build must_haves for a TypeScript file creation task.
 */
export function fileCreationMustHaves(
  filePath: string,
  exports: string[],
  minLines = 10,
): MustHaves {
  return {
    truths: [
      {
        description: `File ${filePath} exists and is not empty`,
        check: async () => {
          const fs = await import('fs/promises')
          try {
            const stat = await fs.stat(filePath)
            return stat.size > 0
          } catch {
            return false
          }
        },
      },
    ],
    artifacts: [
      {
        path: filePath,
        provides: `Source file with exports: ${exports.join(', ')}`,
        minLines,
        mustContain: exports.map(() => `export`),
        mustNotContain: ['TODO:', 'FIXME:', 'throw new Error("not implemented")'],
      },
    ],
    keyLinks: [],
  }
}

/**
 * Build must_haves for an API endpoint task.
 */
export function apiEndpointMustHaves(
  routerFile: string,
  procedureName: string,
  appRouterFile: string,
): MustHaves {
  return {
    truths: [],
    artifacts: [
      {
        path: routerFile,
        provides: `tRPC router with ${procedureName} procedure`,
        mustContain: [procedureName],
        mustNotContain: ['TODO:', 'throw new Error("not implemented")'],
      },
    ],
    keyLinks: [
      {
        from: routerFile,
        to: appRouterFile,
        via: `Router imported and mounted in app router`,
      },
    ],
  }
}

/**
 * Build must_haves for a test task.
 */
export function testMustHaves(testFile: string, minTests: number): MustHaves {
  return {
    truths: [
      {
        description: `Test file has at least ${minTests} test cases`,
        check: async () => {
          const fs = await import('fs/promises')
          try {
            const content = await fs.readFile(testFile, 'utf-8')
            const testCount = (content.match(/\bit\(/g) ?? []).length
            return testCount >= minTests
          } catch {
            return false
          }
        },
      },
    ],
    artifacts: [
      {
        path: testFile,
        provides: `Test suite with ${minTests}+ tests`,
        mustContain: ['describe(', 'it(', 'expect('],
        mustNotContain: ['it.skip(', 'describe.skip('],
      },
    ],
    keyLinks: [],
  }
}

// ── Verifier ─────────────────────────────────────────────────────────────

export class WorkVerifier {
  /**
   * Verify a set of must_haves against the actual state.
   */
  async verify(mustHaves: MustHaves): Promise<VerificationResult> {
    const truthResults: VerificationResult['truthResults'] = []
    const artifactResults: VerificationResult['artifactResults'] = []
    const keyLinkResults: VerificationResult['keyLinkResults'] = []

    // Check truths
    for (const truth of mustHaves.truths) {
      try {
        const passed = await truth.check()
        truthResults.push({ description: truth.description, passed })
      } catch (err) {
        truthResults.push({
          description: truth.description,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Check artifacts
    const fs = await import('fs/promises')
    for (const artifact of mustHaves.artifacts) {
      try {
        const content = await fs.readFile(artifact.path, 'utf-8')
        const lines = content.split('\n').length

        // Check minimum lines
        if (artifact.minLines && lines < artifact.minLines) {
          artifactResults.push({
            path: artifact.path,
            passed: false,
            reason: `Only ${lines} lines (need ${artifact.minLines}+)`,
            lineCount: lines,
          })
          continue
        }

        // Check must contain
        if (artifact.mustContain) {
          const missing = artifact.mustContain.filter((s) => !content.includes(s))
          if (missing.length > 0) {
            artifactResults.push({
              path: artifact.path,
              passed: false,
              reason: `Missing required content: ${missing.join(', ')}`,
              lineCount: lines,
            })
            continue
          }
        }

        // Check must not contain (stubs, TODOs, etc.)
        if (artifact.mustNotContain) {
          const found = artifact.mustNotContain.filter((s) => content.includes(s))
          if (found.length > 0) {
            artifactResults.push({
              path: artifact.path,
              passed: false,
              reason: `Contains prohibited content: ${found.join(', ')}`,
              lineCount: lines,
            })
            continue
          }
        }

        artifactResults.push({ path: artifact.path, passed: true, lineCount: lines })
      } catch {
        artifactResults.push({
          path: artifact.path,
          passed: false,
          reason: 'File does not exist',
        })
      }
    }

    // Check key links
    for (const link of mustHaves.keyLinks) {
      try {
        const fromContent = await fs.readFile(link.from, 'utf-8')
        const toContent = await fs.readFile(link.to, 'utf-8')

        // Extract meaningful tokens from 'via' description
        const viaTokens = link.via
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((t) => t.length > 3)

        // Check if the "from" file references the "to" file or vice versa
        const fromBasename =
          link.from
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ?? ''
        const toBasename =
          link.to
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ?? ''

        const hasReference =
          fromContent.includes(toBasename) ||
          toContent.includes(fromBasename) ||
          viaTokens.some(
            (t) => fromContent.toLowerCase().includes(t) && toContent.toLowerCase().includes(t),
          )

        keyLinkResults.push({
          from: link.from,
          to: link.to,
          via: link.via,
          passed: hasReference,
          reason: hasReference ? undefined : `No cross-reference found between files`,
        })
      } catch (err) {
        keyLinkResults.push({
          from: link.from,
          to: link.to,
          via: link.via,
          passed: false,
          reason: err instanceof Error ? err.message : 'File read failed',
        })
      }
    }

    // Calculate score
    const total = truthResults.length + artifactResults.length + keyLinkResults.length
    const passed =
      truthResults.filter((r) => r.passed).length +
      artifactResults.filter((r) => r.passed).length +
      keyLinkResults.filter((r) => r.passed).length
    const score = total > 0 ? passed / total : 1

    // Build summary
    const failures = [
      ...truthResults.filter((r) => !r.passed).map((r) => `Truth: ${r.description}`),
      ...artifactResults.filter((r) => !r.passed).map((r) => `Artifact: ${r.path} — ${r.reason}`),
      ...keyLinkResults
        .filter((r) => !r.passed)
        .map((r) => `Link: ${r.from} → ${r.to} — ${r.reason}`),
    ]

    const summary =
      failures.length === 0
        ? `All ${total} checks passed.`
        : `${passed}/${total} checks passed. Failures:\n${failures.map((f) => `  - ${f}`).join('\n')}`

    return {
      timestamp: new Date(),
      passed: failures.length === 0,
      score,
      truthResults,
      artifactResults,
      keyLinkResults,
      summary,
    }
  }
}
