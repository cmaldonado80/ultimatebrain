/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/solarc'
  const pool = new pg.Pool({ connectionString })
  const db = drizzle(pool)

  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete.')

  await pool.end()
  process.exit(0)
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
