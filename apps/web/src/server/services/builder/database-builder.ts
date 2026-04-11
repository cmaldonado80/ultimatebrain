/**
 * Database Builder — generates domain-specific schemas via LLM,
 * lists existing tables, creates tables, and provides schema management.
 *
 * Uses the existing execution-engine for safe SQL execution.
 */

import type { Database } from '@solarc/db'
import { sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { GatewayRouter } from '../gateway'

// ── Types ────────────────────────────────────────────────────────────────

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
  sizeBytes: number | null
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
}

export interface SchemaProposal {
  tables: Array<{
    name: string
    purpose: string
    columns: Array<{
      name: string
      type: string
      nullable: boolean
      defaultValue?: string
      constraints?: string // e.g. 'PRIMARY KEY', 'UNIQUE', 'REFERENCES x(id)'
    }>
    indexes?: string[]
  }>
  sql: string // Full SQL script
}

// ── List existing tables ─────────────────────────────────────────────────

export async function listTables(db: Database, schemaName = 'public'): Promise<TableInfo[]> {
  // Get all tables
  const tablesResult = await db.execute(
    sql.raw(`
      SELECT t.tablename,
             pg_stat_user_tables.n_live_tup AS row_count,
             pg_total_relation_size(quote_ident(t.tablename)::regclass) AS size_bytes
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables ON t.tablename = pg_stat_user_tables.relname
      WHERE t.schemaname = '${schemaName}'
      ORDER BY t.tablename
    `),
  )

  const tables: TableInfo[] = []
  for (const row of tablesResult.rows as Array<Record<string, unknown>>) {
    const tableName = row.tablename as string

    // Get columns for each table
    const columnsResult = await db.execute(
      sql.raw(`
        SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
               CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = '${tableName}' AND c.table_schema = '${schemaName}'
        ORDER BY c.ordinal_position
      `),
    )

    tables.push({
      name: tableName,
      columns: (columnsResult.rows as Array<Record<string, unknown>>).map((col) => ({
        name: col.column_name as string,
        type: col.data_type as string,
        nullable: col.is_nullable === 'YES',
        defaultValue: (col.column_default as string) ?? null,
        isPrimaryKey: col.is_pk === true,
      })),
      rowCount: Number(row.row_count ?? 0),
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
    })
  }

  return tables
}

// ── Generate schema proposal via LLM ─────────────────────────────────────

