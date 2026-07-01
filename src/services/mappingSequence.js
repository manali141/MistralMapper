import * as XLSX from 'xlsx'

function normalizePlainObject(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim(), value]),
  )
}
console.log("DB:", process.env.DATABASE_URL);
console.log("JWT:", process.env.JWT_SECRET);
function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function parseCsv(content) {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())

  if (lines.length < 2) {
    throw new Error('This CSV file needs a header row and at least one data row.')
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return normalizePlainObject(
      headers.reduce((row, header, index) => {
        row[header || `Column ${index + 1}`] = values[index] ?? ''
        return row
      }, {}),
    )
  })
}

function getFileExtension(fileName) {
  return String(fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
}

async function readJsonFromFile(file) {
  if (!file) {
    throw new Error('Please choose a file to continue.')
  }

  const extension = getFileExtension(file.name)

  if (extension === 'json') {
    const content = await file.text()

    try {
      return JSON.parse(content)
    } catch {
      throw new Error(`We could not read ${file.name}. Please check that it is a valid JSON file.`)
    }
  }

  if (extension === 'csv') {
    const content = await file.text()
    return parseCsv(content)
  }

  if (['xlsx', 'xls'].includes(extension)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      throw new Error(`We could not find any rows in ${file.name}.`)
    }

    return XLSX.utils
      .sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' })
      .map(normalizePlainObject)
  }

  throw new Error('Please upload a JSON, CSV, or Excel file.')
}

async function readJsonFromEndpoint(endpoint) {
  if (!endpoint) {
    throw new Error('Please enter a link to continue.')
  }

  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error('We could not load data from that link. Please check it and try again.')
  }

  return response.json()
}

async function resolveJsonInput(input) {
  if (input.mode === 'file') {
    return readJsonFromFile(input.file)
  }

  if (input.mode === 'endpoint') {
    return readJsonFromEndpoint(input.endpoint)
  }

  throw new Error('Please choose either file upload or link import.')
}

function parseJsonOrNull(content) {
  if (content && typeof content === 'object') {
    return content
  }

  if (typeof content !== 'string') {
    return null
  }

  const trimmed = content.trim()
  const candidates = []

  const pushCandidate = (value) => {
    if (typeof value !== 'string') {
      return
    }
    const normalized = value.trim()
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized)
    }
  }

  pushCandidate(trimmed)

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch?.[1]) {
    pushCandidate(fencedMatch[1])
  }

  const firstArrayStart = trimmed.indexOf('[')
  const lastArrayEnd = trimmed.lastIndexOf(']')
  if (firstArrayStart !== -1 && lastArrayEnd > firstArrayStart) {
    pushCandidate(trimmed.slice(firstArrayStart, lastArrayEnd + 1))
  }

  const firstObjectStart = trimmed.indexOf('{')
  const lastObjectEnd = trimmed.lastIndexOf('}')
  if (firstObjectStart !== -1 && lastObjectEnd > firstObjectStart) {
    pushCandidate(trimmed.slice(firstObjectStart, lastObjectEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try next candidate.
    }
  }

  return null
}

export function extractWildApricotItemsFromInvoices(invoiceData) {
  const values = new Set()
  const primaryKeys = new Set([
    'ordertype',
    'order type',
    'transactiontype',
    'transaction type',
    'membershiplevel',
    'membership level',
    'itemtype',
    'item type',
    'category',
    'category name',
  ])
  const secondaryKeys = new Set(['item', 'itemname', 'item name', 'product', 'description'])

  const collectValues = (node, allowedKeys) => {
    if (!node || typeof node !== 'object') {
      return
    }

    if (Array.isArray(node)) {
      node.forEach((item) => collectValues(item, allowedKeys))
      return
    }

    Object.entries(node).forEach(([key, value]) => {
      const normalizedKey = String(key).trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')
      if (allowedKeys.has(normalizedKey) && value !== undefined && value !== null && typeof value !== 'object') {
        const normalized = String(value).trim()
        const normalizedLower = normalized.toLowerCase()
        if (normalized && !['undefined', 'null', 'n/a', 'na', 'none'].includes(normalizedLower)) {
          values.add(normalized)
        }
      }
    })

    Object.values(node).forEach((value) => collectValues(value, allowedKeys))
  }

  collectValues(invoiceData, primaryKeys)
  if (values.size === 0) {
    collectValues(invoiceData, secondaryKeys)
  }

  return Array.from(values)
}

function isExplicitlyInactive(value) {
  if (value === false || value === 0) return true
  return typeof value === 'string' && ['false', '0', 'no', 'n'].includes(value.trim().toLowerCase())
}

