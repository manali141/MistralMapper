import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseAccountFolder(folderName) {
  const match = folderName.match(/(\d+)\s*$/)
  if (!match) {
    return null
  }

  return {
    name: folderName,
    accountId: Number(match[1]),
  }
}

function toPublicUrlPath(publicRoot, absolutePath) {
  const relative = path.relative(publicRoot, absolutePath)
  const segments = relative.split(path.sep).filter(Boolean)
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`
}

function pickJsonFilePath(fileNames, keyword) {
  const normalizedKeyword = keyword.toLowerCase()
  const preferred = fileNames.find((fileName) => {
    const lower = fileName.toLowerCase()
    return lower.endsWith('.json') && lower.includes(normalizedKeyword)
  })

  if (preferred) {
    return preferred
  }

  return fileNames.find((fileName) => fileName.toLowerCase().endsWith('.json')) || ''
}

async function loadAccountFoldersFromPublic() {
  const publicRoot = path.join(__dirname, 'public')
  const rootsToScan = [path.join(publicRoot, 'test-data'), publicRoot]
  const accountsById = new Map()

  for (const root of rootsToScan) {
    let entries = []
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries.filter((item) => item.isDirectory())) {
      const folderName = entry.name
      const folderPath = path.join(root, folderName)
      const parsed = parseAccountFolder(folderName)
      if (!parsed) {
        continue
      }

      let fileEntries = []
      try {
        fileEntries = await readdir(folderPath, { withFileTypes: true })
      } catch {
        fileEntries = []
      }

      const fileNames = fileEntries
        .filter((fileEntry) => fileEntry.isFile())
        .map((fileEntry) => fileEntry.name)

      const sourceFile = pickJsonFilePath(fileNames, 'wildapricot')
      const targetFile = pickJsonFilePath(fileNames, 'quickbooks')
      const folderUrl = toPublicUrlPath(publicRoot, folderPath)

      if (!accountsById.has(parsed.accountId)) {
        accountsById.set(parsed.accountId, {
          ...parsed,
          sourceEndpoint: sourceFile ? `${folderUrl}/${encodeURIComponent(sourceFile)}` : '',
          targetEndpoint: targetFile ? `${folderUrl}/${encodeURIComponent(targetFile)}` : '',
        })
      }
    }
  }

  return Array.from(accountsById.values()).sort((a, b) => a.accountId - b.accountId)
}

function accountFoldersDevApiPlugin() {
  return {
    name: 'account-folders-dev-api',
    configureServer(server) {
      server.middlewares.use('/dev-api/test-accounts', async (_req, res) => {
        try {
          const accounts = await loadAccountFoldersFromPublic()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ accounts }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Failed to load account folders.',
              message: error.message,
            }),
          )
        }
      })
    },
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk
    })

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(new Error('Invalid JSON body.'))
      }
    })

    req.on('error', (error) => {
      reject(error)
    })
  })
}

function mistralDevApiPlugin({ mistralApiKey }) {
  return {
    name: 'mistral-dev-api',
    configureServer(server) {
      server.middlewares.use('/dev-api/mistral-mapping', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        if (!mistralApiKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Missing MISTRAL_API_KEY in .env.' }))
          return
        }

        try {
          const {
            model = 'mistral-large-latest',
            prompt,
            wildApricotItems = [],
            quickBooksProducts = [],
            quickBooksClasses = [],
            isAccountant = false,
            priorMappings = [],
          } = await readJsonBody(req)

          if (!prompt) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing prompt for Mistral mapping request.' }))
            return
          }

          const priorMappingsContext =
            priorMappings.length > 0
              ? `\n\nPrevious confirmed mappings for this account (use as context to improve consistency):\n${JSON.stringify(priorMappings.map((r) => r.mapping), null, 2)}`
              : ''

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
                  'Create field mappings from WildApricot Invoice to QuickBooks Accounts and Class.' + priorMappingsContext,
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
            const details = await response.text()
            res.statusCode = response.status
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: `Mistral API failed (${response.status}).`,
                details,
              }),
            )
            return
          }

          const payload = await response.json()
          const raw = payload?.choices?.[0]?.message?.content

          if (!raw) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Mistral API returned an empty completion.' }))
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ raw, payload }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Failed to call Mistral from Vite dev server.',
              message: error.message,
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mistralApiKey = env.MISTRAL_API_KEY || ''

  return {
    plugins: [
      react(),
      accountFoldersDevApiPlugin(),
      mistralDevApiPlugin({ mistralApiKey }),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  }
})
