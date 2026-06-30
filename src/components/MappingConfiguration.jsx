import { useEffect, useState } from 'react'
import { createMappingSequence } from '../services/mappingSequence'
import './MappingConfiguration.css'

const defaultStatuses = [
  { id: 1, title: 'Load WildApricot Invoice JSON', status: 'idle', message: '' },
  { id: 2, title: 'Load QuickBooks Accounts and Class JSON', status: 'idle', message: '' },
  { id: 3, title: 'Generate Mapping (Mistral)', status: 'idle', message: '' },
  { id: 4, title: 'User Confirmation', status: 'idle', message: '' },
  { id: 5, title: 'Store Mapping in MongoDB', status: 'idle', message: '' },
]

function MappingConfiguration() {
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [sourceMode, setSourceMode] = useState('file')
  const [targetMode, setTargetMode] = useState('file')
  const [sourceFile, setSourceFile] = useState(null)
  const [targetFile, setTargetFile] = useState(null)
  const [sourceEndpoint, setSourceEndpoint] = useState('')
  const [targetEndpoint, setTargetEndpoint] = useState('')
  const [isAccountant, setIsAccountant] = useState(false)
  const mistralModel = 'mistral-large-latest'
  const mongoEndpoint = '/api/mappings'
  const mongoApiKey = import.meta.env.VITE_MONGO_API_KEY ?? ''

  const [steps, setSteps] = useState(defaultStatuses)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [qbDataForConfirmation, setQbDataForConfirmation] = useState(null)
  const [editableRows, setEditableRows] = useState([])
  const [mistralReturnedArray, setMistralReturnedArray] = useState('')
  const [promptPreview, setPromptPreview] = useState('')
  const [persistedResponse, setPersistedResponse] = useState('')
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [confirmationResolver, setConfirmationResolver] = useState(null)
  const [customProducts, setCustomProducts] = useState([])
  const [customClasses, setCustomClasses] = useState([])

  const applyAccountEndpoints = (account) => {
    if (!account) {
      return
    }

    if (account.sourceEndpoint) {
      setSourceMode('endpoint')
      setSourceFile(null)
      setSourceEndpoint(account.sourceEndpoint)
    }

    if (account.targetEndpoint) {
      setTargetMode('endpoint')
      setTargetFile(null)
      setTargetEndpoint(account.targetEndpoint)
    }
  }

  const handleAccountChange = (accountIdValue) => {
    setSelectedAccountId(accountIdValue)
    const account = accounts.find(
      (item) => String(item.accountId) === String(accountIdValue),
    )
    applyAccountEndpoints(account)
  }

  useEffect(() => {
    let isMounted = true

    const loadAccounts = async () => {
      try {
        const response = await fetch('/dev-api/test-accounts')
        if (!response.ok) {
          throw new Error(`Failed to load account folders (${response.status}).`)
        }

        const payload = await response.json()
        const accountList = Array.isArray(payload?.accounts) ? payload.accounts : []

        if (!isMounted) {
          return
        }

        setAccounts(accountList)
        setAccountsError('')
        const defaultAccountId =
          accountList.length > 0 ? String(accountList[0].accountId) : ''
        setSelectedAccountId(defaultAccountId)
        const defaultAccount = accountList.find(
          (account) => String(account.accountId) === String(defaultAccountId),
        )
        applyAccountEndpoints(defaultAccount)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setAccounts([])
        setAccountsError(loadError.message)
      }
    }

    loadAccounts()

    return () => {
      isMounted = false
    }
  }, [])

  const updateStep = (stepId, status, message) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, status, message } : step)),
    )
  }

  const selectedAccount = accounts.find(
    (account) => String(account.accountId) === String(selectedAccountId),
  )

  const resetRunState = () => {
    setSteps(defaultStatuses)
    setPendingConfirmation(null)
    setQbDataForConfirmation(null)
    setEditableRows([])
    setCustomProducts([])
    setCustomClasses([])
    setMistralReturnedArray('')
    setPromptPreview('')
    setConfirmationResolver(null)
    setPersistedResponse('')
    setError('')
  }

  const resolveUserConfirmation = (approved) => {
    if (confirmationResolver) {
      const resolver = confirmationResolver
      setConfirmationResolver(null)
      setPendingConfirmation(null)
      setQbDataForConfirmation(null)
      resolver(approved ? editableRows : null)
    }
  }

  const updateEditableRow = (index, field, value, label) => {
    setEditableRows((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, [field]: value, [`${field}Name`]: label } : row,
      ),
    )
  }

  const collectRecordsByKey = (source, keyMatcher) => {
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
        if (Array.isArray(value) && keyMatcher(key)) {
          value.forEach((item) => {
            if (item && typeof item === 'object') {
              records.push(item)
            }
          })
        }
        walk(value)
      })
    }

    walk(source)

    const deduped = new Map()
    records.forEach((record) => {
      const id = String(record.Id ?? record.id ?? '').trim()
      const name = String(record.Name ?? record.name ?? '').trim()
      const key = `${id}::${name}`
      if (!deduped.has(key)) {
        deduped.set(key, record)
      }
    })

    return Array.from(deduped.values())
  }

  const getQuickBooksClasses = (source) =>
    collectRecordsByKey(source, (key) => {
      const normalized = key.trim().toLowerCase()
      return normalized === 'class' || normalized === 'classes'
    })

  const getQuickBooksProducts = (source) =>
    collectRecordsByKey(source, (key) => {
      const normalized = key.trim().toLowerCase()
      return normalized === 'item' || normalized === 'items'
    })

  const normalizeLookup = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

  const getClassOptionValue = (qbClass) =>
    String(qbClass.Id ?? qbClass.id ?? qbClass.Name ?? qbClass.name ?? '')

  const getClassOptionName = (qbClass) => String(qbClass.Name ?? qbClass.name ?? '')
  const getProductOptionValue = (qbProduct) =>
    String(qbProduct.Id ?? qbProduct.id ?? qbProduct.Name ?? qbProduct.name ?? '')

  const getProductOptionName = (qbProduct) => String(qbProduct.Name ?? qbProduct.name ?? '')

  const getProductOptionLabel = (qbProduct) => {
    const productName = getProductOptionName(qbProduct)
    const productId = String(qbProduct.Id ?? qbProduct.id ?? '').trim()
    return productId ? `${productName} (${productId})` : productName
  }

  const getProductClassificationValue = (qbProduct) =>
    qbProduct?.Classification ??
    qbProduct?.classification ??
    qbProduct?.Class?.Name ??
    qbProduct?.Class?.name ??
    qbProduct?.ClassRef?.name ??
    ''

  const createCustomEntryId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const addCustomProduct = (rowIndex) => {
    const productName = window.prompt('Enter a custom QuickBooks product name')
    const trimmedProductName = String(productName ?? '').trim()

    if (!trimmedProductName) {
      return
    }

    const customProductId = createCustomEntryId('custom-product')

    setCustomProducts((current) => [
      ...current.filter((product) => normalizeLookup(getProductOptionName(product)) !== normalizeLookup(trimmedProductName)),
      {
        Id: customProductId,
        Name: trimmedProductName,
        Classification: '',
      },
    ])

    setEditableRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              qbProductId: customProductId,
              qbProductName: trimmedProductName,
            }
          : row,
      ),
    )
  }

  const addCustomClass = (rowIndex) => {
    const className = window.prompt('Enter a custom QuickBooks class name')
    const trimmedClassName = String(className ?? '').trim()

    if (!trimmedClassName) {
      return
    }

    const customClassId = createCustomEntryId('custom-class')

    setCustomClasses((current) => [
      ...current.filter((qbClass) => normalizeLookup(getClassOptionName(qbClass)) !== normalizeLookup(trimmedClassName)),
      {
        Id: customClassId,
        Name: trimmedClassName,
        Active: true,
      },
    ])

    setEditableRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              qbClassId: customClassId,
              qbClassName: trimmedClassName,
            }
          : row,
      ),
    )
  }

  const resolveQuickBooksClassSelection = (qbClasses, classValue) => {
    const normalizedClassValue = normalizeLookup(classValue)

    if (!normalizedClassValue) {
      return { qbClassId: '', qbClassName: '' }
    }

    const matchedClass = qbClasses.find((qbClass) => {
      const classId = normalizeLookup(qbClass.Id ?? qbClass.id)
      const className = normalizeLookup(qbClass.Name ?? qbClass.name)
      return classId === normalizedClassValue || className === normalizedClassValue
    })

    if (matchedClass) {
      return {
        qbClassId: getClassOptionValue(matchedClass),
        qbClassName: getClassOptionName(matchedClass) || String(classValue),
      }
    }

    return {
      qbClassId: '',
      qbClassName: String(classValue),
    }
  }

  const resolveQuickBooksProductSelection = (qbProducts, productValue, productIdValue) => {
    const normalizedProductValue = String(productValue ?? '').trim().toLowerCase()
    const normalizedProductIdValue = String(productIdValue ?? '').trim().toLowerCase()

    if (!normalizedProductValue && !normalizedProductIdValue) {
      return { qbProductId: '', qbProductName: '' }
    }

    const matchedProduct = qbProducts.find((qbProduct) => {
      const productId = String(qbProduct.Id ?? qbProduct.id ?? '').trim().toLowerCase()
      const productName = String(qbProduct.Name ?? qbProduct.name ?? '').trim().toLowerCase()
      return (
        (normalizedProductIdValue && productId === normalizedProductIdValue) ||
        (normalizedProductValue && productId === normalizedProductValue) ||
        (normalizedProductValue && productName === normalizedProductValue)
      )
    })

    if (matchedProduct) {
      return {
        qbProductId: String(matchedProduct.Id ?? matchedProduct.id ?? ''),
        qbProductName: String(matchedProduct.Name ?? matchedProduct.name ?? productValue),
      }
    }

    return {
      qbProductId: '',
      qbProductName: String(productValue),
    }
  }

  const handleRunSequence = async () => {
    setIsRunning(true)
    resetRunState()

    try {
      const mappingSequence = createMappingSequence({
        onPromptGenerated: (promptText) => {
          setPromptPreview(promptText)
        },
        confirmMapping: async (mappingResult, qbData) => {
          const qbProducts = getQuickBooksProducts(qbData)
          const qbClasses = getQuickBooksClasses(qbData)

          const rawRows = Array.isArray(mappingResult.parsed)
            ? mappingResult.parsed
            : (mappingResult.parsed?.mappings ?? [])

          setMistralReturnedArray(JSON.stringify(rawRows, null, 2))

          const initialRows = rawRows.map((row) => ({
            waFieldName: row.WAFieldName ?? '',
            ...resolveQuickBooksProductSelection(
              qbProducts,
              row.QBProduct ?? row.accountName ?? row.Account ?? '',
              row.QBProductId ?? row.accountId ?? '',
            ),
            ...resolveQuickBooksClassSelection(
              qbClasses,
              row.QBClassification ?? row.QBClass ?? row.classification ?? row.Classification ?? '',
            ),
          }))
          setPendingConfirmation(mappingResult)
          setQbDataForConfirmation(qbData)
          setEditableRows(initialRows)
          return new Promise((resolve) => {
            setConfirmationResolver(() => resolve)
          })
        },
      })

      const result = await mappingSequence.invoke({
        accountId: selectedAccountId ? Number(selectedAccountId) : null,
        sourceInput:
          sourceMode === 'file'
            ? { mode: 'file', file: sourceFile }
            : { mode: 'endpoint', endpoint: sourceEndpoint },
        targetInput:
          targetMode === 'file'
            ? { mode: 'file', file: targetFile }
            : { mode: 'endpoint', endpoint: targetEndpoint },
        mappingEntityName: 'membership level',
        isAccountant,
        mistralModel,
        mongoEndpoint,
        mongoApiKey,
        onStep: updateStep,
      })

      if (result.persisted) {
        setPersistedResponse(JSON.stringify(result.persisted, null, 2))
      }
    } catch (sequenceError) {
      setError(sequenceError.message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section className="mapping-configuration" aria-label="Mapping Configuration">
      <header className="mapping-header">
        <h1>Mapping Configuration</h1>
        <p>Run a 5-step workflow for WildApricot Invoice and QuickBooks Accounts and Class mapping, confirmation, and persistence.</p>
      </header>

      <div className="panel account-panel">
        <h2>Customer</h2>
        <label>
          <select
            value={selectedAccountId}
            onChange={(event) => handleAccountChange(event.target.value)}
          >
            {accounts.length === 0 ? (
              <option value="">No account folders found</option>
            ) : (
              accounts.map((account) => (
                <option key={account.accountId} value={String(account.accountId)}>
                  {account.name}
                </option>
              ))
            )}
          </select>
        </label>
        {accountsError && <p className="account-helper error">{accountsError}</p>}
        {!accountsError && accounts.length > 0 && (
          <p className="account-helper">
            Selected account id <strong>{selectedAccountId}</strong> will be stored in MongoDB.
          </p>
        )}
        {!accountsError && selectedAccount?.sourceEndpoint && selectedAccount?.targetEndpoint && (
          <p className="account-helper">
            Step 1 and Step 2 are auto-filled from this account folder using endpoint mode.
          </p>
        )}
      </div>

      <div className="input-grid">
        <div className="panel">
          <h2>Step 1: WildApricot Invoice</h2>
          <label>
            Input Mode
            <select value={sourceMode} onChange={(event) => setSourceMode(event.target.value)}>
              <option value="file">Upload JSON file</option>
              <option value="endpoint">Fetch from endpoint</option>
            </select>
          </label>
          {sourceMode === 'file' ? (
            <label>
              WildApricot Invoice File
              <input type="file" accept="application/json" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <label>
              WildApricot Invoice Endpoint
              <input
                type="url"
                placeholder="https://example.com/wildapricot-invoices.json"
                value={sourceEndpoint}
                onChange={(event) => setSourceEndpoint(event.target.value)}
              />
            </label>
          )}
        </div>

        <div className="panel">
          <h2>Step 2: QuickBooks Accounts and Class</h2>
          <label>
            Input Mode
            <select value={targetMode} onChange={(event) => setTargetMode(event.target.value)}>
              <option value="file">Upload JSON file</option>
              <option value="endpoint">Fetch from endpoint</option>
            </select>
          </label>
          {targetMode === 'file' ? (
            <label>
              QuickBooks Accounts and Class File
              <input type="file" accept="application/json" onChange={(event) => setTargetFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <label>
              QuickBooks Accounts and Class Endpoint
              <input
                type="url"
                placeholder="https://example.com/quickbooks-accounts-classes.json"
                value={targetEndpoint}
                onChange={(event) => setTargetEndpoint(event.target.value)}
              />
            </label>
          )}
        </div>

      </div>

      <section className="accountant-toggle-panel" aria-label="Accountant Toggle">
        <label className="accountant-toggle-label">
          <span>Accountant</span>
          <span className="accountant-info" tabIndex={0} aria-label="Accountant toggle description">
            i
            <span className="accountant-info-popup" role="tooltip">
              This will disable augmentation in the mapping process if enabled
            </span>
          </span>
          <span className="accountant-switch">
            <input
              className="accountant-toggle-input"
              type="checkbox"
              checked={isAccountant}
              onChange={(event) => setIsAccountant(event.target.checked)}
            />
            <span className="accountant-toggle-slider" aria-hidden="true" />
          </span>
        </label>
      </section>

      <div className="mapping-actions">
        <button type="button" onClick={handleRunSequence} disabled={isRunning}>
          {isRunning ? 'Running Sequence...' : 'Run 5-Step Sequence'}
        </button>
      </div>

      <section className="step-status" aria-label="Workflow Step Status">
        <h2>Workflow Progress</h2>
        <ul>
          {steps.map((step) => (
            <li key={step.id} className={`status-${step.status}`}>
              <strong>{`Step ${step.id}: ${step.title}`}</strong>
              <span>{step.message || 'Waiting...'}</span>
            </li>
          ))}
        </ul>
      </section>

      {promptPreview && (
        <section className="prompt-panel" aria-label="Prompt Preview Before Mistral">
          <h2>Prompt Sent to Mistral</h2>
          <p>Preview of the exact prompt generated from uploaded data before the Mistral request.</p>
          <pre>{promptPreview}</pre>
        </section>
      )}

      {mistralReturnedArray && (
        <section className="mistral-panel" aria-label="Mistral Returned Array">
          <h2>Mistral Returned Array</h2>
          <p>Parsed mapping rows returned by Mistral before manual confirmation.</p>
          <pre>{mistralReturnedArray}</pre>
        </section>
      )}

      {pendingConfirmation && (() => {
        const qbProducts = [...getQuickBooksProducts(qbDataForConfirmation), ...customProducts]
        const qbClasses = [...getQuickBooksClasses(qbDataForConfirmation), ...customClasses]
        return (
          <section className="confirmation-panel" aria-label="Step 4 User Confirmation">
            <h2>Step 4: Confirm Mapping</h2>
            <p>Review and adjust each WildApricot item mapping to a QuickBooks Product and Class, then confirm or cancel.</p>
            <div className="mapping-table-wrapper">
              <table className="mapping-table">
                <thead>
                  <tr>
                    <th>WildApricot Order Type</th>
                    <th>QuickBooks Account</th>
                    <th>QuickBooks Class</th>
                  </tr>
                </thead>
                <tbody>
                  {editableRows.length === 0 ? (
                    <tr><td colSpan={3} className="mapping-table-empty">No mapping rows returned by Mistral.</td></tr>
                  ) : (
                    editableRows.map((row, index) => (
                      <tr key={index}>
                        <td className="mapping-table-wa">{row.waFieldName || '—'}</td>
                        <td>
                          <div className="mapping-table-control">
                            <select
                              value={row.qbProductId || row.qbProductName}
                              onChange={(e) => {
                                const selected = qbProducts.find(
                                  (product) => getProductOptionValue(product) === e.target.value,
                                )
                                const classSelection = resolveQuickBooksClassSelection(
                                  qbClasses,
                                  getProductClassificationValue(selected),
                                )

                                setEditableRows((rows) =>
                                  rows.map((currentRow, currentIndex) =>
                                    currentIndex === index
                                      ? {
                                          ...currentRow,
                                          qbProductId: e.target.value,
                                          qbProductName: getProductOptionName(selected) || '',
                                          qbClassId: classSelection.qbClassId,
                                          qbClassName: classSelection.qbClassName,
                                        }
                                      : currentRow,
                                  ),
                                )
                              }}
                            >
                              <option value="">— Select Product —</option>
                              {row.qbProductName &&
                                !qbProducts.some((product) => {
                                  const optionValue = getProductOptionValue(product)
                                  const optionName = getProductOptionName(product)
                                  return (
                                    normalizeLookup(optionValue) === normalizeLookup(row.qbProductName) ||
                                    normalizeLookup(optionName) === normalizeLookup(row.qbProductName)
                                  )
                                }) && (
                                  <option value={row.qbProductName}>{row.qbProductName}</option>
                                )}
                              {qbProducts.map((product) => (
                                <option key={getProductOptionValue(product)} value={getProductOptionValue(product)}>
                                  {getProductOptionLabel(product)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="mapping-table-plus"
                              aria-label="Add custom QuickBooks product"
                              title="Add custom QuickBooks product"
                              onClick={() => addCustomProduct(index)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="mapping-table-control">
                            <select
                              value={row.qbClassId || row.qbClassName}
                              onChange={(e) => {
                                const selected = qbClasses.find((c) => getClassOptionValue(c) === e.target.value)
                                updateEditableRow(
                                  index,
                                  'qbClassId',
                                  e.target.value,
                                  selected?.Name ?? e.target.value,
                                )
                              }}
                            >
                              <option value="">— Select Class —</option>
                              {row.qbClassName &&
                                !qbClasses.some((cls) => {
                                  const optionValue = getClassOptionValue(cls)
                                  const optionName = getClassOptionName(cls)
                                  return (
                                    normalizeLookup(optionValue) === normalizeLookup(row.qbClassName) ||
                                    normalizeLookup(optionName) === normalizeLookup(row.qbClassName)
                                  )
                                }) && (
                                  <option value={row.qbClassName}>{row.qbClassName}</option>
                                )}
                              {qbClasses.map((cls) => (
                                <option key={getClassOptionValue(cls)} value={getClassOptionValue(cls)}>
                                  {getClassOptionName(cls)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="mapping-table-plus"
                              aria-label="Add custom QuickBooks class"
                              title="Add custom QuickBooks class"
                              onClick={() => addCustomClass(index)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="confirmation-actions">
              <button type="button" onClick={() => resolveUserConfirmation(true)}>
                Confirm Mapping
              </button>
              <button type="button" className="secondary" onClick={() => resolveUserConfirmation(false)}>
                Cancel Mapping
              </button>
            </div>
          </section>
        )
      })()}

      {persistedResponse && (
        <section className="result-panel" aria-label="Persisted Mapping Result">
          <h2>Persistence Result</h2>
          <pre>{persistedResponse}</pre>
        </section>
      )}

      {error && (
        <section className="error-panel" aria-label="Workflow Error">
          <h2>Sequence Error</h2>
          <p>{error}</p>
        </section>
      )}
    </section>
  )
}

export default MappingConfiguration
