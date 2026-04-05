/**
 * POST /api/documents/upload — Upload documents for agent knowledge.
 *
 * Accepts TWO formats:
 *   1. JSON:     { name: string, content: string }         (backwards compatible)
 *   2. FormData: file (PDF, TXT, MD, CSV) + optional name  (new file upload)
 *
 * Pipeline: parse file → extract text → chunk at sentence boundaries → embed → store in memory
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database, documents, waitForSchema } from '@solarc/db'

import { logger } from '../../../../lib/logger'
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

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.html',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.log',
  '.env',
])

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

    const window = remaining.slice(0, maxLen)
    const boundaryMatch = window.match(/.*[.!?]\s/s)
    const splitAt = boundaryMatch ? boundaryMatch[0].length : maxLen

    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }

  return chunks.filter((c) => c.length > 0)
}

/** Extract text from a PDF buffer using basic text extraction. */
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Simple PDF text extraction — decode text between BT/ET operators
  // This handles most text-based PDFs. For complex layouts, a library like pdf-parse would be better.
  const bytes = new Uint8Array(buffer)
  const raw = new TextDecoder('latin1').decode(bytes)

  // Extract text from PDF stream objects
  const textParts: string[] = []

  // Method 1: Extract text between parentheses in Tj/TJ operators
  const tjMatches = raw.matchAll(/\(([^)]*)\)\s*Tj/g)
  for (const match of tjMatches) {
    const decoded = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
    if (decoded.trim()) textParts.push(decoded)
  }

  // Method 2: Extract from TJ arrays
  const tjArrayMatches = raw.matchAll(/\[([^\]]*)\]\s*TJ/g)
  for (const match of tjArrayMatches) {
    const items = match[1].matchAll(/\(([^)]*)\)/g)
    for (const item of items) {
      const decoded = item[1].replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')')
      if (decoded.trim()) textParts.push(decoded)
    }
  }

  if (textParts.length === 0) {
    // Fallback: extract any readable ASCII sequences
    const asciiParts: string[] = []
    let current = ''
    for (const byte of bytes) {
      if (byte >= 32 && byte < 127) {
        current += String.fromCharCode(byte)
      } else if (current.length > 20) {
        // Only keep sequences longer than 20 chars (likely real text)
        asciiParts.push(current)
        current = ''
      } else {
        current = ''
      }
    }
    if (current.length > 20) asciiParts.push(current)
    return asciiParts.join(' ').replace(/\s+/g, ' ').trim()
  }

  return textParts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Extract text from an uploaded file based on its type. */
async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()

  // PDF
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer()
    return extractPdfText(buffer)
  }

  // Plain text / markdown / CSV / code files
  if (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))
  ) {
    return file.text()
  }

  // Fallback: try to read as text
  try {
    return await file.text()
  } catch {
    throw new Error(`Unsupported file type: ${file.type || name}`)
  }
}

export async function POST(req: Request) {
  try {
    await waitForSchema()
    const contentType = req.headers.get('content-type') ?? ''

    let name: string
    let content: string
    let fileType: string | undefined

    if (contentType.includes('multipart/form-data')) {
      // ── FormData file upload ──────────────────────────────────────
      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file || !(file instanceof File)) {
        return Response.json({ error: 'No file provided' }, { status: 400 })
      }

      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
          { status: 413 },
        )
      }

      // Use provided name or derive from filename
      const providedName = formData.get('name') as string | null
      name = providedName?.trim() || file.name.replace(/\.[^.]+$/, '')
      fileType = file.type || undefined

      content = await extractText(file)

      if (!content.trim()) {
        return Response.json({ error: 'Could not extract text from file' }, { status: 422 })
      }
    } else {
      // ── JSON upload (backwards compatible) ────────────────────────
      const body = await req.json()
      const { name: jsonName, content: jsonContent } = body as {
        name?: string
        content?: string
      }

      if (!jsonName || typeof jsonName !== 'string' || jsonName.trim().length === 0) {
        return Response.json({ error: 'Missing or empty "name" field' }, { status: 400 })
      }
      if (!jsonContent || typeof jsonContent !== 'string' || jsonContent.trim().length === 0) {
        return Response.json({ error: 'Missing or empty "content" field' }, { status: 400 })
      }

      name = jsonName.trim()
      content = jsonContent
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

    logger.info(
      { documentName: name, chunks: chunks.length, fileType, contentLength: content.length },
      'document ingested',
    )

    return Response.json({
      success: true,
      documentName: name.trim(),
      chunksStored: chunks.length,
      contentLength: content.length,
      fileType,
    })
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : undefined }, 'document upload failed')
    return Response.json({ error: 'Failed to process document upload' }, { status: 500 })
  }
}
