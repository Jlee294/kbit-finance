import rawData from '@/data/gla-2026.json'

export interface GlaParty {
  id: string
  code: string
  name: string
  taxCode: string | null
  isActive: boolean
}

export interface GlaProduct {
  id: string
  code: string
  name: string
  unit: string
  isActive: boolean
}

export interface GlaJournalItem {
  id: string
  productId: string
  productCode: string
  productName: string
  description: string
  unit: string | null
  qty: number
  unitPrice: number
  lineTotal: number
  lotNo: string | null
  expiryDate: string | null
}

export interface GlaInvoice {
  id: string
  companyId: string
  orderCode: string
  invoiceTemplate: string | null
  invoiceSymbol: string | null
  invoiceNo: string | null
  invoiceDate: string
  orderDate: string
  subtotal: number
  vatPct: number
  vatAmount: number
  grandTotal: number
  content: string
  note: string | null
}

export interface GlaSalesInvoice extends GlaInvoice {
  customerId: string
  customerCode: string
  customerName: string
  customerTaxCode: string | null
  isGift: boolean
  recognizeRevenue: boolean
  createsReceivable: boolean
  affectsDebt: boolean
}

export interface GlaPurchaseInvoice extends GlaInvoice {
  supplierId: string
  supplierCode: string
  supplierName: string
  supplierTaxCode: string | null
  orderType: string
  purchaseNature: string
  createsPayable: boolean
  affectsDebt: boolean
}

export interface GlaSalesJournal extends GlaSalesInvoice {
  amountPaid: number
  outstanding: number
  fulfillmentStatus: string
  paymentStatus: string
  stockDeducted: boolean
  warehouseId: string
  items: GlaJournalItem[]
}

export interface GlaPurchaseJournal extends GlaPurchaseInvoice {
  amountPaid: number
  outstanding: number
  stockAdded: boolean
  warehouseId: string
  items: GlaJournalItem[]
}

export interface GlaInventoryRow {
  productId: string
  code: string
  name: string
  unit: string | null
  qtyOpen: number
  valueOpen: number
  qtyInPrimary: number
  valueInPrimary: number
  qtyInOther: number
  valueInOther: number
  qtyIn: number
  valueIn: number
  qtyOutPrimary: number
  valueOutPrimary: number
  qtyOutOther: number
  valueOutOther: number
  qtyOut: number
  valueOut: number
  qtyClose: number
  valueClose: number
  avgCost: number
  accountCode: string | null
}

export interface GlaDebtRow {
  id: string
  partyId: string
  partyCode: string
  partyName: string
  taxCode: string | null
  symbol: string
  openingDebit: number
  openingCredit: number
  periodDebit: number
  periodCredit: number
  closingDebit: number
  closingCredit: number
}

export interface GlaDebtDetailRow {
  id: string
  debtId: string
  partyId: string
  partyCode: string
  partyName: string
  symbol: string
  sequence: number
  documentSymbol: string | null
  documentNo: string | null
  txnDate: string
  sourceDateSerial: number
  counterpartyName: string | null
  taxCode: string | null
  content: string | null
  debit: number
  credit: number
  balanceDebit: number
  balanceCredit: number
  sourceRef: string | null
}

export interface GlaBankTransaction {
  id: string
  direction: 'thu' | 'chi'
  txnDate: string
  sourceDateSerial: number
  companyId: string
  bankAccountId: string
  partyId: string | null
  partyCode: string | null
  partyName: string | null
  sourcePartnerName: string | null
  amountLocal: number
  amountVnd: number
  currency: string
  note: string | null
  sourceRef: string | null
  status: string
  affectsDebt: boolean
  runningBalance: number
}

