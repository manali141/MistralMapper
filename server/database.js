import pg from 'pg'

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL?.trim()

export const isPostgresConfigured = Boolean(databaseUrl)

export const pool = isPostgresConfigured
  ? new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null

if (pool) {
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.message)
  })
}

export async function closePostgres() {
  if (pool) {
    await pool.end()
  }
}
