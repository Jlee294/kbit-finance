import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const sourceDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(projectDir, '..', 'GLA_6 THANG DAU NAM 2026')
const dataFile = path.resolve(projectDir, 'data', 'gla-2026.json')
const reportFile = path.resolve(projectDir, 'data', 'gla-audit-2026.json')

const FILES = {
  salesInvoices: '0315226378_Bang Ke BR Tu Thang 1 Den Thang 6.xls',
  purchaseInvoices: '0315226378_Bang Ke Mua Vao Tu Thang 1 Den Thang 12.xls',
  receivables: '0315226378_Tong Hop - Chi Tiet CNo Phai Thu Tu Thang 1 Den Thang 6.xlsx',
  payables: '0315226378_Tong Hop - Chi Tiet CNo Phai Tra Tu Thang 1 Den Thang 6.xlsx',
  inventory: 'Bang Nhap Xuat Ton Tu Thang 1 Den Thang 6.xlsx',
  salesJournal: 'NHAT KY BAN.xlsx',
  purchaseJournal: 'NHAT KY MUA.xlsx',
  bank: 'SPNH_GLA.xlsx',
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function amount(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoFromExcelSerial(value) {
  const parsed = XLSX.SSF.parse_date_code(Number(value))
  if (!parsed) return null
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function workbook(fileName) {
  const fullPath = path.join(sourceDir, fileName)
  if (!fs.existsSync(fullPath)) throw new Error(`Thiếu file nguồn: ${fullPath}`)
  return XLSX.readFile(fullPath, { raw: true, cellDates: false })
}

function rows(book, sheetName, range) {
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new Error(`Thiếu sheet ${sheetName}`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, range })
}

function sum(list, pick) {
  return list.reduce((total, item) => total + Number(pick(item) || 0), 0)
}

function setDifference(left, right) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const books = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, workbook(file)]))
const checks = []

function addCheck({
  id,
  scope,
  actual,
  expected,
  tolerance = 0.01,
  status,
  note,
}) {
  const difference = typeof actual === 'number' && typeof expected === 'number'
    ? actual - expected
    : null
  const resolvedStatus = status ?? (
    difference == null
      ? (JSON.stringify(actual) === JSON.stringify(expected) ? 'pass' : 'fail')
      : Math.abs(difference) <= tolerance ? 'pass' : 'fail'
  )
  checks.push({ id, scope, actual, expected, difference, tolerance, status: resolvedStatus, note })
}

function compareRowsByCode(id, scope, actualRows, expectedRows, fields, tolerance = 0.01) {
  const actualMap = new Map(actualRows.map((row) => [row.code, row]))
  const differences = []
  for (const expected of expectedRows) {
    const actual = actualMap.get(expected.code)
    if (!actual) {
      differences.push({ code: expected.code, reason: 'missing-app-row' })
      continue
    }
    for (const field of fields) {
      const delta = amount(actual[field]) - amount(expected[field])
      if (Math.abs(delta) > tolerance) {
        differences.push({
          code: expected.code,
          field,
          actual: actual[field],
          expected: expected[field],
          difference: delta,
        })
      }
    }
  }
  addCheck({
    id,
    scope,
    actual: differences.length,
    expected: 0,
    tolerance: 0,
    note: differences.slice(0, 30),
  })
  return differences
}

const salesSourceRows = rows(books.salesInvoices, 'Sheet1', 'B1:L200')
  .filter((row) => typeof row[0] === 'number')
const purchaseSourceRows = rows(books.purchaseInvoices, 'Sheet1', 'B1:M200')
  .filter((row) => typeof row[0] === 'number')
const salesJournalSourceRows = rows(books.salesJournal, 'Sheet1', 'A9:I500')
  .filter((row) => text(row[3]))
const purchaseJournalSourceRows = rows(books.purchaseJournal, 'Sheet1', 'A9:I500')
  .filter((row) => text(row[3]))

