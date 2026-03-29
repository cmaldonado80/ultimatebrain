/**
 * Contract Review Route — analyzes contracts using Brain LLM
 *
 * POST /legal/contract-review
 *
 * This proves the three-tier pattern with an LLM-driven domain:
 * - No local computation engine (unlike Astrology's Swiss Ephemeris)
 * - Intelligence comes from Brain's LLM gateway via SDK
 * - Memory stores precedent analyses for future reference
 */

import type { BrainClient } from '@solarc/brain-sdk'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HonoContext = any

interface ContractReviewInput {
  title?: string
  contractText: string
  contractType?: 'nda' | 'employment' | 'service' | 'license' | 'general'
  focusAreas?: string[]
}

export const contractReviewRoute = {
  method: 'post' as const,
  path: '/legal/contract-review',
  handler: async (c: HonoContext, brain: BrainClient): Promise<Response> => {
    try {
      const input: ContractReviewInput = await c.req.json()

      // Validate
      if (!input.contractText || input.contractText.length < 50) {
        return c.json({ error: 'contractText is required (minimum 50 characters)' }, 400)
      }

      const contractType = input.contractType ?? 'general'
      const focusNote = input.focusAreas?.length
        ? `\n\nPay special attention to: ${input.focusAreas.join(', ')}`
        : ''

      // Call Brain LLM for analysis
      const analysis = await brain.llm.chat({
        model: 'qwen3.5:cloud',
        messages: [
          {
            role: 'system',
            content: `You are an expert legal contract analyst. Analyze the provided contract and return a JSON object with exactly this structure:
{
  "summary": "Brief 2-3 sentence overview of the contract",
  "keyClauses": [
    { "name": "Clause Name", "excerpt": "Relevant quote from contract", "assessment": "Brief analysis" }
  ],
  "riskFlags": [
    { "severity": "high|medium|low", "area": "Risk area", "description": "What the risk is", "recommendation": "What to do" }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"]
}

Be precise. Quote specific contract language in excerpts. Identify real risks, not hypothetical ones. Return ONLY valid JSON, no markdown.`,
          },
          {
            role: 'user',
            content: `Analyze this ${contractType} contract:\n\n${input.contractText.slice(0, 15000)}${focusNote}`,
          },
        ],
        temperature: 0.3,
      })

      // Parse LLM response
      let parsed: {
        summary: string
        keyClauses: Array<{ name: string; excerpt: string; assessment: string }>
        riskFlags: Array<{
          severity: string
          area: string
          description: string
          recommendation: string
        }>
        recommendations: string[]
      }

      try {
        // Try to extract JSON from the response (handle markdown fences)
        let jsonStr = analysis.content.trim()
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }
        parsed = JSON.parse(jsonStr)
      } catch {
        // Fallback: return raw analysis as summary
        parsed = {
          summary: analysis.content.slice(0, 500),
          keyClauses: [],
          riskFlags: [],
          recommendations: [
            'Full structured analysis could not be parsed — review raw output above',
          ],
        }
      }

      // Store analysis in Brain memory for future reference
      try {
        await brain.memory.store({
          key: `contract-review:${input.title ?? 'untitled'}:${Date.now()}`,
          content: `Contract type: ${contractType}. Summary: ${parsed.summary}. Risks: ${parsed.riskFlags.length} identified.`,
          tier: 'recall',
        })
      } catch {
        // Memory storage is optional — don't fail the request
      }

      return c.json({
        title: input.title ?? 'Contract Review',
        summary: parsed.summary,
        contractType,
        keyClauses: parsed.keyClauses ?? [],
        riskFlags: (parsed.riskFlags ?? []).map((r) => ({
          severity: r.severity as 'high' | 'medium' | 'low',
          area: r.area,
          description: r.description,
          recommendation: r.recommendation,
        })),
        recommendations: parsed.recommendations ?? [],
        analyzedAt: new Date().toISOString(),
      })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Contract analysis failed' }, 500)
    }
  },
}
