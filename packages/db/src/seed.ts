import type { Database } from './index'
import { createDb } from './index'

async function seed() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }

  const db: Database = createDb(connectionString)
  console.log('Seeding database...')

  // TODO: Phase 0C — Read all 25 JSON files from runtime/state/
  // Transform and insert into Postgres tables
  // Validate row counts match source
  void db

  console.log('Seed complete (no data to seed yet).')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