function collectArraysByKey(source, acceptedKeys) {
  const records = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }

    Object.entries(node).forEach(([key, value]) => {
      if (Array.isArray(value) && acceptedKeys.has(String(key).trim().toLowerCase())) {
        value.forEach((record) => {
          if (record && typeof record === 'object') records.push(record)
        })
      }
      walk(value)
    })
  }

  walk(source)
  return records
}

export function extractQuickBooksPromptData(quickBooksData) {
  const structuredProducts = collectArraysByKey(quickBooksData, new Set(['item', 'items']))
  const structuredClasses = collectArraysByKey(quickBooksData, new Set(['class', 'classes']))
  const productSource = structuredProducts.length > 0
    ? structuredProducts
    : Array.isArray(quickBooksData) ? quickBooksData : []
  const products = new Map()

  productSource.forEach((record) => {
    if (isExplicitlyInactive(record.active ?? record.Active)) return

    const id = String(record.id ?? record.Id ?? '').trim()
    const name = String(record.name ?? record.Name ?? record.itemName ?? record['Item Name'] ?? '').trim()
    const classification = String(
      record.classification
      ?? record.Classification
      ?? record.class
      ?? record.Class
      ?? '',
    ).trim()

    if (!name) return
    const key = [id, name, classification].join('::')
    products.set(key, {
      ...(id ? { Id: id } : {}),
      Name: name,
      ...(classification ? { Classification: classification } : {}),
    })
  })

  const explicitClasses = structuredClasses
    .filter((record) => !isExplicitlyInactive(record.active ?? record.Active))
    .map((record) => String(record.name ?? record.Name ?? '').trim())
    .filter(Boolean)
  const productClasses = Array.from(products.values())
    .map((product) => String(product.Classification ?? '').trim())
    .filter(Boolean)
  const classes = explicitClasses.length > 0 ? explicitClasses : productClasses

  return {
    quickBooksProducts: Array.from(products.values()),
    quickBooksClasses: Array.from(new Set(classes)),
  }
}

export function buildGeneratedPrompt({
  wildApricotItems,
  quickBooksProducts,
  quickBooksClasses,
  priorMappings,
  isAccountant = false,
}) {
  const waMembershipLevels = JSON.stringify(wildApricotItems ?? [], null, 2)
  const quickBooksProductRecords = JSON.stringify(quickBooksProducts ?? [], null, 2)
  const quickBooksClassificationValues = JSON.stringify(quickBooksClasses ?? [], null, 2)

  return `
You are a mapping assistant.

Use these variables from the uploaded files:

waMembershipLevels = ${waMembershipLevels}

quickBooksProducts = ${quickBooksProductRecords}

quickBooksClasses = ${quickBooksClassificationValues}

isAccountant = ${isAccountant}

priorMappings = ${JSON.stringify(priorMappings, null, 2)}

When given waMembershipLevels, QuickBooks (QB) active products (with Id, Name, Classification), and active QuickBooks classes:

Your task:
- Map each WA membership level from waMembershipLevels to the closest matching QB product by context or similarity and keep the corresponding ID and classification.
- Choose the QuickBooks class independently from quickBooksClasses based on the business meaning of each source item. For example, event registration should use an Event class and online store activity should use a Merchandise or Retail class when available.
- Treat each source item independently. Do not repeat the same QuickBooks product for every row when other relevant products are available.
- Return the result as an array of objects in the format:
  [{ WAFieldName: WA_level, QBProduct: QB_name, QBProductId: QB_ID, QBClassification: QB_classification }]
- Ensure all WA membership levels are mapped to a QB product with no null or missing values.
`.trim()
}

async function callMistralForMapping({
  wildApricotItems,
  quickBooksProducts,
  quickBooksClasses,
  isAccountant,
  prompt,
  model,
  priorMappings = [],
}) {
  const fallbackResult = () => createFallbackMappingResult({
    wildApricotItems,
    quickBooksProducts,
    quickBooksClasses,
    reason: 'Local suggestions were used because AI suggestions were not available.',
  })

  let response

  try {
    response = await fetch('/dev-api/mistral-mapping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        wildApricotItems,
        quickBooksProducts,
        quickBooksClasses,
        isAccountant,
        priorMappings,
      }),
    })
  } catch {
    return fallbackResult()
  }

  if (!response.ok) {
    return fallbackResult()
  }

  let payload

  try {
    payload = await response.json()
  } catch {
    return fallbackResult()
  }
  const content = payload?.raw ?? payload?.mappings ?? payload?.mapping ?? payload

  if (!content) {
    return fallbackResult()
  }

  const parsed = parseJsonOrNull(content)
  const parsedRows = extractMappingRowsFromParsed(parsed)

  if (parsedRows.length === 0) {
    return fallbackResult()
  }

  const mappings = reconcileMappingRows({
    wildApricotItems,
    quickBooksProducts,
    quickBooksClasses,
    suggestedRows: parsedRows,
  })

  return {
    raw: content,
    parsed: {
      ...(parsed && !Array.isArray(parsed) ? parsed : {}),
      mappings,
    },
    payload,
  }
}

