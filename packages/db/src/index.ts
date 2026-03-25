import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index'

export * from './schema/index'

/**
 * Run-once schema sync: ensures all Drizzle schema columns/enums exist in the DB.
 * Uses drizzle-kit push via a raw SQL approach — adds missing columns with IF NOT EXISTS.
 * This runs once per cold start and is a no-op if schema is already up to date.
 */
let _schemaSynced = false
async function ensureSchema(pool: pg.Pool): Promise<void> {
  if (_schemaSynced) return
  _schemaSynced = true // Mark early to prevent concurrent runs

  const client = await pool.connect()
  try {
    // Add missing enum types (IF NOT EXISTS)
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_type AS ENUM ('general', 'development', 'staging', 'system');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        CREATE TYPE model_type AS ENUM ('vision', 'reasoning', 'agentic', 'coder', 'embedding', 'flash', 'guard', 'judge', 'router', 'multimodal');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        CREATE TYPE workspace_lifecycle AS ENUM ('draft', 'active', 'paused', 'retired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        CREATE TYPE workspace_binding_type AS ENUM ('brain', 'engine', 'skill');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        CREATE TYPE workspace_goal_status AS ENUM ('active', 'achieved', 'abandoned');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `)

    // Add missing columns (IF NOT EXISTS via DO blocks)
    const alterStatements = [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS parent_orchestrator_id uuid`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS required_model_type model_type`,
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_system_protected boolean DEFAULT false`,
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lifecycle_state workspace_lifecycle DEFAULT 'draft' NOT NULL`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at timestamp`,
      `ALTER TABLE orchestrator_routes ADD COLUMN IF NOT EXISTS orchestrator_id uuid`,
    ]

    // Try to cast workspaces.type to enum if it's still text
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE workspaces ALTER COLUMN type TYPE workspace_type USING type::workspace_type;
      EXCEPTION WHEN others THEN NULL; END $$;
    `)

    for (const stmt of alterStatements) {
      await client.query(stmt).catch(() => {}) // Ignore if already exists
    }

    // eslint-disable-next-line no-console
    console.log('[DB] Schema sync complete')
  } catch (err) {
    console.warn('[DB] Schema sync warning:', err instanceof Error ? err.message : err)
  } finally {
    client.release()
  }
}

export function createDb(connectionString: string) {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  const pool = new pg.Pool({
    connectionString,
    // Serverless: keep pool tiny to avoid exhausting DB connections
    max: isServerless ? 3 : 20,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // Fire-and-forget schema sync on first connection
  ensureSchema(pool).catch(() => {})

  return drizzle(pool, { schema })
}

export type Database = ReturnType<typeof createDb>
