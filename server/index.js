import 'dotenv/config'
import connectPgSimple from 'connect-pg-simple'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import { MongoClient } from 'mongodb'
import { createAuthRouter } from './auth.js'
import { closePostgres, isPostgresConfigured, pool } from './database.js'

const app = express()

const port = Number(process.env.PORT || 4000)
const mongoUri = process.env.MONGODB_URI
const mongoDb = process.env.MONGODB_DB || 'MistralMapper'
const mongoCollection = process.env.MONGODB_COLLECTION || 'Mappings'
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
const mongoApiKey = process.env.MONGO_API_KEY || ''
const mistralApiKey = process.env.MISTRAL_API_KEY || ''
const sessionSecret = process.env.SESSION_SECRET || ''
const authEnabled = Boolean(pool && sessionSecret.length >= 32)

if (!mongoUri) {
  console.error('Missing MONGODB_URI environment variable. MongoDB features will be disabled.')
}

if (!isPostgresConfigured) {
  console.error('Missing DATABASE_URL environment variable. Authentication will be disabled.')
}

if (isPostgresConfigured && sessionSecret.length < 32) {
  console.error('SESSION_SECRET must contain at least 32 characters. Authentication will be disabled.')
}

let client = null
let mappingsCollection
let mongoState = {
  connected: false,
  message: 'Not initialized.',
}

async function initializeMongo() {
  if (!mongoUri) {
    mongoState = {
      connected: false,
      message: 'MongoDB disabled: MONGODB_URI is not set.',
    }
    return
  }

  try {
    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      tlsAllowInvalidCertificates: true,
      tls: true,
    })

    await client.connect()
    const db = client.db(mongoDb)
    mappingsCollection = db.collection(mongoCollection)

    await mappingsCollection.createIndex({ createdAt: -1 })
    mongoState = {
      connected: true,
      message: `MongoDB connected: ${mongoDb}.${mongoCollection}`,
    }
    console.log(mongoState.message)
  } catch (error) {
    mongoState = {
      connected: false,
      message: `MongoDB unavailable: ${error.message}`,
    }
    console.error(mongoState.message)
  }
}

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

if (authEnabled) {
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }

  const PgSession = connectPgSimple(session)
  app.use(
    session({
      name: 'accountbridge.sid',
      store: new PgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  )
  app.use('/api/auth', createAuthRouter(pool))
} else {
  app.use('/api/auth', (_req, res) => {
    res.status(503).json({
      error: 'Account access is not configured yet. Add PostgreSQL settings and restart the server.',
    })
  })
}

app.get('/api/health', async (_req, res) => {
  let postgresStatus = 'disabled'
  if (authEnabled) {
    try {
      await pool.query('select 1')
      postgresStatus = 'connected'
    } catch {
      postgresStatus = 'unavailable'
    }
  }

  if (!mongoState.connected || !client) {
    return res.status(200).json({
      ok: true,
      mongodb: 'disconnected',
      postgres: postgresStatus,
      message: mongoState.message,
      database: mongoDb,
      collection: mongoCollection,
    })
  }

  try {
    const adminDb = client.db().admin()
    const { ok } = await adminDb.ping()
    
    if (ok) {
      return res.status(200).json({ 
        ok: true, 
        mongodb: 'connected',
        postgres: postgresStatus,
        database: mongoDb,
        collection: mongoCollection
      })
    }
    
    return res.status(503).json({ 
      ok: false, 
      mongodb: 'unreachable',
      postgres: postgresStatus,
    })
  } catch (error) {
    return res.status(503).json({ 
      ok: false, 
      mongodb: 'error',
      postgres: postgresStatus,
      message: error.message 
    })
  }
})

app.post('/api/mistral-mapping', async (req, res) => {
  try {
    if (!mistralApiKey) {
      return res.status(500).json({
        error: 'Missing MISTRAL_API_KEY on backend.',
      })
    }

    const {
      model = 'mistral-large-latest',
      prompt,
      wildApricotItems = [],
      quickBooksProducts = [],
      quickBooksClasses = [],
      isAccountant = false,
    } = req.body || {}

    if (!prompt) {
      return res.status(400).json({
        error: 'Missing prompt for Mistral mapping request.',
      })
    }

    const requestBody = {
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You are a data mapping assistant. Return a JSON object with keys: mappings (array), notes (string), confidence (number between 0 and 1).',
        },
        {
          role: 'user',
          content: [
            `Prompt: ${prompt}`,
            `WA Membership Levels (extracted from invoice ordertype):\n${JSON.stringify(wildApricotItems, null, 2)}`,
            `QuickBooks Products (active=true, extracted from Id/Name/Classification):\n${JSON.stringify(quickBooksProducts, null, 2)}`,
            `QuickBooks Classes (active=true, extracted from classification):\n${JSON.stringify(quickBooksClasses, null, 2)}`,
            `isAccountant:\n${JSON.stringify(Boolean(isAccountant))}`,
            'Create field mappings from WildApricot Invoice to QuickBooks Accounts and Class.',
          ].join('\n\n'),
        },
      ],
    }

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorPayload = await response.text()
      return res.status(response.status).json({
        error: `Mistral API failed (${response.status}).`,
        details: errorPayload,
      })
    }

    const payload = await response.json()
    const raw = payload?.choices?.[0]?.message?.content

    if (!raw) {
      return res.status(502).json({
        error: 'Mistral API returned an empty completion.',
      })
    }

    return res.status(200).json({ raw, payload })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to call Mistral from backend.',
      message: error.message,
    })
  }
})

