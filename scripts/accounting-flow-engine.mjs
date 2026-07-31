function number(value) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) throw new Error(`Giá trị số không hợp lệ: ${value}`)
  return parsed
}

function monthKeys(from, to) {
  const [fromYear, fromMonth] = from.slice(0, 7).split('-').map(Number)
  const [toYear, toMonth] = to.slice(0, 7).split('-').map(Number)
  const result = []
  let year = fromYear
  let month = fromMonth
  while (year < toYear || (year === toYear && month <= toMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      year += 1
      month = 1
    }
  }
  return result
}

function inventoryRow(product, opening, movement, closing) {
  const qtyIn = movement.qtyIn
  const valueIn = movement.valueIn
  const qtyOut = movement.qtyOut
  const valueOut = movement.valueOut
  return {
    productId: product.productId,
    code: product.code,
    name: product.name,
    unit: product.unit || null,
    qtyOpen: opening.qty,
    valueOpen: opening.value,
    qtyInPrimary: qtyIn,
    valueInPrimary: valueIn,
    qtyInOther: 0,
    valueInOther: 0,
    qtyIn,
    valueIn,
    qtyOutPrimary: qtyOut,
    valueOutPrimary: valueOut,
    qtyOutOther: 0,
    valueOutOther: 0,
    qtyOut,
    valueOut,
    qtyClose: closing.qty,
    valueClose: closing.value,
    avgCost: closing.qty ? closing.value / closing.qty : 0,
    accountCode: product.accountCode || null,
  }
}

function cloneState(state) {
  return new Map(
    [...state].map(([code, value]) => [code, { qty: value.qty, value: value.value }]),
  )
}

function emptyMovement() {
  return { qtyIn: 0, valueIn: 0, qtyOut: 0, valueOut: 0 }
}

/**
 * Builds NXT from opening inventory and journal documents.
 * Receipt documents are always applied before issue documents on the same date.
 */
export function deriveMovingAverageInventory({
  periodFrom,
  periodTo,
  openings,
  receipts,
  issues,
}) {
  const products = new Map()
  const state = new Map()
  for (const row of openings) {
    const code = String(row.code ?? '')
    if (!code) throw new Error('Tồn đầu kỳ có mã hàng trống')
    if (products.has(code)) throw new Error(`Mã hàng nguồn bị trùng: ${code}`)
    products.set(code, {
      productId: String(row.productId ?? ''),
      code,
      name: String(row.name ?? ''),
      unit: row.unit ?? null,
      accountCode: row.accountCode ?? null,
    })
    state.set(code, { qty: number(row.qtyOpen), value: number(row.valueOpen) })
  }

  const events = []
  let sequence = 0
  for (const document of receipts) {
    for (const item of document.items ?? []) {
      events.push({
        date: String(document.date),
        priority: 0,
        sequence: sequence++,
        kind: 'receipt',
        documentId: document.id,
        item,
      })
    }
  }
  for (const document of issues) {
    for (const item of document.items ?? []) {
      events.push({
        date: String(document.date),
        priority: 1,
        sequence: sequence++,
        kind: 'issue',
        documentId: document.id,
        item,
      })
    }
  }
  events.sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.priority - right.priority
    || left.sequence - right.sequence)

  for (const event of events) {
    const code = String(event.item.productCode ?? '')
    if (!products.has(code)) {
      throw new Error(`Mã hàng "${code || '(trống)'}" không có trong file Quyên; không được tự tạo`)
    }
    if (event.date < periodFrom || event.date > periodTo) {
      throw new Error(`Chứng từ ${event.documentId} nằm ngoài kỳ ${periodFrom} - ${periodTo}`)
    }
  }

  const periodOpening = cloneState(state)
  const periodMovement = new Map([...products.keys()].map((code) => [code, emptyMovement()]))
  const byMonth = {}

  for (const period of monthKeys(periodFrom, periodTo)) {
    const opening = cloneState(state)
    const movement = new Map([...products.keys()].map((code) => [code, emptyMovement()]))
    const monthEvents = events.filter((event) => event.date.slice(0, 7) === period)

    for (const event of monthEvents) {
      const code = String(event.item.productCode)
      const balance = state.get(code)
      const monthly = movement.get(code)
      const total = periodMovement.get(code)
      const qty = number(event.item.qty)
      if (qty <= 0) throw new Error(`Số lượng mã ${code} phải lớn hơn 0`)

      if (event.kind === 'receipt') {
        const value = number(event.item.lineTotal)
        balance.qty += qty
        balance.value += value
        monthly.qtyIn += qty
        monthly.valueIn += value
        total.qtyIn += qty
        total.valueIn += value
      } else {
        if (balance.qty + 0.0000001 < qty) {
          throw new Error(`Xuất âm kho mã ${code} tại chứng từ ${event.documentId}`)
        }
        const averageCost = balance.qty ? balance.value / balance.qty : 0
        const value = averageCost * qty
        balance.qty -= qty
        balance.value -= value
        if (Math.abs(balance.qty) <= 0.0000001) {
          balance.qty = 0
          balance.value = 0
        }
        monthly.qtyOut += qty
        monthly.valueOut += value
        total.qtyOut += qty
        total.valueOut += value
      }
    }

    byMonth[period] = [...products].map(([code, product]) =>
      inventoryRow(product, opening.get(code), movement.get(code), state.get(code)))
  }

  const summary = [...products].map(([code, product]) =>
    inventoryRow(product, periodOpening.get(code), periodMovement.get(code), state.get(code)))

  return { summary, byMonth }
}

