const outputFields = [
  'Customer',
  'InvoiceNumber',
  'InvoiceDate',
  'DueDate',
  'ProductService',
  'Description',
  'Quantity',
  'Rate',
  'Amount',
  'Tax',
  'Status',
]

function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function dateOnly(value) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, 10) : ''
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

function customerName(invoice) {
  const firstName = String(invoice.member?.firstName ?? invoice.customer?.firstName ?? '').trim()
  const lastName = String(invoice.member?.lastName ?? invoice.customer?.lastName ?? '').trim()
  const combinedName = `${firstName} ${lastName}`.trim()

  return combinedName
    || String(invoice.member?.name ?? invoice.customer?.name ?? invoice.Contact?.Name ?? invoice.contact?.name ?? '').trim()
}

function invoiceCategory(invoice) {
  return String(
    invoice.category
    ?? invoice.Category
    ?? invoice.orderType
    ?? invoice.OrderType
    ?? '',
  ).trim()
}

function invoiceRecords(sourceData) {
  if (Array.isArray(sourceData)) return sourceData
  if (!sourceData || typeof sourceData !== 'object') return []

  const direct = sourceData.invoices ?? sourceData.Invoices ?? sourceData.invoice ?? sourceData.Invoice
  return Array.isArray(direct) ? direct : []
}

function mappingLookup(mappingRows) {
  const lookup = new Map()

  mappingRows.forEach((row) => {
    const sourceName = row.waFieldName ?? row.WAFieldName ?? row.OrganizationItem ?? ''
    const productName = row.qbProductName ?? row.QBProduct ?? row.QuickBooksItem ?? ''
    const key = normalizeKey(sourceName)
    if (key && productName) lookup.set(key, String(productName).trim())
  })

  return lookup
}

function invoiceItems(invoice) {
  const items = invoice.items ?? invoice.Items ?? invoice.lineItems ?? invoice.LineItems
  if (Array.isArray(items) && items.length > 0) return items

  const value = numberOrZero(
    invoice.Value
    ?? invoice.value
    ?? invoice.grandTotal
    ?? invoice.GrandTotal
    ?? invoice.total
    ?? invoice.Total,
  )

  return [{
    description: invoice.description ?? invoice.Description ?? invoice.Memo ?? invoice.PublicMemo ?? '',
    quantity: 1,
    unitPrice: value,
    tax: invoice.tax ?? invoice.Tax ?? 0,
    total: value,
  }]
}

export function buildQuickBooksInvoiceRows(sourceData, mappingRows = []) {
  const invoices = invoiceRecords(sourceData)
  const mappings = mappingLookup(mappingRows)

  return invoices.flatMap((invoice) => {
    const category = invoiceCategory(invoice)
    const productService = mappings.get(normalizeKey(category)) || category
    const items = invoiceItems(invoice)

    return items.map((item) => {
      const quantity = numberOrZero(item.quantity ?? item.Quantity ?? 1) || 1
      const rate = numberOrZero(item.unitPrice ?? item.UnitPrice ?? item.rate ?? item.Rate)
      const tax = numberOrZero(item.tax ?? item.Tax)
      const calculatedAmount = (quantity * rate) + tax
      const amount = numberOrZero(
        item.total
        ?? item.Total
        ?? item.amount
        ?? item.Amount
        ?? (items.length === 1 ? invoice.grandTotal ?? invoice.GrandTotal : undefined)
        ?? calculatedAmount,
      )

      return {
        Customer: customerName(invoice),
        InvoiceNumber: String(
          invoice.invoiceId
          ?? invoice.InvoiceId
          ?? invoice.DocumentNumber
          ?? invoice.documentNumber
          ?? invoice.Id
          ?? invoice.id
          ?? '',
        ),
        InvoiceDate: dateOnly(invoice.invoiceDate ?? invoice.InvoiceDate ?? invoice.DocumentDate),
        DueDate: dateOnly(invoice.dueDate ?? invoice.DueDate),
        ProductService: productService,
        Description: String(
          item.description
          ?? item.Description
          ?? invoice.notes
          ?? invoice.Notes
          ?? invoice.Memo
          ?? category,
        ).trim(),
        Quantity: quantity,
        Rate: rate,
        Amount: amount,
        Tax: tax,
        Status: String(
          invoice.status
          ?? invoice.Status
          ?? (invoice.IsPaid === true ? 'Paid' : invoice.IsPaid === false ? 'Pending' : ''),
        ).trim(),
      }
    })
  })
}

export function hasQuickBooksInvoiceShape(row) {
  return outputFields.every((field) => Object.hasOwn(row ?? {}, field))
}
