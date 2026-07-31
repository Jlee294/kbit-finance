import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import {
  deriveMovingAverageInventory,
  deriveTradeDebts,
} from './accounting-flow-engine.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const sourceDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(projectDir, '..', 'GLA_6 THANG DAU NAM 2026')
const outputFile = path.resolve(projectDir, 'data', 'gla-2026.json')

const SOURCE_FILES = {
  salesInvoices: '0315226378_Bang Ke BR Tu Thang 1 Den Thang 6.xls',
  purchaseInvoices: '0315226378_Bang Ke Mua Vao Tu Thang 1 Den Thang 12.xls',
  receivables: '0315226378_Tong Hop - Chi Tiet CNo Phai Thu Tu Thang 1 Den Thang 6.xlsx',
  payables: '0315226378_Tong Hop - Chi Tiet CNo Phai Tra Tu Thang 1 Den Thang 6.xlsx',
  inventory: 'Bang Nhap Xuat Ton Tu Thang 1 Den Thang 6.xlsx',
  salesJournal: 'NHAT KY BAN.xlsx',
  purchaseJournal: 'NHAT KY MUA.xlsx',
  bank: 'SPNH_GLA.xlsx',
}

const company = {
  id: '10000000-0000-0000-0000-000000000003',
  code: 'GLA',
  name: 'CÔNG TY TNHH GLA VIỆT NAM',
  taxCode: '0315226378',
  address: '183 Gò Dầu, Phường Phú Thọ Hòa',
  country: 'VN',
  baseCurrency: 'VND',
}

const warehouse = {
  id: 'gla-warehouse-main',
  code: 'KHO-GLA',
  name: 'Kho GLA',
  companyId: company.id,
  isActive: true,
  isDefault: true,
}

const bankAccount = {
  id: 'gla-bank-tcb',
  code: 'TCB',
  name: 'Techcombank',
  accountNumber: '19135152611017',
  openingBalance: 0,
  closingBalance: 0,
  currency: 'VND',
  companyId: company.id,
  isActive: true,
}

function readWorkbook(fileName) {
  const fullPath = path.join(sourceDir, fileName)
  if (!fs.existsSync(fullPath)) throw new Error(`Không tìm thấy file nguồn: ${fullPath}`)
  return XLSX.readFile(fullPath, { cellDates: false, raw: true })
}

