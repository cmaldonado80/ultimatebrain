/**
 * Artifact Verifier — checks artifact integrity after edits.
 */
import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'

import { logger } from '../../../lib/logger'

interface VerificationResult {
  valid: boolean
  issues: string[]
}

export function verifyHtmlArtifact(content: string, previousContent?: string): VerificationResult {
  const issues: string[] = []

  // Check basic structure
  if (content.includes('<') && !content.includes('>')) {
    issues.push('Broken HTML tags detected')
  }

  // Check for dramatic content shrinkage (>50% smaller)
  if (previousContent && content.length < previousContent.length * 0.5) {
    issues.push(
      `Content shrank by ${Math.round((1 - content.length / previousContent.length) * 100)}% — possible data loss`,
    )
  }

  // Check for empty content
  if (content.trim().length === 0) {
    issues.push('Content is empty')
  }

  // Check for script injection
  if (content.includes('<script') && !content.includes('tailwindcss')) {
    issues.push('Script tag detected — review for security')
  }

  return { valid: issues.length === 0, issues }
}

export async function verifyAndEscalate(
  db: Database,
  artifactId: string,
  artifactName: string,
  content: string,
  previousContent?: string,
): Promise<VerificationResult> {
  const result = verifyHtmlArtifact(content, previousContent)

  if (!result.valid) {
    // Create follow-up ticket for broken artifact
    await db
      .insert(tickets)
      .values({
        title: `[Artifact QA] ${artifactName} may be broken`,
        description: [
          `## Verification Failed`,
          `Artifact: ${artifactName} (${artifactId})`,
          '',
          `## Issues Found`,
          ...result.issues.map((i) => `- ${i}`),
          '',
          `## Action Required`,
          `Review and fix the artifact. Previous content may need to be restored.`,
        ].join('\n'),
        status: 'queued',
        priority: 'high',
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err : undefined, artifactId },
          'artifact-verifier: failed to create follow-up ticket',
        )
      })

    logger.warn({ artifactId, issues: result.issues }, 'artifact-verifier: issues found')
  }

  return result
}