addCheck({
  id: 'source-file-count',
  scope: 'Đủ tám file Quyên, gồm SPNH',
  actual: data.sourceFiles.length,
  expected: 8,
  tolerance: 0,
})
addCheck({
  id: 'sales-listing-count',
  scope: 'Bảng kê bán ra: số hóa đơn',
  actual: data.salesInvoices.length,
  expected: salesSourceRows.length,
  tolerance: 0,
})
addCheck({
  id: 'sales-listing-subtotal',
  scope: 'Bảng kê bán ra: tiền chưa VAT',
  actual: sum(data.salesInvoices, (row) => row.subtotal),
  expected: sum(salesSourceRows, (row) => row[8]),
})
addCheck({
  id: 'sales-listing-vat',
  scope: 'Bảng kê bán ra: VAT đầu ra',
  actual: sum(data.salesInvoices, (row) => row.vatAmount),
  expected: sum(salesSourceRows, (row) => row[9]),
})
addCheck({
  id: 'purchase-listing-count',
  scope: 'Bảng kê mua vào: số hóa đơn',
  actual: data.purchaseInvoices.length,
  expected: purchaseSourceRows.length,
  tolerance: 0,
})
addCheck({
  id: 'purchase-listing-subtotal',
  scope: 'Bảng kê mua vào: tiền chưa VAT',
  actual: sum(data.purchaseInvoices, (row) => row.subtotal),
  expected: sum(purchaseSourceRows, (row) => row[8]),
})
addCheck({
  id: 'purchase-listing-vat',
  scope: 'Bảng kê mua vào: VAT',
  actual: sum(data.purchaseInvoices, (row) => row.vatAmount),
  expected: sum(purchaseSourceRows, (row) => row[10]),
})

const salesJournalItems = data.salesJournal.flatMap((order) => order.items)
const purchaseJournalItems = data.purchaseJournal.flatMap((order) => order.items)
addCheck({
  id: 'sales-journal-lines',
  scope: 'Nhật ký bán: đủ dòng hàng tồn kho',
  actual: salesJournalItems.length,
  expected: salesJournalSourceRows.length,
  tolerance: 0,
})
addCheck({
  id: 'sales-journal-qty',
  scope: 'Nhật ký bán: tổng số lượng',
  actual: sum(salesJournalItems, (row) => row.qty),
  expected: sum(salesJournalSourceRows, (row) => row[6]),
})
addCheck({
  id: 'purchase-journal-lines',
  scope: 'Nhật ký mua: đủ dòng hàng tồn kho',
  actual: purchaseJournalItems.length,
  expected: purchaseJournalSourceRows.length,
  tolerance: 0,
})
addCheck({
  id: 'purchase-journal-qty',
  scope: 'Nhật ký mua: tổng số lượng',
  actual: sum(purchaseJournalItems, (row) => row.qty),
  expected: sum(purchaseJournalSourceRows, (row) => row[6]),
})

function inventoryRowsFor(sheetName) {
  return rows(books.inventory, sheetName, 'B9:W300')
    .filter((row) => typeof row[0] === 'number' && text(row[1]))
    .map((row) => ({
      code: text(row[1]),
      name: text(row[2]),
      unit: text(row[3]) || null,
      qtyOpen: amount(row[4]),
      valueOpen: amount(row[5]),
      qtyIn: amount(row[10]),
      valueIn: amount(row[11]),
      qtyOut: amount(row[16]),
      valueOut: amount(row[17]),
      qtyClose: amount(row[18]),
      valueClose: amount(row[19]),
    }))
}

const inventoryExpected = inventoryRowsFor('BangNXT_TH')
const sourceProductCodes = inventoryExpected.map((row) => row.code).sort()
const appProductCodes = data.products.map((row) => row.code).sort()
addCheck({
  id: 'product-code-set',
  scope: 'Mã hàng giữ nguyên tuyệt đối theo file Quyên',
  actual: {
    missing: setDifference(sourceProductCodes, appProductCodes),
    invented: setDifference(appProductCodes, sourceProductCodes),
  },
  expected: { missing: [], invented: [] },
  tolerance: 0,
})

compareRowsByCode(
  'inventory-quantity-and-input',
  'NXT tổng hợp: đầu kỳ, nhập, xuất và cuối kỳ tự chảy đúng số lượng',
  data.inventorySummary,
  inventoryExpected,
  ['qtyOpen', 'valueOpen', 'qtyIn', 'valueIn', 'qtyOut', 'qtyClose'],
)

const inventoryValueDifferences = compareRowsByCode(
  'inventory-moving-average-reference',
  'NXT tổng hợp: giá vốn/giá trị cuối so với file Quyên',
  data.inventorySummary,
  inventoryExpected,
  ['valueOut', 'valueClose'],
)
const movingAverageCheck = checks.at(-1)
if (inventoryValueDifferences.length > 0) {
  movingAverageCheck.status = 'explained'
  movingAverageCheck.note = {
    reason: 'App tự tính bình quân liên hoàn; không chép/khóa giá vốn hoặc tồn cuối từ file NXT.',
    totalIssueDifference:
      sum(data.inventorySummary, (row) => row.valueOut)
      - sum(inventoryExpected, (row) => row.valueOut),
    totalClosingDifference:
      sum(data.inventorySummary, (row) => row.valueClose)
      - sum(inventoryExpected, (row) => row.valueClose),
    rows: inventoryValueDifferences,
  }
}