function rowsFrom(workbook, sheetName, range) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Không tìm thấy sheet ${sheetName}`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, range })
}

function amount(value) {
  return value == null || value === '' ? 0 : Number(value)
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function isoFromDmy(value) {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) throw new Error(`Ngày không đúng định dạng dd/mm/yyyy: ${value}`)
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function isoFromExcelSerial(value) {
  const parsed = XLSX.SSF.parse_date_code(Number(value))
  if (!parsed) throw new Error(`Không đọc được ngày Excel: ${value}`)
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
}

function normalizeInvoiceNo(value) {
  const raw = text(value)
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return String(BigInt(raw))
  return raw.toUpperCase()
}

function invoiceKey(invoiceNo, invoiceDate) {
  return `${normalizeInvoiceNo(invoiceNo)}|${invoiceDate}`
}

function personKey(name, taxCode) {
  const tax = text(taxCode)
  if (tax && tax !== '15') return `tax:${tax}`
  return `name:${text(name).toLocaleUpperCase('vi-VN').replace(/\s+/g, ' ')}`
}

function normalized(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isGift(content, note) {
  return /\b(qua tang|bieu tang|hang tang|cho tang)\b/.test(
    normalized(`${text(content)} ${text(note)}`),
  )
}

function purchaseNature(content, note) {
  const value = normalized(`${text(content)} ${text(note)}`)
  if (/vat nhap khau|thue gtgt.*nhap khau/.test(value)) return 'import_vat'
  if (/thue nhap khau/.test(value)) return 'import_duty'
  if (/van chuyen|cuoc van tai|freight/.test(value)) return 'freight'
  if (/nhap khau|hang nhap khau/.test(value)) return 'goods'
  if (/dich vu/.test(value)) return 'service'
  return 'other'
}

const salesWorkbook = readWorkbook(SOURCE_FILES.salesInvoices)
const salesListingRows = rowsFrom(salesWorkbook, 'Sheet1', 'B1:L53')
  .filter((row) => typeof row[0] === 'number')

const purchaseWorkbook = readWorkbook(SOURCE_FILES.purchaseInvoices)
const purchaseListingRows = rowsFrom(purchaseWorkbook, 'Sheet1', 'B1:M77')
  .filter((row) => typeof row[0] === 'number')

const receivableWorkbook = readWorkbook(SOURCE_FILES.receivables)
const receivableRows = rowsFrom(receivableWorkbook, 'CN_TH', 'B1:K200')
  .filter((row) => typeof row[0] === 'number')

const payableWorkbook = readWorkbook(SOURCE_FILES.payables)
const payableRows = rowsFrom(payableWorkbook, 'CN_TH', 'B1:K200')
  .filter((row) => typeof row[0] === 'number')

const inventoryWorkbook = readWorkbook(SOURCE_FILES.inventory)
const inventoryRows = rowsFrom(inventoryWorkbook, 'BangNXT_TH', 'B9:W200')
  .filter((row) => typeof row[0] === 'number' && text(row[1]))

const salesJournalWorkbook = readWorkbook(SOURCE_FILES.salesJournal)
const salesJournalRows = rowsFrom(salesJournalWorkbook, 'Sheet1', 'A9:I200')
  .filter((row) => text(row[3]))

const purchaseJournalWorkbook = readWorkbook(SOURCE_FILES.purchaseJournal)
const purchaseJournalRows = rowsFrom(purchaseJournalWorkbook, 'Sheet1', 'A9:I200')
  .filter((row) => text(row[3]))

const bankWorkbook = readWorkbook(SOURCE_FILES.bank)
const bankRows = rowsFrom(bankWorkbook, 'TCB', 'A1:M1000')

const receivableReferences = receivableRows.map((row) => ({
  id: `gla-ar-${text(row[3]).toLowerCase()}`,
  partyId: `gla-customer-${text(row[3]).toLowerCase()}`,
  partyCode: text(row[3]),
  partyName: text(row[1]),
  taxCode: text(row[2]) || null,
  symbol: text(row[3]),
  openingDebit: amount(row[4]),
  openingCredit: amount(row[5]),
  periodDebit: amount(row[6]),
  periodCredit: amount(row[7]),
  closingDebit: amount(row[8]),
  closingCredit: amount(row[9]),
}))

const payableReferences = payableRows.map((row) => ({
  id: `gla-ap-${text(row[3]).toLowerCase()}`,
  partyId: `gla-supplier-${text(row[3]).toLowerCase()}`,
  partyCode: text(row[3]),
  partyName: text(row[1]),
  taxCode: text(row[2]) || null,
  symbol: text(row[3]),
  openingDebit: amount(row[4]),
  openingCredit: amount(row[5]),
  periodDebit: amount(row[6]),
  periodCredit: amount(row[7]),
  closingDebit: amount(row[8]),
  closingCredit: amount(row[9]),
}))

const customerMap = new Map()
for (const row of receivableReferences) {
  customerMap.set(personKey(row.partyName, row.taxCode), {
    id: row.partyId,
    code: row.partyCode,
    name: row.partyName,
    taxCode: row.taxCode,
    isActive: true,
  })
}
const customers = [...customerMap.values()]

const supplierMap = new Map()
for (const row of payableReferences) {
  supplierMap.set(personKey(row.partyName, row.taxCode), {
    id: row.partyId,
    code: row.partyCode,
    name: row.partyName,
    taxCode: row.taxCode,
    isActive: true,
  })
}
const suppliers = [...new Map([...supplierMap.values()].map((item) => [item.id, item])).values()]

function mapInventoryRow(row) {
  return {
    productId: `gla-product-${text(row[1]).toLowerCase()}`,
    code: text(row[1]),
    name: text(row[2]),
    unit: text(row[3]) || null,
    qtyOpen: amount(row[4]),
    valueOpen: amount(row[5]),
    qtyInPrimary: amount(row[6]),
    valueInPrimary: amount(row[7]),
    qtyInOther: amount(row[8]),
    valueInOther: amount(row[9]),
    qtyIn: amount(row[10]),
    valueIn: amount(row[11]),
    qtyOutPrimary: amount(row[12]),
    valueOutPrimary: amount(row[13]),
    qtyOutOther: amount(row[14]),
    valueOutOther: amount(row[15]),
    qtyOut: amount(row[16]),
    valueOut: amount(row[17]),
    qtyClose: amount(row[18]),
    valueClose: amount(row[19]),
    avgCost: amount(row[20]),
    accountCode: text(row[21]) || null,
  }
}

const inventoryReference = inventoryRows.map(mapInventoryRow)

const products = inventoryReference.map((row) => ({
  id: row.productId,
  code: row.code,
  name: row.name,
  unit: row.unit || '',
  isActive: true,
}))
const productByCode = new Map(products.map((product) => [product.code, product]))

function findCustomer(name, taxCode) {
  return customerMap.get(personKey(name, taxCode))
}

function findSupplier(name, taxCode) {
  const direct = supplierMap.get(personKey(name, taxCode))
  if (direct) return direct
  if (text(name).toUpperCase() === 'MINT KOREA') {
    return suppliers.find((item) => item.name.toUpperCase().includes('MINT KOREA'))
  }
  return undefined
}

const salesInvoices = salesListingRows.map((row, index) => {
  const invoiceDate = isoFromDmy(row[4])
  const customer = findCustomer(text(row[5]), text(row[6]))
  const subtotal = amount(row[8])
  const vatAmount = amount(row[9])
  const gift = isGift(row[7], row[10])
  const affectsDebt = subtotal + vatAmount > 0 && !gift
  if (affectsDebt && !customer) {
    throw new Error(`Hóa đơn bán ${text(row[3])} không có mã công nợ trong file Quyên`)
  }
  return {
    id: `gla-sales-invoice-${String(index + 1).padStart(3, '0')}`,
    companyId: company.id,
    orderCode: `GLA-BAN-${String(index + 1).padStart(3, '0')}`,
    invoiceTemplate: text(row[1]) || null,
    invoiceSymbol: text(row[2]) || null,
    invoiceNo: text(row[3]) || null,
    invoiceDate,
    orderDate: invoiceDate,
    customerId: customer?.id || '',
    customerCode: customer?.code || '',
    customerName: text(row[5]),
    customerTaxCode: text(row[6]) || null,
    content: text(row[7]),
    subtotal,
    vatPct: subtotal > 0 ? Math.round((vatAmount / subtotal) * 1000) / 10 : 0,
    vatAmount,
    grandTotal: subtotal + vatAmount,
    note: text(row[10]) || null,
    isGift: gift,
    recognizeRevenue: !gift,
    createsReceivable: affectsDebt,
    affectsDebt,
  }
})
const salesInvoiceByKey = new Map(
  salesInvoices.map((invoice) => [invoiceKey(invoice.invoiceNo, invoice.invoiceDate), invoice]),
)

const purchaseInvoices = purchaseListingRows.map((row, index) => {
  const invoiceDate = isoFromDmy(row[4])
  const supplier = findSupplier(text(row[5]), text(row[6]))
  const subtotal = amount(row[8])
  const vatAmount = amount(row[10])
  const nature = purchaseNature(row[7], row[11])
  const affectsDebt = subtotal + vatAmount > 0
    && !['import_duty', 'import_vat'].includes(nature)
  if (affectsDebt && !supplier) {
    throw new Error(`Hóa đơn mua ${text(row[3])} không có mã công nợ trong file Quyên`)
  }
  return {
    id: `gla-purchase-invoice-${String(index + 1).padStart(3, '0')}`,
    companyId: company.id,
    orderCode: `GLA-MUA-${String(index + 1).padStart(3, '0')}`,
    invoiceTemplate: text(row[1]) || null,
    invoiceSymbol: text(row[2]) || null,
    invoiceNo: text(row[3]) || null,
    invoiceDate,
    orderDate: invoiceDate,
    supplierId: supplier?.id || '',
    supplierCode: supplier?.code || '',
    supplierName: text(row[5]),
    supplierTaxCode: text(row[6]) || null,
    content: text(row[7]),
    subtotal,
    vatPct: amount(row[9]) * 100,
    vatAmount,
    grandTotal: subtotal + vatAmount,
    note: text(row[11]) || null,
    orderType: text(row[1]).toUpperCase() === 'NHAPKHAU' ? 'import' : 'domestic',
    purchaseNature: nature,
    createsPayable: affectsDebt,
    affectsDebt,
  }
})
const purchaseInvoiceByKey = new Map(
  purchaseInvoices.map((invoice) => [invoiceKey(invoice.invoiceNo, invoice.invoiceDate), invoice]),
)

function buildJournalGroups(rows, kind) {
  const groups = new Map()
  for (const row of rows) {
    const invoiceDate = isoFromExcelSerial(row[2])
    const key = invoiceKey(row[1], invoiceDate)
    const group = groups.get(key) || {
      invoiceNoNormalized: normalizeInvoiceNo(row[1]),
      invoiceDate,
      items: [],
    }
    const product = productByCode.get(text(row[3]))
    if (!product) {
      throw new Error(`Mã hàng "${text(row[3]) || '(trống)'}" không có trong file Quyên; không được tự tạo`)
    }
    group.items.push({
      id: `gla-${kind}-item-${String(group.items.length + 1).padStart(3, '0')}-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
      productId: product.id,
      productCode: text(row[3]),
      productName: text(row[4]),
      description: text(row[4]),
      unit: text(row[5]) || null,
      qty: amount(row[6]),
      unitPrice: amount(row[7]),
      lineTotal: amount(row[8]),
      lotNo: null,
      expiryDate: null,
    })
    groups.set(key, group)
  }
  return [...groups.values()]
}

