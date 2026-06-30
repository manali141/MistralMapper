import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { closePostgres, pool } from './database.js'

async function migrate() {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured.')
  }

  const migrationUrl = new URL('./migrations/001_auth.sql', import.meta.url)
  const migrationSql = await readFile(fileURLToPath(migrationUrl), 'utf8')

  await pool.query(migrationSql)
  console.log('PostgreSQL authentication tables are ready.')
}

migrate()
  .catch((error) => {
    console.error(`Migration failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(closePostgres)