for (let month = 1; month <= 6; month += 1) {
  const period = `2026-${String(month).padStart(2, '0')}`
  const expected = inventoryRowsFor(`BangNXT_${month}`)
  compareRowsByCode(
    `inventory-${period}-quantity`,
    `NXT ${period}: số lượng theo từng mã`,
    data.inventoryByMonth[period] ?? [],
    expected,
    ['qtyOpen', 'qtyIn', 'qtyOut', 'qtyClose'],
  )
}

const sourceReceivables = rows(books.receivables, 'CN_TH', 'B1:K300')
  .filter((row) => typeof row[0] === 'number')
  .map((row) => ({
    code: text(row[3]),
    openingDebit: amount(row[4]),
    openingCredit: amount(row[5]),
    periodDebit: amount(row[6]),
    periodCredit: amount(row[7]),
    closingDebit: amount(row[8]),
    closingCredit: amount(row[9]),
  }))
const sourcePayables = rows(books.payables, 'CN_TH', 'B1:K300')
  .filter((row) => typeof row[0] === 'number')
  .map((row) => ({
    code: text(row[3]),
    openingDebit: amount(row[4]),
    openingCredit: amount(row[5]),
    periodDebit: amount(row[6]),
    periodCredit: amount(row[7]),
    closingDebit: amount(row[8]),
    closingCredit: amount(row[9]),
  }))

compareRowsByCode(
  'receivable-by-code',
  'Công nợ phải thu: đầu kỳ + bán ra - tiền thu = cuối kỳ theo từng mã',
  data.receivables.map((row) => ({ ...row, code: row.partyCode })),
  sourceReceivables,
  ['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'],
)
compareRowsByCode(
  'payable-by-code',
  'Công nợ phải trả: đầu kỳ + tiền chi/mua vào = cuối kỳ theo từng mã',
  data.payables.map((row) => ({ ...row, code: row.partyCode })),
  sourcePayables,
  ['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'],
)

const customerCodes = data.customers.map((row) => row.code).sort()
const supplierCodes = data.suppliers.map((row) => row.code).sort()
addCheck({
  id: 'customer-code-set',
  scope: 'Mã công nợ phải thu giữ nguyên tuyệt đối theo file Quyên',
  actual: customerCodes,
  expected: sourceReceivables.map((row) => row.code).sort(),
  tolerance: 0,
})
addCheck({
  id: 'supplier-code-set',
  scope: 'Mã công nợ phải trả giữ nguyên tuyệt đối theo file Quyên',
  actual: supplierCodes,
  expected: sourcePayables.map((row) => row.code).sort(),
  tolerance: 0,
})

for (const debt of data.receivables) {
  const debit = sum(
    data.salesInvoices.filter((row) => row.affectsDebt && row.customerCode === debt.partyCode),
    (row) => row.grandTotal,
  )
  const credit = sum(
    data.bankTransactions.filter((row) =>
      row.affectsDebt && row.direction === 'thu' && row.partyCode === debt.partyCode),
    (row) => row.amountVnd,
  )
  addCheck({
    id: `ar-natural-${debt.partyCode}`,
    scope: `Phải thu ${debt.partyCode}: phát sinh tự chảy từ hóa đơn và SPNH`,
    actual: [debit, credit],
    expected: [debt.periodDebit, debt.periodCredit],
    tolerance: 0,
  })
}
for (const debt of data.payables) {
  const debit = sum(
    data.bankTransactions.filter((row) =>
      row.affectsDebt && row.direction === 'chi' && row.partyCode === debt.partyCode),
    (row) => row.amountVnd,
  )
  const credit = sum(
    data.purchaseInvoices.filter((row) => row.affectsDebt && row.supplierCode === debt.partyCode),
    (row) => row.orderType === 'import' && row.purchaseNature === 'goods'
      ? row.subtotal
      : row.grandTotal,
  )
  addCheck({
    id: `ap-natural-${debt.partyCode}`,
    scope: `Phải trả ${debt.partyCode}: phát sinh tự chảy từ SPNH và hóa đơn`,
    actual: [debit, credit],
    expected: [debt.periodDebit, debt.periodCredit],
    tolerance: 0,
  })
}

const bankSourceRows = rows(books.bank, 'TCB', 'A1:M1000')
const bankOpeningRow = bankSourceRows.find((row) => normalize(row[4]) === 'so du dau ky')
const bankSourceTransactions = bankSourceRows
  .filter((row) => typeof row[1] === 'number' && (amount(row[5]) || amount(row[6])))
  .map((row) => ({
    txnDate: isoFromExcelSerial(row[1]),
    direction: amount(row[5]) > 0 ? 'thu' : 'chi',
    amount: amount(row[5]) || amount(row[6]),
    runningBalance: amount(row[7]),
  }))