const salesJournalGroups = buildJournalGroups(salesJournalRows, 'sales')
const purchaseJournalGroups = buildJournalGroups(purchaseJournalRows, 'purchase')

const salesJournal = salesJournalGroups.map((group, index) => {
  const invoice = salesInvoiceByKey.get(invoiceKey(group.invoiceNoNormalized, group.invoiceDate))
  if (!invoice) throw new Error(`Nhật ký bán không tìm thấy bảng kê: ${group.invoiceNoNormalized} ${group.invoiceDate}`)
  const amountPaid = 0
  const outstanding = invoice.createsReceivable ? invoice.grandTotal : 0
  return {
    ...invoice,
    id: `gla-sales-journal-${String(index + 1).padStart(3, '0')}`,
    orderCode: `GLA-NKB-${String(index + 1).padStart(3, '0')}`,
    subtotal: group.items.reduce((total, item) => total + item.lineTotal, 0),
    amountPaid,
    outstanding,
    fulfillmentStatus: 'delivered',
    paymentStatus: outstanding === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
    stockDeducted: true,
    warehouseId: warehouse.id,
    items: group.items,
  }
})

const purchaseJournal = purchaseJournalGroups.map((group, index) => {
  let invoice = purchaseInvoiceByKey.get(invoiceKey(group.invoiceNoNormalized, group.invoiceDate))
  const candidates = purchaseInvoices.filter(
    (item) => normalizeInvoiceNo(item.invoiceNo) === group.invoiceNoNormalized,
  )
  const importGoods = candidates.filter((item) => item.purchaseNature === 'goods')
  if (importGoods.length === 1 && (!invoice || ['import_duty', 'import_vat'].includes(invoice.purchaseNature))) {
    invoice = importGoods[0]
  } else if (!invoice && candidates.length === 1) {
    invoice = candidates[0]
  }
  if (!invoice) throw new Error(`Nhật ký mua không tìm thấy bảng kê: ${group.invoiceNoNormalized} ${group.invoiceDate}`)
  const subtotal = group.items.reduce((total, item) => total + item.lineTotal, 0)
  return {
    ...invoice,
    id: `gla-purchase-journal-${String(index + 1).padStart(3, '0')}`,
    orderCode: `GLA-NKM-${String(index + 1).padStart(3, '0')}`,
    invoiceDate: invoice.invoiceDate,
    orderDate: invoice.invoiceDate,
    subtotal,
    vatAmount: 0,
    grandTotal: subtotal,
    amountPaid: 0,
    outstanding: subtotal,
    stockAdded: true,
    warehouseId: warehouse.id,
    items: group.items,
  }
})

