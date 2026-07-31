export interface InvoiceIdentity {
  invoiceNo: string | number
  invoiceDate: string
}

export interface ListingInvoice extends InvoiceIdentity {
  amount: number
}

export interface JournalLine extends InvoiceIdentity {
  productCode: string
  amount: number
}

export type ReconcileErrorCode =
  | 'DUPLICATE_INVOICE'
  | 'JOURNAL_WITHOUT_INVOICE'
  | 'MISSING_PRODUCT_CODE'

export interface ReconcileError {
  code: ReconcileErrorCode
  invoiceKey: string
  message: string
}

export interface InvoiceJournalReconciliation {
  ok: boolean
  listingCount: number
  journalInvoiceCount: number
  journalLineCount: number
  errors: ReconcileError[]
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[()[\]{}.,:;_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi-VN')
}

function normalizeInvoiceNo(value: string | number): string {
  const normalized = String(value ?? '').trim().toUpperCase()
  return /^\d+$/.test(normalized) ? String(BigInt(normalized)) : normalized
}

export function buildInvoiceKey(identity: InvoiceIdentity): string {
  return `${normalizeInvoiceNo(identity.invoiceNo)}|${identity.invoiceDate}`
}

export function reconcileInvoiceJournal(
  listing: ListingInvoice[],
  journal: JournalLine[],
): InvoiceJournalReconciliation {
  const errors: ReconcileError[] = []
  const listingKeys = new Set<string>()

  for (const invoice of listing) {
    const key = buildInvoiceKey(invoice)
    if (listingKeys.has(key)) {
      errors.push({
        code: 'DUPLICATE_INVOICE',
        invoiceKey: key,
        message: `Hóa đơn ${key} bị trùng trong bảng kê`,
      })
    }
    listingKeys.add(key)
  }

  const journalKeys = new Set<string>()
  for (const line of journal) {
    const key = buildInvoiceKey(line)
    journalKeys.add(key)
    if (!listingKeys.has(key)) {
      errors.push({
        code: 'JOURNAL_WITHOUT_INVOICE',
        invoiceKey: key,
        message: `Nhật ký có hóa đơn ${key} nhưng bảng kê không có`,
      })
    }
    if (!line.productCode.trim()) {
      errors.push({
        code: 'MISSING_PRODUCT_CODE',
        invoiceKey: key,
        message: `Dòng nhật ký ${key} chưa có mã hàng`,
      })
    }
  }

  return {
    ok: errors.length === 0,
    listingCount: listing.length,
    journalInvoiceCount: journalKeys.size,
    journalLineCount: journal.length,
    errors,
  }
}
