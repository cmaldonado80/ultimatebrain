/**
 * POST /api/documents/upload — Upload a text/markdown document for agent learning.
 * Accepts JSON: { name: string, content: string }
 * Extracts text, chunks it (~500 chars at sentence boundaries), stores chunks
 * in the memories table (tier: 'core', key: doc:{name}:chunk:{i}).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, documents, waitForSchema } from '@solarc/db'
import { NextResponse } from 'next/server'

import { auth } from '../../../../server/auth'
import { MemoryService } from '../../../../server/services/memory/memory-service'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

/**
 * Split text into chunks of roughly `maxLen` characters, breaking at sentence
 * boundaries (period, exclamation, question mark followed by whitespace).
 */
function chunkText(text: string, maxLen = 500): string[] {
  const chunks: string[] = []
  let remaining = text.trim()

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    // Find the last sentence boundary within maxLen
    const window = remaining.slice(0, maxLen)
    const boundaryMatch = window.match(/.*[.!?]\s/s)
    const splitAt = boundaryMatch ? boundaryMatch[0].length : maxLen

    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }

  return chunks.filter((c) => c.length > 0)
}

export async function POST(req: Request) {
  // Auth check
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await waitForSchema()
    const body = await req.json()
    const { name, content } = body as { name?: string; content?: string }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Missing or empty "name" field' }, { status: 400 })
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Missing or empty "content" field' }, { status: 400 })
    }

    const chunks = chunkText(content)
    const db = getDb()
    const memoryService = new MemoryService(db)

    // Store document record
    await db.insert(documents).values({
      name: name.trim(),
      content,
      chunkCount: chunks.length,
    })

    // Store each chunk as a core memory
    for (let i = 0; i < chunks.length; i++) {
      await memoryService.store({
        key: `doc:${name.trim()}:chunk:${i}`,
        content: chunks[i],
        tier: 'core',
      })
    }

    return Response.json({
      success: true,
      documentName: name.trim(),
      chunksStored: chunks.length,
    })
  } catch (err) {
    console.error('[DocumentUpload] Error:', err)
    return Response.json({ error: 'Failed to process document upload' }, { status: 500 })
  }
}