function buildDebtDetails(workbook, debts, kind) {
  const details = []
  for (const debt of debts) {
    const rows = rowsFrom(workbook, debt.symbol, 'A1:N200')
      .filter((row) => typeof row[2] === 'number')
    for (const row of rows) {
      const sourceDateSerial = amount(row[5])
      details.push({
        id: `gla-${kind}-detail-${debt.symbol.toLowerCase()}-${String(row[2]).padStart(3, '0')}`,
        debtId: debt.id,
        partyId: debt.partyId,
        partyCode: debt.partyCode,
        partyName: debt.partyName,
        symbol: debt.symbol,
        sequence: amount(row[2]),
        documentSymbol: text(row[3]) || null,
        documentNo: text(row[4]) || null,
        txnDate: isoFromExcelSerial(sourceDateSerial),
        sourceDateSerial,
        counterpartyName: text(row[6]) || null,
        taxCode: text(row[7]) || null,
        content: text(row[8]) || null,
        debit: amount(row[9]),
        credit: amount(row[10]),
        balanceDebit: amount(row[11]),
        balanceCredit: amount(row[12]),
        sourceRef: text(row[13]) || null,
      })
    }
  }
  return details
}

const receivableDetails = buildDebtDetails(receivableWorkbook, receivableReferences, 'ar')
const payableDetails = buildDebtDetails(payableWorkbook, payableReferences, 'ap')

