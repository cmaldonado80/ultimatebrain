/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

async function runMigrations() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/solarc'
  const pool = new pg.Pool({ connectionString })
  const db = drizzle(pool)

  console.log('Running migrations...')
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('Migrations complete.')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // If migrations fail because objects already exist, fall back to drizzle-kit push
    if (msg.includes('already exists')) {
      console.log('Some objects already exist — running schema push to reconcile...')
      const { execSync } = await import('node:child_process')
      execSync('npx drizzle-kit push --force', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: connectionString },
      })
      console.log('Schema push complete.')
    } else {
      throw err
    }
  }

  await pool.end()
  process.exit(0)
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
