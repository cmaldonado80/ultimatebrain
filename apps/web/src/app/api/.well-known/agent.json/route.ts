/**
 * /.well-known/agent.json
 *
 * Returns the brain's agent directory — a list of all active agents
 * with their A2A capability cards.
 *
 * External brains and tools can discover this brain's agents here.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { createDb } = await import('@solarc/db')
  const { AgentCardGenerator } = await import('../../../../server/services/a2a/agent-card')

  const db = createDb(process.env.DATABASE_URL!)
  const host = req.headers.get('host') ?? 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const baseUrl = `${protocol}://${host}`

  const generator = new AgentCardGenerator(db)

  try {
    const cards = await generator.generateAll({
      baseUrl,
      authType: 'bearer',
      tokenUrl: `${baseUrl}/api/auth/token`,
      version: process.env.BRAIN_VERSION ?? '1.0.0',
    })

    return NextResponse.json(
      {
        brain: process.env.BRAIN_NAME ?? 'UltimateBrain',
        version: process.env.BRAIN_VERSION ?? '1.0.0',
        base_url: baseUrl,
        agents: Object.values(cards),
        total: Object.keys(cards).length,
        updated_at: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate agent cards', detail: String(err) },
      { status: 500 }
    )
  }
}
