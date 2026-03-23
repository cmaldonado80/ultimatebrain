import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index'

export * from './schema/index'

export function createDb(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  })
  return drizzle(pool, { schema })
}

export type Database = ReturnType<typeof createDb>