function extractMappingRowsFromParsed(parsed) {
  if (Array.isArray(parsed)) {
    return parsed
  }

  if (!parsed || typeof parsed !== 'object') {
    return []
  }

  const candidates = [
    parsed.mappings,
    parsed.mapping,
    parsed.data?.mappings,
    parsed.result?.mappings,
  ]

  return candidates.find(Array.isArray) ?? []
}

function createFallbackMappingResult({ wildApricotItems, quickBooksProducts, quickBooksClasses, reason }) {
  const sourceItems = wildApricotItems.length > 0 ? wildApricotItems : ['Imported organization item']
  const mappings = reconcileMappingRows({
    wildApricotItems: sourceItems,
    quickBooksProducts,
    quickBooksClasses,
    suggestedRows: [],
  })

  return {
    raw: JSON.stringify({ mappings, notes: reason, confidence: 0.65 }),
    parsed: { mappings, notes: reason, confidence: 0.65 },
    payload: { fallback: true, reason },
  }
}

const semanticIntents = [
  {
    source: ['renewal', 'renew'],
    product: ['renewal', 'subscription', 'annual', 'monthly', 'plan'],
    classes: ['membership', 'annual', 'monthly'],
  },
  {
    source: ['event', 'registration', 'register'],
    product: ['registration', 'event', 'ticket', 'pass', 'program'],
    classes: ['event', 'education', 'training'],
  },
  {
    source: ['application', 'apply'],
    product: ['application', 'package', 'plan', 'service'],
    classes: ['membership', 'serviceplan'],
  },
  {
    source: ['level', 'change', 'upgrade', 'downgrade'],
    product: ['upgrade', 'option', 'tier', 'track', 'package'],
    classes: ['membership'],
  },
  {
    source: ['online', 'store', 'shop', 'sale', 'merchandise'],
    product: ['store', 'merchandise', 'retail', 'product', 'bundle'],
    classes: ['merchandise', 'retail', 'digital'],
  },
  {
    source: ['donation', 'donor', 'contribution'],
    product: ['donation', 'contribution', 'giving'],
    classes: ['donation', 'nonprofit'],
  },
  {
    source: ['consulting', 'consultation'],
    product: ['consulting', 'service'],
    classes: ['consulting', 'professional'],
  },
  {
    source: ['training', 'course', 'education'],
    product: ['training', 'course', 'program'],
    classes: ['training', 'education', 'certification'],
  },
]

const canonicalProductServices = new Map([
  ['membershiprenewal', 'Membership Income'],
  ['eventregistration', 'Event Registration'],
  ['donation', 'Donation Income'],
  ['trainingcourse', 'Training Income'],
  ['merchandisepurchase', 'Merchandise Sales'],
])

