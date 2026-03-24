import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index'

export * from './schema/index'

export function createDb(connectionString: string) {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  const pool = new pg.Pool({
    connectionString,
    // Serverless: keep pool tiny to avoid exhausting DB connections
    max: isServerless ? 3 : 20,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 5_000,
  })
  return drizzle(pool, { schema })
}

export type Database = ReturnType<typeof createDb>