function matchingDebtDetail(direction, txnDate, value) {
  const candidates = (direction === 'thu' ? receivableDetails : payableDetails)
    .filter((row) =>
      row.txnDate === txnDate
      && Math.abs((direction === 'thu' ? row.credit : row.debit) - value) <= 0.01)
  return candidates.length === 1 ? candidates[0] : undefined
}

const bankOpeningRow = bankRows.find((row) => normalized(row[4]) === 'so du dau ky')
if (!bankOpeningRow) throw new Error('SPNH không có dòng Số dư đầu kỳ')
bankAccount.openingBalance = amount(bankOpeningRow[7])

const bankTransactionRows = bankRows.filter(
  (row) => typeof row[1] === 'number' && (amount(row[5]) > 0 || amount(row[6]) > 0),
)
const bankTransactions = bankTransactionRows.map((row, index) => {
  const sourceDateSerial = amount(row[1])
  const txnDate = isoFromExcelSerial(sourceDateSerial)
  const receipt = amount(row[5])
  const payment = amount(row[6])
  const direction = receipt > 0 ? 'thu' : 'chi'
  const value = receipt || payment
  const debt = matchingDebtDetail(direction, txnDate, value)
  return {
    id: `gla-bank-tcb-${String(index + 1).padStart(3, '0')}`,
    direction,
    txnDate,
    sourceDateSerial,
    companyId: company.id,
    bankAccountId: bankAccount.id,
    partyId: debt?.partyId || null,
    partyCode: debt?.partyCode || null,
    partyName: debt?.partyName || text(row[2]) || null,
    sourcePartnerName: text(row[2]) || null,
    amountLocal: value,
    amountVnd: value,
    currency: 'VND',
    note: text(row[4]) || null,
    sourceRef: `SPNH-TCB-${String(index + 1).padStart(3, '0')}`,
    status: 'confirmed',
    affectsDebt: Boolean(debt),
    runningBalance: amount(row[7]),
  }
})
bankAccount.closingBalance = bankTransactions.at(-1)?.runningBalance ?? bankAccount.openingBalance

