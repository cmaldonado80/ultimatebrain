/**
 * Artifact Viewer — serves artifact content as live HTML.
 *
 * GET /api/artifacts/[id]/view — renders artifact content in browser
 * Supports HTML artifacts with Tailwind CSS included.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createDb, type Database } from '@solarc/db'
import { artifacts } from '@solarc/db'
import { eq } from 'drizzle-orm'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL not set')
    _db = createDb(url)
  }
  return _db
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()

    const artifact = await db.query.artifacts.findFirst({
      where: eq(artifacts.id, id),
    })

    if (!artifact || !artifact.content) {
      return new Response('<h1>Artifact not found</h1>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const type = artifact.type?.split('|')[0] ?? 'text'

    // If content is already a full HTML document, serve as-is
    if (
      artifact.content.trim().startsWith('<!DOCTYPE') ||
      artifact.content.trim().startsWith('<html')
    ) {
      return new Response(artifact.content, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // If it's a base64 image (from render_preview), serve as image
    if (artifact.content.startsWith('data:image/')) {
      const [header, base64] = artifact.content.split(',')
      const mimeType = header?.match(/data:([^;]+)/)?.[1] ?? 'image/png'
      const buffer = Buffer.from(base64 ?? '', 'base64')
      return new Response(buffer, {
        headers: { 'Content-Type': mimeType },
      })
    }

    // For HTML fragments or code, wrap in a full page with Tailwind
    if (type === 'html' || type === 'preview' || artifact.content.includes('<')) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${artifact.name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #0a0f1a; color: #f1f5f9; font-family: Inter, system-ui, sans-serif; }
  </style>
</head>
<body>
${artifact.content}
</body>
</html>`
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Plain text / code / markdown
    return new Response(artifact.content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return new Response('<h1>Error loading artifact</h1>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}