function debtResult(opening, periodDebit, periodCredit) {
  const net = number(opening.openingDebit) - number(opening.openingCredit)
    + periodDebit - periodCredit
  return {
    ...opening,
    periodDebit,
    periodCredit,
    closingDebit: net > 0 ? net : 0,
    closingCredit: net < 0 ? -net : 0,
  }
}

function sourceDebtMap(openings, label) {
  const result = new Map()
  for (const opening of openings) {
    const code = String(opening.partyCode ?? '')
    if (!code) throw new Error(`${label} đầu kỳ có mã công nợ trống`)
    if (result.has(code)) throw new Error(`Mã công nợ nguồn bị trùng: ${code}`)
    result.set(code, opening)
  }
  return result
}

function requireSourceCode(document, sourceMap, label) {
  if (!document.affectsDebt) return null
  const code = String(document.partyCode ?? '')
  if (!code || !sourceMap.has(code)) {
    throw new Error(`${label} dùng mã "${code || '(trống)'}" không có trong file Quyên; không được tự tạo`)
  }
  return code
}

/**
 * Builds AR/AP from openings, invoice listings and explicit bank/cash documents.
 * No residual or balancing entry is created.
 */
export function deriveTradeDebts({
  receivableOpenings,
  payableOpenings,
  salesInvoices,
  purchaseInvoices,
  moneyTransactions,
}) {
  const arSources = sourceDebtMap(receivableOpenings, 'Phải thu')
  const apSources = sourceDebtMap(payableOpenings, 'Phải trả')
  const arMovement = new Map([...arSources.keys()].map((code) => [code, { debit: 0, credit: 0 }]))
  const apMovement = new Map([...apSources.keys()].map((code) => [code, { debit: 0, credit: 0 }]))

  for (const invoice of salesInvoices) {
    const code = requireSourceCode(invoice, arSources, 'Hóa đơn bán')
    if (code) arMovement.get(code).debit += number(invoice.amount)
  }
  for (const invoice of purchaseInvoices) {
    const code = requireSourceCode(invoice, apSources, 'Hóa đơn mua')
    if (code) apMovement.get(code).credit += number(invoice.amount)
  }
  for (const transaction of moneyTransactions) {
    const isReceipt = transaction.direction === 'thu'
    const sourceMap = isReceipt ? arSources : apSources
    const code = requireSourceCode(transaction, sourceMap, isReceipt ? 'Phiếu thu' : 'Phiếu chi')
    if (!code) continue
    if (isReceipt) arMovement.get(code).credit += number(transaction.amount)
    else apMovement.get(code).debit += number(transaction.amount)
  }

  return {
    receivables: [...arSources].map(([code, opening]) => {
      const movement = arMovement.get(code)
      return debtResult(opening, movement.debit, movement.credit)
    }),
    payables: [...apSources].map(([code, opening]) => {
      const movement = apMovement.get(code)
      return debtResult(opening, movement.debit, movement.credit)
    }),
  }
}