app.get('/api/mappings/history', async (req, res) => {
  try {
    if (!mappingsCollection) {
      return res.status(503).json({
        error: 'MongoDB is not connected yet.',
        message: mongoState.message,
      })
    }

    const accountId = req.query.accountId != null ? Number(req.query.accountId) : null
    const isAccountant = req.query.isAccountant === 'true'

    const filter = {}
    if (accountId != null && !Number.isNaN(accountId)) {
      filter.accountId = accountId
    }
    filter.isAccountant = isAccountant

    const records = await mappingsCollection
      .find(filter, { projection: { mapping: 1, prompt: 1, createdAt: 1, _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray()

    return res.status(200).json({ records })
  } catch (error) {
    console.error('Failed to fetch mapping history', error)
    return res.status(500).json({ error: 'Failed to fetch mapping history.' })
  }
})

app.get('/api/mappings/latest', async (req, res) => {
  try {
    if (!mappingsCollection) {
      return res.status(503).json({
        error: 'MongoDB is not connected yet.',
        message: mongoState.message,
      })
    }

    const accountIdRaw = req.query.accountId
    const accountId = Number(accountIdRaw)
    if (accountIdRaw == null || Number.isNaN(accountId)) {
      return res.status(400).json({
        error: 'accountId query parameter is required and must be a number.',
      })
    }

    const requestedN = Number(req.query.n ?? 10)
    const safeN = Number.isFinite(requestedN) ? Math.trunc(requestedN) : 10
    const limit = Math.min(Math.max(safeN, 1), 100)

    const records = await mappingsCollection
      .find(
        { accountId },
        {
          projection: {
            _id: 0,
            accountId: 1,
            isAccountant: 1,
            prompt: 1,
            mapping: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    return res.status(200).json({
      accountId,
      requested: safeN,
      returned: records.length,
      records,
    })
  } catch (error) {
    console.error('Failed to fetch latest mappings', error)
    return res.status(500).json({ error: 'Failed to fetch latest mappings.' })
  }
})

app.post('/api/mappings', async (req, res) => {
  try {
    if (!mappingsCollection) {
      return res.status(503).json({
        error: 'MongoDB is not connected yet.',
        message: mongoState.message,
      })
    }

    if (mongoApiKey) {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.replace('Bearer ', '')
      if (token !== mongoApiKey) {
        return res.status(401).json({ error: 'Unauthorized.' })
      }
    }

    const {
      prompt,
      mapping,
      accountId = null,
      isAccountant = false,
      sourceData,
      targetData,
      Invoices,
      ProductsAndClasses,
    } = req.body

    const invoices = Invoices ?? sourceData
    const productsAndClasses = ProductsAndClasses ?? targetData

    if (!prompt || !invoices || !productsAndClasses || !mapping) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, Invoices, ProductsAndClasses, mapping.',
      })
    }

    const document = {
      prompt,
      invoices,
      productsAndClasses,
      isAccountant,
      mapping,
      accountId,
      createdAt: new Date().toISOString(),
    }

    const insertResult = await mappingsCollection.insertOne(document)

    return res.status(201).json({
      ok: true,
      insertedId: insertResult.insertedId,
      storedAt: document.createdAt,
    })
  } catch (error) {
    console.error('Failed to store mapping', error)
    return res.status(500).json({ error: 'Failed to persist mapping record.' })
  }
})

app.listen(port, () => {
  console.log(`Mapping API running on http://localhost:${port}`)
})

initializeMongo()

process.on('SIGINT', async () => {
  await Promise.all([
    client ? client.close() : Promise.resolve(),
    closePostgres(),
  ])
  process.exit(0)
})