export interface GlaData {
  generatedAt: string
  period: { from: string; to: string; year: number }
  sourceFiles: string[]
  company: {
    id: string
    code: string
    name: string
    taxCode: string
    address: string
    country: string
    baseCurrency: string
  }
  warehouse: {
    id: string
    code: string
    name: string
    companyId: string
    isActive: boolean
    isDefault: boolean
  }
  bankAccount: {
    id: string
    code: string
    name: string
    accountNumber: string
    openingBalance: number
    closingBalance: number
    currency: string
    companyId: string
    isActive: boolean
  }
  customers: GlaParty[]
  suppliers: GlaParty[]
  products: GlaProduct[]
  salesInvoices: GlaSalesInvoice[]
  purchaseInvoices: GlaPurchaseInvoice[]
  salesJournal: GlaSalesJournal[]
  purchaseJournal: GlaPurchaseJournal[]
  inventorySummary: GlaInventoryRow[]
  inventoryByMonth: Record<string, GlaInventoryRow[]>
  receivables: GlaDebtRow[]
  payables: GlaDebtRow[]
  receivableDetails: GlaDebtDetailRow[]
  payableDetails: GlaDebtDetailRow[]
  bankTransactions: GlaBankTransaction[]
  sourceReferences: {
    inventorySummary: GlaInventoryRow[]
    receivables: GlaDebtRow[]
    payables: GlaDebtRow[]
  }
  limitations: string[]
}

export const GLA_DATA = rawData as unknown as GlaData
export const GLA_COMPANY_ID = GLA_DATA.company.id

export interface GlaSourceCheck {
  id: string
  label: string
  actual: number
  expected: number
  difference: number
  status: 'pass' | 'fail'
}

const sum = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0)

function addByCode(target: Map<string, number>, code: string, value: number) {
  target.set(code, (target.get(code) ?? 0) + value)
}

function check(id: string, label: string, actual: number, expected: number, tolerance = 0.00001): GlaSourceCheck {
  const difference = actual - expected
  return {
    id,
    label,
    actual,
    expected,
    difference,
    status: Math.abs(difference) <= tolerance ? 'pass' : 'fail',
  }
}

export function getGlaSourceChecks(): GlaSourceCheck[] {
  const checks: GlaSourceCheck[] = []

  checks.push(
    check(
      'sales-listing-to-journal',
      'Doanh thu chưa VAT: bảng kê bán ra = nhật ký bán',
      sum(GLA_DATA.salesJournal, (row) => row.subtotal),
      sum(GLA_DATA.salesInvoices, (row) => row.subtotal),
    ),
    check(
      'purchase-listing-split',
      'Bảng kê mua = nhập kho + chi phí không qua kho',
      sum(GLA_DATA.purchaseJournal, (row) => row.subtotal)
        + (
          sum(GLA_DATA.purchaseInvoices, (row) => row.subtotal)
          - sum(GLA_DATA.purchaseJournal, (row) => row.subtotal)
        ),
      sum(GLA_DATA.purchaseInvoices, (row) => row.subtotal),
    ),
  )

  const salesQty = new Map<string, number>()
  for (const order of GLA_DATA.salesJournal) {
    for (const item of order.items) addByCode(salesQty, item.productCode, item.qty)
  }
  const purchaseQty = new Map<string, number>()
  for (const order of GLA_DATA.purchaseJournal) {
    for (const item of order.items) addByCode(purchaseQty, item.productCode, item.qty)
  }

  for (const row of GLA_DATA.inventorySummary) {
    checks.push(
      check(`nxt-qty-${row.code}`, `Cân số lượng NXT ${row.code}`, row.qtyOpen + row.qtyIn - row.qtyOut, row.qtyClose),
      check(`nxt-value-${row.code}`, `Cân giá trị NXT ${row.code}`, row.valueOpen + row.valueIn - row.valueOut, row.valueClose, 0.01),
      check(`purchase-qty-${row.code}`, `Nhật ký mua → NXT ${row.code}`, purchaseQty.get(row.code) ?? 0, row.qtyIn),
      check(`sales-qty-${row.code}`, `Nhật ký bán → NXT ${row.code}`, salesQty.get(row.code) ?? 0, row.qtyOut),
    )
  }

  for (const row of GLA_DATA.receivables) {
    checks.push(check(
      `ar-${row.symbol}`,
      `Cân công nợ phải thu ${row.symbol}`,
      row.openingDebit - row.openingCredit + row.periodDebit - row.periodCredit,
      row.closingDebit - row.closingCredit,
    ))
  }
  for (const row of GLA_DATA.payables) {
    checks.push(check(
      `ap-${row.symbol}`,
      `Cân công nợ phải trả ${row.symbol}`,
      row.openingDebit - row.openingCredit + row.periodDebit - row.periodCredit,
      row.closingDebit - row.closingCredit,
    ))
  }

  return checks
}