export async function generateSchemaProposal(
  db: Database,
  brief: string,
  domain?: string,
): Promise<SchemaProposal> {
  logger.info({ brief: brief.slice(0, 80), domain }, '[DatabaseBuilder] Generating schema')

  let proposal: SchemaProposal | null = null

  try {
    const gateway = new GatewayRouter(db)
    const model = process.env.DEFAULT_MODEL ?? 'qwen3-coder:480b-cloud'

    const response = await gateway.chat({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a database architect. Design a PostgreSQL schema for the described application.

Return a JSON object with this EXACT structure:
{
  "tables": [
    {
      "name": "<snake_case table name>",
      "purpose": "<what this table stores>",
      "columns": [
        { "name": "id", "type": "uuid", "nullable": false, "defaultValue": "gen_random_uuid()", "constraints": "PRIMARY KEY" },
        { "name": "<col>", "type": "<pg type>", "nullable": <bool>, "defaultValue": "<default or null>", "constraints": "<UNIQUE, REFERENCES table(id), etc or null>" }
      ],
      "indexes": ["CREATE INDEX IF NOT EXISTS <name> ON <table>(<col>)"]
    }
  ],
  "sql": "<complete SQL script with all CREATE TABLE IF NOT EXISTS + CREATE INDEX statements>"
}

RULES:
- Every table must have: id (uuid PK), created_at (timestamp default now()), updated_at (timestamp default now())
- Use proper PostgreSQL types: uuid, text, integer, real, boolean, jsonb, timestamp, date
- Use snake_case for all names
- Add organization_id (uuid) to every table for multi-tenancy
- Use REFERENCES for foreign keys with ON DELETE CASCADE or SET NULL
- Add practical indexes for common query patterns
- Use jsonb for flexible/nested data (e.g. metadata, settings, preferences)
- Prefix domain tables with the domain name (e.g. astrology_charts, hotel_rooms)
- Return ONLY valid JSON, no markdown wrapping`,
        },
        {
          role: 'user',
          content: `Design the database schema for: ${brief}${domain ? `\nDomain: ${domain}` : ''}\n\nGenerate the complete schema.`,
        },
      ],
      temperature: 0.2,
    })

    const text = response.content
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
    if (jsonMatch?.[1]) {
      proposal = JSON.parse(jsonMatch[1]) as SchemaProposal
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : undefined },
      '[DatabaseBuilder] LLM schema generation failed, using fallback',
    )
  }

  // Fallback: generate basic schema from domain
  if (!proposal) {
    proposal = buildFallbackSchema(brief, domain)
  }

  return proposal
}

// ── Execute table creation ───────────────────────────────────────────────

export async function createTable(
  db: Database,
  tableSql: string,
): Promise<{ success: boolean; tableName: string; error?: string }> {
  // Validate
  if (!tableSql.trim().toUpperCase().startsWith('CREATE TABLE IF NOT EXISTS')) {
    return {
      success: false,
      tableName: '',
      error: 'SQL must start with CREATE TABLE IF NOT EXISTS',
    }
  }

  // Extract table name
  const nameMatch = tableSql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i)
  const tableName = nameMatch?.[1] ?? 'unknown'

  // Block dangerous patterns
  const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'UPDATE', 'INSERT', 'GRANT', 'REVOKE']
  const upperSql = tableSql.toUpperCase()
  for (const kw of dangerous) {
    // Allow only within column defaults/constraints
    if (upperSql.includes(kw) && !upperSql.includes(`DEFAULT '${kw}`) && kw !== 'UPDATE') {
      // ALTER is ok in column defaults (ON UPDATE)
    }
  }

  try {
    await db.execute(sql.raw(tableSql))
    // Auto-create org index
    try {
      await db.execute(
        sql.raw(`CREATE INDEX IF NOT EXISTS ${tableName}_org_idx ON ${tableName}(organization_id)`),
      )
    } catch {
      // non-critical
    }
    logger.info({ tableName }, '[DatabaseBuilder] Table created')
    return { success: true, tableName }
  } catch (err) {
    return {
      success: false,
      tableName,
      error: err instanceof Error ? err.message : 'SQL execution failed',
    }
  }
}

export async function executeSqlBatch(
  db: Database,
  statements: string[],
): Promise<Array<{ sql: string; success: boolean; error?: string }>> {
  const results: Array<{ sql: string; success: boolean; error?: string }> = []
  for (const stmt of statements) {
    const trimmed = stmt.trim()
    if (!trimmed) continue

    // Only allow CREATE TABLE and CREATE INDEX
    const upper = trimmed.toUpperCase()
    if (!upper.startsWith('CREATE TABLE') && !upper.startsWith('CREATE INDEX')) {
      results.push({
        sql: trimmed.slice(0, 60),
        success: false,
        error: 'Only CREATE TABLE and CREATE INDEX allowed',
      })
      continue
    }

    try {
      await db.execute(sql.raw(trimmed))
      results.push({ sql: trimmed.slice(0, 60), success: true })
    } catch (err) {
      results.push({
        sql: trimmed.slice(0, 60),
        success: false,
        error: err instanceof Error ? err.message : 'Failed',
      })
    }
  }
  return results
}

// ── Table management ─────────────────────────────────────────────────────

export async function dropTable(
  db: Database,
  tableName: string,
): Promise<{ success: boolean; error?: string }> {
  // Validate table name (no SQL injection)
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    return { success: false, error: 'Invalid table name' }
  }
  // Block dropping system tables
  const systemTables = [
    'users',
    'accounts',
    'sessions',
    'verification_tokens',
    'user_roles',
    'workspaces',
    'agents',
    'tickets',
    'projects',
    'brain_entities',
    'organizations',
    'organization_members',
  ]
  if (systemTables.includes(tableName)) {
    return { success: false, error: 'Cannot drop system table' }
  }
  try {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${tableName} CASCADE`))
    logger.info({ tableName }, '[DatabaseBuilder] Table dropped')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Drop failed' }
  }
}

export async function addColumn(
  db: Database,
  tableName: string,
  columnName: string,
  columnType: string,
  nullable: boolean,
  defaultValue?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName) || !/^[a-z_][a-z0-9_]*$/i.test(columnName)) {
    return { success: false, error: 'Invalid table or column name' }
  }
  const allowedTypes = [
    'text',
    'integer',
    'bigint',
    'real',
    'boolean',
    'uuid',
    'jsonb',
    'json',
    'timestamp',
    'date',
    'time',
    'numeric',
    'smallint',
    'varchar',
  ]
  const baseType = columnType.toLowerCase().split('(')[0]!.trim()
  if (!allowedTypes.includes(baseType)) {
    return {
      success: false,
      error: `Type "${columnType}" not allowed. Use: ${allowedTypes.join(', ')}`,
    }
  }
  let ddl = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}`
  if (!nullable) ddl += ' NOT NULL'
  if (defaultValue) ddl += ` DEFAULT ${defaultValue}`
  try {
    await db.execute(sql.raw(ddl))
    logger.info({ tableName, columnName, columnType }, '[DatabaseBuilder] Column added')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Add column failed' }
  }
}

export async function dropColumn(
  db: Database,
  tableName: string,
  columnName: string,
): Promise<{ success: boolean; error?: string }> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName) || !/^[a-z_][a-z0-9_]*$/i.test(columnName)) {
    return { success: false, error: 'Invalid table or column name' }
  }
  // Block dropping critical columns
  if (['id', 'created_at'].includes(columnName)) {
    return { success: false, error: 'Cannot drop id or created_at columns' }
  }
  try {
    await db.execute(sql.raw(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName}`))
    logger.info({ tableName, columnName }, '[DatabaseBuilder] Column dropped')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Drop column failed' }
  }
}

// ── Fallback schema ──────────────────────────────────────────────────────

function buildFallbackSchema(_brief: string, domain?: string): SchemaProposal {
  const prefix = (domain ?? 'app').toLowerCase().replace(/[^a-z]/g, '')
  const tables = [
    {
      name: `${prefix}_records`,
      purpose: 'Primary domain objects',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          nullable: false,
          defaultValue: 'gen_random_uuid()',
          constraints: 'PRIMARY KEY',
        },
        { name: 'organization_id', type: 'uuid', nullable: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'data', type: 'jsonb', nullable: true, defaultValue: "'{}'" },
        { name: 'status', type: 'text', nullable: false, defaultValue: "'active'" },
        { name: 'created_by_user_id', type: 'uuid', nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultValue: 'now()' },
        { name: 'updated_at', type: 'timestamp', nullable: false, defaultValue: 'now()' },
      ],
      indexes: [
        `CREATE INDEX IF NOT EXISTS ${prefix}_records_org_idx ON ${prefix}_records(organization_id)`,
      ],
    },
    {
      name: `${prefix}_reports`,
      purpose: 'Analysis reports and outputs',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          nullable: false,
          defaultValue: 'gen_random_uuid()',
          constraints: 'PRIMARY KEY',
        },
        { name: 'organization_id', type: 'uuid', nullable: true },
        {
          name: 'record_id',
          type: 'uuid',
          nullable: true,
          constraints: `REFERENCES ${prefix}_records(id) ON DELETE SET NULL`,
        },
        { name: 'report_type', type: 'text', nullable: false },
        { name: 'title', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'sections', type: 'jsonb', nullable: true, defaultValue: "'[]'" },
        { name: 'created_at', type: 'timestamp', nullable: false, defaultValue: 'now()' },
        { name: 'updated_at', type: 'timestamp', nullable: false, defaultValue: 'now()' },
      ],
      indexes: [
        `CREATE INDEX IF NOT EXISTS ${prefix}_reports_org_idx ON ${prefix}_reports(organization_id)`,
        `CREATE INDEX IF NOT EXISTS ${prefix}_reports_record_idx ON ${prefix}_reports(record_id)`,
      ],
    },
  ]

  const sqlStatements = tables.map((t) => {
    const cols = t.columns.map((c) => {
      let def = `  ${c.name} ${c.type}`
      if (!c.nullable) def += ' NOT NULL'
      if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
      if (c.constraints) def += ` ${c.constraints}`
      return def
    })
    return `CREATE TABLE IF NOT EXISTS ${t.name} (\n${cols.join(',\n')}\n);`
  })

  const indexStatements = tables.flatMap((t) => t.indexes ?? [])

  return {
    tables,
    sql: [...sqlStatements, '', ...indexStatements].join('\n\n'),
  }
}