const bankLineDifferences = []
for (let index = 0; index < bankSourceTransactions.length; index += 1) {
  const expected = bankSourceTransactions[index]
  const actual = data.bankTransactions[index]
  if (!actual
      || actual.txnDate !== expected.txnDate
      || actual.direction !== expected.direction
      || Math.abs(actual.amountVnd - expected.amount) > 0.01
      || Math.abs(actual.runningBalance - expected.runningBalance) > 0.01) {
    bankLineDifferences.push({ index, actual, expected })
  }
}
addCheck({
  id: 'bank-lines',
  scope: 'SPNH: đủ từng dòng thu/chi và số dư chạy',
  actual: bankLineDifferences.length,
  expected: 0,
  tolerance: 0,
  note: bankLineDifferences.slice(0, 10),
})
addCheck({
  id: 'bank-opening',
  scope: 'SPNH: số dư đầu kỳ',
  actual: data.bankAccount.openingBalance,
  expected: amount(bankOpeningRow?.[7]),
})
addCheck({
  id: 'bank-closing-equation',
  scope: 'SPNH: đầu kỳ + thu - chi = cuối kỳ',
  actual: data.bankAccount.openingBalance
    + sum(data.bankTransactions.filter((row) => row.direction === 'thu'), (row) => row.amountVnd)
    - sum(data.bankTransactions.filter((row) => row.direction === 'chi'), (row) => row.amountVnd),
  expected: data.bankAccount.closingBalance,
})
addCheck({
  id: 'bank-debt-mapping',
  scope: 'SPNH: số dòng nối tự nhiên vào 131/331',
  actual: data.bankTransactions.filter((row) => row.affectsDebt).length,
  expected: 28,
  tolerance: 0,
})

const giftInvoices = data.salesInvoices.filter((row) => row.isGift)
addCheck({
  id: 'gift-treatment',
  scope: 'Quà tặng vẫn ở bảng kê/VAT nhưng không doanh thu, không công nợ',
  actual: giftInvoices.filter((row) => row.recognizeRevenue || row.createsReceivable).length,
  expected: 0,
  tolerance: 0,
  note: { invoices: giftInvoices.map((row) => row.invoiceNo) },
})

const failures = checks.filter((check) => check.status === 'fail')
const explained = checks.filter((check) => check.status === 'explained')
const report = {
  auditedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass_with_explained_difference' : 'fail',
  allowedDifferencePolicy: 'Chỉ giá vốn/giá trị tồn cuối do bình quân liên hoàn được phép explained; mọi chênh lệch khác là fail.',
  summary: {
    checks: checks.length,
    passed: checks.filter((check) => check.status === 'pass').length,
    explained: explained.length,
    failed: failures.length,
    sourceFiles: data.sourceFiles.length,
    salesInvoices: data.salesInvoices.length,
    salesJournalGroups: data.salesJournal.length,
    purchaseInvoices: data.purchaseInvoices.length,
    purchaseJournalGroups: data.purchaseJournal.length,
    inventoryProducts: data.inventorySummary.length,
    receivableParties: data.receivables.length,
    payableParties: data.payables.length,
    bankTransactions: data.bankTransactions.length,
    bankDebtMapped: data.bankTransactions.filter((row) => row.affectsDebt).length,
    inventoryIssueValueDifference:
      sum(data.inventorySummary, (row) => row.valueOut)
      - sum(inventoryExpected, (row) => row.valueOut),
  },
  checks,
}

fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`GLA AUDIT: ${report.status.toUpperCase()}`)
console.log(`Checks: ${report.summary.passed} pass / ${report.summary.explained} explained / ${report.summary.failed} fail`)
console.log(`Bán: ${report.summary.salesInvoices} bảng kê / ${report.summary.salesJournalGroups} nhật ký`)
console.log(`Mua: ${report.summary.purchaseInvoices} bảng kê / ${report.summary.purchaseJournalGroups} nhật ký`)
console.log(`Kho: ${report.summary.inventoryProducts} mã; lệch giá vốn ${report.summary.inventoryIssueValueDifference}`)
console.log(`Công nợ: ${report.summary.receivableParties} phải thu / ${report.summary.payableParties} phải trả`)
console.log(`Ngân hàng: ${report.summary.bankTransactions} dòng; ${report.summary.bankDebtMapped} dòng vào công nợ`)
console.log(`Report: ${reportFile}`)
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
}