function normalizeTokens(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

function semanticTermsFor(item, field) {
  const sourceTokens = new Set(normalizeTokens(item))
  const terms = []

  semanticIntents.forEach((intent) => {
    if (intent.source.some((token) => sourceTokens.has(token))) {
      intent[field].forEach((term) => {
        if (!terms.includes(term)) terms.push(term)
      })
    }
  })

  return terms
}

function scoreTextMatch(source, candidate, semanticField) {
  const sourceTokens = normalizeTokens(source)
  const candidateTokens = normalizeTokens(candidate)
  const candidateSet = new Set(candidateTokens)
  const directScore = sourceTokens.reduce(
    (score, token) => score + (candidateSet.has(token) ? 12 : 0),
    0,
  )
  const semanticTerms = semanticTermsFor(source, semanticField)
  const semanticScore = semanticTerms.reduce(
    (score, term, index) => score + (candidateSet.has(term) ? Math.max(3, 10 - index) : 0),
    0,
  )

  return directScore + semanticScore
}

function productKey(product) {
  return String(product?.Id ?? product?.id ?? product?.Name ?? product?.name ?? '')
}

function findClosestProduct(item, products, usedProductKeys = new Set()) {
  let bestMatch = null
  let bestScore = Number.NEGATIVE_INFINITY

  products.forEach((product, index) => {
    const name = product.Name ?? product.name ?? ''
    const classification = product.Classification ?? product.classification ?? ''
    const duplicatePenalty = usedProductKeys.has(productKey(product)) ? 1000 : 0
    const score = scoreTextMatch(item, `${name} ${classification}`, 'product') - duplicatePenalty - (index * 0.0001)

    if (score > bestScore) {
      bestScore = score
      bestMatch = product
    }
  })

  return { product: bestMatch, score: bestScore }
}

function findClosestClass(item, classes) {
  let bestClass = ''
  let bestScore = Number.NEGATIVE_INFINITY

  classes.forEach((className, index) => {
    const score = scoreTextMatch(item, className, 'classes') - (index * 0.0001)
    if (score > bestScore) {
      bestScore = score
      bestClass = className
    }
  })

  return { className: bestClass, score: bestScore }
}

function findSuggestedRow(item, rows) {
  const normalizedItem = normalizeTokens(item).join('')
  return rows.find((row) => normalizeTokens(
    row.WAFieldName ?? row.waFieldName ?? row.source ?? '',
  ).join('') === normalizedItem)
}

function findSuggestedProduct(row, products) {
  if (!row) return null
  const suggestedId = String(row.QBProductId ?? row.qbProductId ?? row.accountId ?? '').trim().toLowerCase()
  const suggestedName = String(row.QBProduct ?? row.qbProduct ?? row.accountName ?? row.Account ?? '').trim().toLowerCase()

  return products.find((product) => {
    const id = String(product.Id ?? product.id ?? '').trim().toLowerCase()
    const name = String(product.Name ?? product.name ?? '').trim().toLowerCase()
    return (suggestedId && id === suggestedId) || (suggestedName && name === suggestedName)
  }) ?? null
}

function findSuggestedClass(row, classes) {
  if (!row) return ''
  const suggested = String(
    row.QBClassification ?? row.QBClass ?? row.classification ?? row.Classification ?? '',
  ).trim()
  const normalizedSuggested = normalizeTokens(suggested).join('')

  return classes.find((className) => {
    const normalizedClass = normalizeTokens(className).join('')
    return normalizedClass === normalizedSuggested
      || normalizedClass.endsWith(normalizedSuggested)
      || normalizedSuggested.endsWith(normalizedClass)
  }) ?? ''
}

export function reconcileMappingRows({
  wildApricotItems,
  quickBooksProducts,
  quickBooksClasses,
  suggestedRows = [],
}) {
  const products = Array.isArray(quickBooksProducts) ? quickBooksProducts : []
  const classes = Array.isArray(quickBooksClasses) ? quickBooksClasses : []
  const usedProductKeys = new Set()

  return wildApricotItems.map((item) => {
    const canonicalProductName = canonicalProductServices.get(normalizeTokens(item).join('')) ?? ''
    const canonicalProduct = canonicalProductName
      ? products.find((product) => normalizeTokens(product.Name ?? product.name ?? '').join('') === normalizeTokens(canonicalProductName).join(''))
        ?? { Name: canonicalProductName }
      : null
    const suggestedRow = findSuggestedRow(item, suggestedRows)
    const suggestedProduct = findSuggestedProduct(suggestedRow, products)
    const localProductMatch = findClosestProduct(item, products, usedProductKeys)
    const suggestedProductScore = suggestedProduct
      ? scoreTextMatch(
          item,
          `${suggestedProduct.Name ?? suggestedProduct.name ?? ''} ${suggestedProduct.Classification ?? suggestedProduct.classification ?? ''}`,
          'product',
        )
      : Number.NEGATIVE_INFINITY
    const suggestedAlreadyUsed = suggestedProduct && usedProductKeys.has(productKey(suggestedProduct))
    const matchedProduct = canonicalProduct
      ?? (
        suggestedProduct
        && !suggestedAlreadyUsed
        && suggestedProductScore >= localProductMatch.score
          ? suggestedProduct
          : localProductMatch.product
      )

    if (matchedProduct) usedProductKeys.add(productKey(matchedProduct))

    const suggestedClass = findSuggestedClass(suggestedRow, classes)
    const localClassMatch = findClosestClass(item, classes)
    const suggestedClassScore = suggestedClass
      ? scoreTextMatch(item, suggestedClass, 'classes')
      : Number.NEGATIVE_INFINITY
    const matchedClass = suggestedClass && suggestedClassScore >= localClassMatch.score
      ? suggestedClass
      : localClassMatch.className
    const productClassification = String(
      matchedProduct?.Classification ?? matchedProduct?.classification ?? '',
    )

    return {
      WAFieldName: item,
      QBProduct: matchedProduct?.Name ?? matchedProduct?.name ?? String(item),
      QBProductId: matchedProduct?.Id ?? matchedProduct?.id ?? '',
      QBClassification: matchedClass || productClassification,
    }
  })
}

async function writeMappingToMongoEndpoint({ endpoint, apiKey, record }) {
  if (!endpoint) {
    throw new Error('The save step is not ready yet. Please try again later.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(record),
  })

  if (!response.ok) {
    throw new Error('We could not save your setup. Please try again.')
  }

  return response.json().catch(() => ({ ok: true }))
}

async function fetchMappingHistory({ accountId, isAccountant }) {
  try {
    const params = new URLSearchParams()
    if (accountId != null) {
      params.set('accountId', String(accountId))
    }
    params.set('isAccountant', String(Boolean(isAccountant)))

    const response = await fetch(`/api/mappings/history?${params.toString()}`)
    if (!response.ok) {
      return []
    }

    const payload = await response.json()
    return Array.isArray(payload?.records) ? payload.records : []
  } catch {
    return []
  }
}

export function createMappingSequence({ confirmMapping, onPromptGenerated }) {
  return {
    async invoke(input) {
      const wildApricotInvoiceData = await (async () => {
        input.onStep?.(1, 'running', 'Reading your organization file...')
        const value = await resolveJsonInput(input.sourceInput)
        input.onStep?.(1, 'completed', 'Your organization file is ready.')
        return value
      })()

      const quickBooksAccountsAndClassData = await (async () => {
        input.onStep?.(2, 'running', 'Reading your QuickBooks file...')
        const value = await resolveJsonInput(input.targetInput)
        input.onStep?.(2, 'completed', 'Your QuickBooks file is ready.')
        return value
      })()

      const wildApricotItems = extractWildApricotItemsFromInvoices(wildApricotInvoiceData)
      const { quickBooksProducts, quickBooksClasses } =
        extractQuickBooksPromptData(quickBooksAccountsAndClassData)

      const priorMappings = await fetchMappingHistory({
        accountId: input.accountId,
        isAccountant: input.isAccountant,
      })
     
        const generatedPrompt = buildGeneratedPrompt({
        wildApricotItems,
        quickBooksProducts,
        quickBooksClasses,
        priorMappings,
        isAccountant: input.isAccountant,
      })

      onPromptGenerated?.(generatedPrompt)

      input.onStep?.(3, 'running', 'Finding the best matches...')
      const mappingResult = await callMistralForMapping({
        wildApricotItems,
        quickBooksProducts,
        quickBooksClasses,
        isAccountant: input.isAccountant,
        prompt: generatedPrompt,
        model: input.mistralModel,
        priorMappings,
      })
      input.onStep?.(3, 'completed', 'Suggested matches are ready.')

      input.onStep?.(4, 'running', 'Waiting for your review...')
      const confirmedMapping = await confirmMapping(
        mappingResult,
        quickBooksAccountsAndClassData,
        wildApricotInvoiceData,
      )

      if (!confirmedMapping) {
        input.onStep?.(4, 'cancelled', 'Review was cancelled.')
        throw new Error('Setup was cancelled before saving.')
      }

      input.onStep?.(4, 'completed', 'Your choices are confirmed.')

      input.onStep?.(5, 'running', 'Preparing your download...')
      const mappingRecord = {
        createdAt: new Date().toISOString(),
        accountId: input.accountId ?? null,
        isAccountant: Boolean(input.isAccountant),
        prompt: generatedPrompt,
        sourceData: wildApricotInvoiceData,
        targetData: quickBooksAccountsAndClassData,
        mapping: confirmedMapping,
      }
      let persisted

      try {
        persisted = await writeMappingToMongoEndpoint({
          endpoint: input.mongoEndpoint,
          apiKey: input.mongoApiKey,
          record: mappingRecord,
        })
      } catch (error) {
        persisted = { ok: false, skipped: true, message: error.message }
      }
      input.onStep?.(5, 'completed', 'Your setup file is ready.')

      return {
        ...input,
        sourceData: wildApricotInvoiceData,
        targetData: quickBooksAccountsAndClassData,
        wildApricotInvoiceData,
        quickBooksAccountsAndClassData,
        isAccountant: Boolean(input.isAccountant),
        prompt: generatedPrompt,
        mappingResult,
        persisted,
      }
    },
  }
}