const inventoryFlow = deriveMovingAverageInventory({
  periodFrom: '2026-01-01',
  periodTo: '2026-06-30',
  openings: inventoryReference.map((row) => ({
    productId: row.productId,
    code: row.code,
    name: row.name,
    unit: row.unit,
    qtyOpen: row.qtyOpen,
    valueOpen: row.valueOpen,
    accountCode: row.accountCode,
  })),
  receipts: purchaseJournal.map((order) => ({
    id: order.id,
    date: order.orderDate,
    items: order.items,
  })),
  issues: salesJournal.map((order) => ({
    id: order.id,
    date: order.orderDate,
    items: order.items,
  })),
})
const inventorySummary = inventoryFlow.summary
const inventoryByMonth = inventoryFlow.byMonth

const debtFlow = deriveTradeDebts({
  receivableOpenings: receivableReferences,
  payableOpenings: payableReferences,
  salesInvoices: salesInvoices.map((invoice) => ({
    affectsDebt: invoice.affectsDebt,
    partyCode: invoice.customerCode,
    amount: invoice.grandTotal,
  })),
  purchaseInvoices: purchaseInvoices.map((invoice) => ({
    affectsDebt: invoice.affectsDebt,
    partyCode: invoice.supplierCode,
    amount: invoice.orderType === 'import' && invoice.purchaseNature === 'goods'
      ? invoice.subtotal
      : invoice.grandTotal,
  })),
  moneyTransactions: bankTransactions.map((transaction) => ({
    affectsDebt: transaction.affectsDebt,
    direction: transaction.direction,
    partyCode: transaction.partyCode,
    amount: transaction.amountVnd,
  })),
})
const receivables = debtFlow.receivables
const payables = debtFlow.payables

const data = {
  generatedAt: new Date().toISOString(),
  period: { from: '2026-01-01', to: '2026-06-30', year: 2026 },
  sourceFiles: Object.values(SOURCE_FILES),
  company,
  warehouse,
  bankAccount,
  customers,
  suppliers,
  products,
  salesInvoices,
  purchaseInvoices,
  salesJournal,
  purchaseJournal,
  inventorySummary,
  inventoryByMonth,
  receivables,
  payables,
  receivableDetails,
  payableDetails,
  bankTransactions,
  sourceReferences: {
    inventorySummary: inventoryReference,
    receivables: receivableReferences,
    payables: payableReferences,
  },
  limitations: [
    'Không có file sổ quỹ tiền mặt riêng trong bộ nguồn; dòng tiền mặt chưa thể nhập và đối chiếu.',
    'Chênh lệch giá vốn (nếu có) chỉ được chấp nhận khi chứng minh do app dùng bình quân liên hoàn còn file Quyên dùng phương pháp khác.',
  ],
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.writeFileSync(outputFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

console.log(`Đã nhập GLA vào ${outputFile}`)
console.log(`Bán: ${salesInvoices.length} bảng kê / ${salesJournal.length} nhật ký`)
console.log(`Mua: ${purchaseInvoices.length} bảng kê / ${purchaseJournal.length} nhật ký`)
console.log(`Kho: ${inventorySummary.length} mã hàng`)
console.log(`Công nợ: ${receivables.length} phải thu / ${payables.length} phải trả`)
console.log(`Chi tiết công nợ: ${receivableDetails.length} dòng phải thu / ${payableDetails.length} dòng phải trả`)
console.log(`Ngân hàng: ${bankTransactions.length} giao dịch TCB`)
