import * as XLSX from 'xlsx'
import {
  buildInvoiceKey,
  normalizeHeader,
  reconcileInvoiceJournal,
  type JournalLine,
  type ListingInvoice,
} from './reconcile'

export type AccountingFileKind =
  | 'sales_listing'
  | 'sales_journal'
  | 'purchase_listing'
  | 'purchase_journal'
  | 'inventory'
  | 'receivable_opening'
  | 'payable_opening'
  | 'bank'
  | 'cash'

export interface ParsedStagingRow {
  rowNumber: number
  raw: unknown[]
  normalized: Record<string, unknown>
}

export interface ParsedAccountingFile {
  filename: string
  kind: AccountingFileKind
  sheetName: string
  sha256: string
  rows: ParsedStagingRow[]
}

export interface ImportPreviewCheck {
  code: string
  label: string
  status: 'passed' | 'failed' | 'warning'
  expected: number | null
  actual: number | null
  difference: number | null
  explanation?: string
}

export interface ImportPreview {
  files: Array<{
    filename: string
    kind: AccountingFileKind
    sheetName: string
    rowCount: number
    sha256: string
  }>
  checks: ImportPreviewCheck[]
  totalRows: number
  errorCount: number
  warningCount: number
  readyToApprove: boolean
}

const FILE_KIND_LABELS: Record<AccountingFileKind, string> = {
  sales_listing: 'Bảng kê bán ra',
  sales_journal: 'Nhật ký bán hàng',
  purchase_listing: 'Bảng kê mua vào',
  purchase_journal: 'Nhật ký mua hàng',
  inventory: 'Nhập xuất tồn',
  receivable_opening: 'Công nợ phải thu',
  payable_opening: 'Công nợ phải trả',
  bank: 'Sổ phụ ngân hàng',
  cash: 'Sổ quỹ tiền mặt',
}

const REQUIRED_KINDS: AccountingFileKind[] = [
  'sales_listing',
  'sales_journal',
  'purchase_listing',
  'purchase_journal',
  'inventory',
  'receivable_opening',
  'payable_opening',
]

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function amount(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-')
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const raw = text(value)
  if (!raw) return null
  const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

function sequenceIndex(row: unknown[]): number {
  return row.findIndex((value, index) =>
    index < 4
    && typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0)
}

function isGiftText(...values: unknown[]): boolean {
  const normalized = normalizeHeader(values.map(text).join(' '))
  return /\b(qua tang|bieu tang|hang tang|cho tang)\b/.test(normalized)
}

function isImportPurchase(...values: unknown[]): boolean {
  const normalized = normalizeHeader(values.map(text).join(' '))
  return /\b(nhap khau|hang nhap khau|import)\b/.test(normalized)
}

function purchaseNature(content: unknown, note: unknown): {
  nature: 'goods' | 'import_duty' | 'import_vat' | 'freight' | 'service' | 'other'
  declarationNo: string | null
} {
  const raw = [text(content), text(note)].filter(Boolean).join(' ')
  const normalized = normalizeHeader(raw)
  const declarationMatch = raw.match(/(?:tờ\s*khai|tkhq)[^\d]*(\d{8,})/i)
  const declarationNo = declarationMatch?.[1] ?? null
  if (/vat nhap khau|thue gtgt.*nhap khau/.test(normalized)) {
    return { nature: 'import_vat', declarationNo }
  }
  if (/thue nhap khau/.test(normalized)) {
    return { nature: 'import_duty', declarationNo }
  }
  if (/van chuyen|cuoc van tai|freight/.test(normalized)) {
    return { nature: 'freight', declarationNo }
  }
  if (/nhap khau|hang nhap khau/.test(normalized)) {
    return { nature: 'goods', declarationNo }
  }
  if (/dich vu/.test(normalized)) {
    return { nature: 'service', declarationNo }
  }
  return { nature: 'other', declarationNo }
}

export function detectAccountingFileKind(filename: string): AccountingFileKind {
  const name = normalizeHeader(filename.replace(/\.(xlsx?|xlsm|csv)$/i, ''))
  if (/nhat ky ban/.test(name)) return 'sales_journal'
  if (/nhat ky mua/.test(name)) return 'purchase_journal'
  if (/nhap xuat ton|\bnxt\b|bang nxt/.test(name)) return 'inventory'
  if (/cong no phai thu|cno phai thu|phai thu/.test(name)) return 'receivable_opening'
  if (/cong no phai tra|cno phai tra|phai tra/.test(name)) return 'payable_opening'
  if (/bang ke br|bang ke ban ra|ban ra/.test(name)) return 'sales_listing'
  if (/bang ke mua vao|mua vao/.test(name)) return 'purchase_listing'
  if (/so phu|spnh|ngan hang/.test(name)) return 'bank'
  if (/tien mat|so quy|quy tien/.test(name)) return 'cash'
  throw new Error(`Không nhận diện được loại file "${filename}". Hãy giữ tên có cụm Bảng kê, Nhật ký, NXT, Công nợ, SPNH hoặc Tiền mặt.`)
}

function parseListing(kind: 'sales_listing' | 'purchase_listing', rows: unknown[][]): ParsedStagingRow[] {
  return rows.flatMap((row, index) => {
    const base = sequenceIndex(row)
    if (base < 0) return []
    const invoiceDate = isoDate(row[base + 4])
    const invoiceNo = text(row[base + 3])
    if (!invoiceDate || !invoiceNo) return []
    const isPurchase = kind === 'purchase_listing'
    const subtotal = amount(row[base + 8])
    const vatRate = isPurchase ? amount(row[base + 9]) : (subtotal > 0 ? amount(row[base + 9]) / subtotal : 0)
    const vatAmount = amount(row[base + (isPurchase ? 10 : 9)])
    const note = text(row[base + (isPurchase ? 11 : 10)])
    const nature = purchaseNature(row[base + 7], note)
    return [{
      rowNumber: index + 1,
      raw: row,
      normalized: {
        invoice_template: text(row[base + 1]) || null,
        invoice_symbol: text(row[base + 2]) || null,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        partner_name: text(row[base + 5]),
        tax_code: text(row[base + 6]) || null,
        content: text(row[base + 7]),
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        grand_total: subtotal + vatAmount,
        note: note || null,
        is_gift: !isPurchase && isGiftText(row[base + 7], note),
        ...(isPurchase
          ? {
              order_type: (
                nature.declarationNo
                || nature.nature === 'import_duty'
                || nature.nature === 'import_vat'
                || isImportPurchase(
                  row[base + 1],
                  row[base + 2],
                  row[base + 7],
                  note,
                )
              )
                ? 'import'
                : 'domestic',
              purchase_nature: nature.nature,
              customs_declaration_no: nature.declarationNo,
            }
          : {}),
      },
    }]
  })
}

function parseJournal(kind: 'sales_journal' | 'purchase_journal', rows: unknown[][]): ParsedStagingRow[] {
  return rows.flatMap((row, index) => {
    const base = sequenceIndex(row)
    if (base < 0) return []
    const invoiceDate = isoDate(row[base + 2])
    const invoiceNo = text(row[base + 1])
    const productCode = text(row[base + 3])
    if (!invoiceDate || !invoiceNo) return []
    return [{
      rowNumber: index + 1,
      raw: row,
      normalized: {
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        product_code: productCode,
        product_name: text(row[base + 4]),
        unit: text(row[base + 5]) || null,
        quantity: amount(row[base + 6]),
        unit_price: amount(row[base + 7]),
        amount: amount(row[base + 8]),
        direction: kind === 'sales_journal' ? 'issue' : 'receipt',
      },
    }]
  })
}

function parseInventory(rows: unknown[][]): ParsedStagingRow[] {
  return rows.flatMap((row, index) => {
    const base = sequenceIndex(row)
    if (base < 0 || (!text(row[base + 1]) && !text(row[base + 2]))) return []
    return [{
      rowNumber: index + 1,
      raw: row,
      normalized: {
        product_code: text(row[base + 1]),
        product_name: text(row[base + 2]),
        unit: text(row[base + 3]) || null,
        opening_quantity: amount(row[base + 4]),
        opening_value: amount(row[base + 5]),
        receipt_quantity: amount(row[base + 10]),
        receipt_value: amount(row[base + 11]),
        issue_quantity: amount(row[base + 16]),
        issue_value: amount(row[base + 17]),
        closing_quantity: amount(row[base + 18]),
        closing_value: amount(row[base + 19]),
        average_cost: amount(row[base + 20]),
        account_code: text(row[base + 21]) || null,
      },
    }]
  })
}

function parseDebt(
  kind: 'receivable_opening' | 'payable_opening',
  rows: unknown[][],
): ParsedStagingRow[] {
  return rows.flatMap((row, index) => {
    const base = sequenceIndex(row)
    if (base < 0 || !text(row[base + 1])) return []
    return [{
      rowNumber: index + 1,
      raw: row,
      normalized: {
        record_type: 'summary',
        partner_type: kind === 'receivable_opening' ? 'customer' : 'supplier',
        partner_name: text(row[base + 1]),
        tax_code: text(row[base + 2]) || null,
        partner_code: text(row[base + 3]),
        opening_debit: amount(row[base + 4]),
        opening_credit: amount(row[base + 5]),
        period_debit: amount(row[base + 6]),
        period_credit: amount(row[base + 7]),
        closing_debit: amount(row[base + 8]),
        closing_credit: amount(row[base + 9]),
      },
    }]
  })
}

function parseDebtDetails(
  workbook: XLSX.WorkBook,
  summaryRows: ParsedStagingRow[],
): ParsedStagingRow[] {
  const details: ParsedStagingRow[] = []
  summaryRows.forEach((summary, sheetIndex) => {
    const sheetName = text(summary.normalized.partner_code)
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    })
    rows.forEach((row, index) => {
      if (typeof row[2] !== 'number') return
      const txnDate = isoDate(row[5])
      if (!txnDate) return
      details.push({
        rowNumber: 100_000 + sheetIndex * 1_000 + index + 1,
        raw: row,
        normalized: {
          record_type: 'detail',
          partner_type: summary.normalized.partner_type,
          partner_name: summary.normalized.partner_name,
          tax_code: summary.normalized.tax_code,
          partner_code: sheetName,
          sequence: amount(row[2]),
          document_symbol: text(row[3]) || null,
          document_no: text(row[4]) || null,
          txn_date: txnDate,
          counterparty_name: text(row[6]) || null,
          content: text(row[8]) || null,
          debit: amount(row[9]),
          credit: amount(row[10]),
          balance_debit: amount(row[11]),
          balance_credit: amount(row[12]),
          source_ref: text(row[13]) || null,
        },
      })
    })
  })
  return details
}

function headerMap(rows: unknown[][]): { index: number; columns: Map<string, number> } | null {
  for (let index = 0; index < Math.min(rows.length, 30); index++) {
    const columns = new Map<string, number>()
    rows[index].forEach((value, columnIndex) => {
      const key = normalizeHeader(value)
      if (key) columns.set(key, columnIndex)
    })
    const keys = [...columns.keys()].join(' ')
    if (/(ngay|date)/.test(keys) && /(so tien|amount|ghi co|ghi no|thu|chi)/.test(keys)) {
      return { index, columns }
    }
  }
  return null
}

function findColumn(columns: Map<string, number>, patterns: RegExp[]): number {
  for (const [key, index] of columns) {
    if (patterns.some((pattern) => pattern.test(key))) return index
  }
  return -1
}

function parseMoneyLedger(kind: 'bank' | 'cash', rows: unknown[][]): ParsedStagingRow[] {
  const header = headerMap(rows)
  if (!header) return []
  const dateColumn = findColumn(header.columns, [/^ngay/, /date/])
  const contentColumn = findColumn(header.columns, [/noi dung/, /dien giai/, /mo ta/])
  const receiptColumn = findColumn(header.columns, [/ghi co/, /tien thu/, /^thu$/, /bao co/])
  const paymentColumn = findColumn(header.columns, [/ghi no/, /tien chi/, /^chi$/, /bao no/])
  const amountColumn = findColumn(header.columns, [/so tien/, /amount/])
  const directionColumn = findColumn(header.columns, [/loai/, /direction/])
  const partnerColumn = findColumn(header.columns, [
    /doi tac/,
    /khach hang/,
    /nha cung cap/,
    /ten nguoi nop nhan tien/,
    /nguoi nop nhan/,
  ])
  const taxColumn = findColumn(header.columns, [/ma so thue/, /^mst$/])
  const partnerCodeColumn = findColumn(header.columns, [/ma kh/, /ma doi tac/, /ma cong no/])

  return rows.slice(header.index + 1).flatMap((row, offset) => {
    const date = isoDate(row[dateColumn])
    if (!date) return []
    const receipt = receiptColumn >= 0 ? amount(row[receiptColumn]) : 0
    const payment = paymentColumn >= 0 ? amount(row[paymentColumn]) : 0
    const singleAmount = amountColumn >= 0 ? amount(row[amountColumn]) : 0
    const directionText = directionColumn >= 0 ? normalizeHeader(row[directionColumn]) : ''
    const direction = receipt > 0 || /\bthu\b|bao co/.test(directionText) ? 'thu' : 'chi'
    const value = receipt || payment || singleAmount
    if (value <= 0) return []
    return [{
      rowNumber: header.index + offset + 2,
      raw: row,
      normalized: {
        txn_date: date,
        direction,
        amount: value,
        content: contentColumn >= 0 ? text(row[contentColumn]) : '',
        partner_name: partnerColumn >= 0 ? text(row[partnerColumn]) : '',
        tax_code: taxColumn >= 0 ? text(row[taxColumn]) || null : null,
        partner_code: partnerCodeColumn >= 0 ? text(row[partnerCodeColumn]) || null : null,
        source: kind,
      },
    }]
  })
}

export function parseSheetRows(kind: AccountingFileKind, rows: unknown[][]): ParsedStagingRow[] {
  if (kind === 'sales_listing' || kind === 'purchase_listing') return parseListing(kind, rows)
  if (kind === 'sales_journal' || kind === 'purchase_journal') return parseJournal(kind, rows)
  if (kind === 'inventory') return parseInventory(rows)
  if (kind === 'receivable_opening' || kind === 'payable_opening') return parseDebt(kind, rows)
  return parseMoneyLedger(kind, rows)
}

function chooseSheet(workbook: XLSX.WorkBook, kind: AccountingFileKind): string {
  const preferred = kind === 'inventory'
    ? workbook.SheetNames.find((name) => normalizeHeader(name) === 'bangnxt th')
    : kind === 'receivable_opening' || kind === 'payable_opening'
      ? workbook.SheetNames.find((name) => normalizeHeader(name) === 'cn th')
      : undefined
  return preferred ?? workbook.SheetNames[0]
}

export function parseAccountingWorkbook(
  bytes: Uint8Array,
  filename: string,
  sha256: string,
): ParsedAccountingFile {
  const kind = detectAccountingFileKind(filename)
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, raw: true })
  const sheetName = chooseSheet(workbook, kind)
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`File ${filename} không có sheet dữ liệu`)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  })
  let parsedRows = parseSheetRows(kind, rows)
  if (kind === 'receivable_opening' || kind === 'payable_opening') {
    parsedRows = [...parsedRows, ...parseDebtDetails(workbook, parsedRows)]
  }
  if (parsedRows.length === 0) {
    throw new Error(`Không đọc được dòng dữ liệu nào trong ${filename} (${sheetName})`)
  }
  return { filename, kind, sheetName, sha256, rows: parsedRows }
}

function numeric(value: unknown): number {
  return Number(value ?? 0)
}

function check(
  code: string,
  label: string,
  expected: number | null,
  actual: number | null,
  tolerance = 0.01,
  explanation?: string,
): ImportPreviewCheck {
  const difference = expected == null || actual == null ? null : actual - expected
  const absoluteDifference = difference == null ? null : Math.abs(difference)
  const isExact = absoluteDifference != null && absoluteDifference <= 0.01
  const isWithinRoundingTolerance = absoluteDifference != null && absoluteDifference <= tolerance
  return {
    code,
    label,
    status: difference == null
      ? 'warning'
      : isExact
        ? 'passed'
        : isWithinRoundingTolerance
          ? 'warning'
          : 'failed',
    expected,
    actual,
    difference,
    explanation: explanation ?? (
      isWithinRoundingTolerance && !isExact
        ? `Sai số làm tròn nội tại của file nguồn: ${difference}. App giữ nguyên số nguồn và yêu cầu lưu giải trình.`
        : undefined
    ),
  }
}

function rowsOf(files: ParsedAccountingFile[], kind: AccountingFileKind): ParsedStagingRow[] {
  return files.filter((file) => file.kind === kind).flatMap((file) => file.rows)
}

function invoiceNumberKey(value: unknown): string {
  return buildInvoiceKey({
    invoiceNo: text(value),
    invoiceDate: '0000-00-00',
  }).split('|')[0]
}

function linkImportPurchaseJournals(files: ParsedAccountingFile[]): void {
  const goodsByDeclaration = new Map<string, ParsedStagingRow[]>()
  for (const row of rowsOf(files, 'purchase_listing')) {
    if (row.normalized.order_type !== 'import'
        || row.normalized.purchase_nature !== 'goods') continue
    const declaration = text(row.normalized.customs_declaration_no)
      || invoiceNumberKey(row.normalized.invoice_no)
    const existing = goodsByDeclaration.get(declaration) ?? []
    goodsByDeclaration.set(declaration, [...existing, row])
  }

  for (const row of rowsOf(files, 'purchase_journal')) {
    const declaration = invoiceNumberKey(row.normalized.invoice_no)
    const candidates = goodsByDeclaration.get(declaration) ?? []
    if (candidates.length !== 1) continue
    row.normalized = {
      ...row.normalized,
      posting_invoice_date: candidates[0].normalized.invoice_date,
      linked_purchase_nature: 'goods',
    }
  }
}

function summaryRowsOf(
  files: ParsedAccountingFile[],
  kind: 'receivable_opening' | 'payable_opening',
): ParsedStagingRow[] {
  return rowsOf(files, kind)
    .filter((row) => row.normalized.record_type !== 'detail')
}

function detailRowsOf(
  files: ParsedAccountingFile[],
  kind: 'receivable_opening' | 'payable_opening',
): ParsedStagingRow[] {
  return rowsOf(files, kind)
    .filter((row) => row.normalized.record_type === 'detail')
}

function findSourcePartner(
  row: ParsedStagingRow,
  candidates: ParsedStagingRow[],
): ParsedStagingRow | undefined {
  const sourceCode = text(row.normalized.partner_code)
  if (sourceCode) {
    const byCode = candidates.filter(
      (candidate) => text(candidate.normalized.partner_code) === sourceCode,
    )
    if (byCode.length === 1) return byCode[0]
  }

  const taxCode = text(row.normalized.tax_code)
  if (taxCode) {
    const byTaxCode = candidates.filter(
      (candidate) => text(candidate.normalized.tax_code) === taxCode,
    )
    if (byTaxCode.length === 1) return byTaxCode[0]
  }

  const partnerName = normalizeHeader(row.normalized.partner_name)
  if (partnerName) {
    const byName = candidates.filter(
      (candidate) => normalizeHeader(candidate.normalized.partner_name) === partnerName,
    )
    if (byName.length === 1) return byName[0]
  }

  return undefined
}

function isDebtAffectingListing(
  kind: 'sales_listing' | 'purchase_listing',
  row: ParsedStagingRow,
): boolean {
  if (numeric(row.normalized.grand_total) === 0) return false
  if (kind === 'sales_listing') return row.normalized.is_gift !== true
  return !['import_duty', 'import_vat'].includes(text(row.normalized.purchase_nature))
}

function applySourcePartner(
  row: ParsedStagingRow,
  match: ParsedStagingRow | undefined,
  affectsDebt: boolean,
): void {
  row.normalized = {
    ...row.normalized,
    affects_debt: affectsDebt,
    partner_code: match ? text(match.normalized.partner_code) : null,
    ...(match
      ? {
          partner_name: match.normalized.partner_name,
          tax_code: match.normalized.tax_code,
        }
      : {}),
  }
}

function mapListingPartnerCodes(
  files: ParsedAccountingFile[],
  checks: ImportPreviewCheck[],
): void {
  for (const [kind, debtKind, checkCode] of [
    ['sales_listing', 'receivable_opening', 'SALES_SOURCE_PARTNER_CODES'],
    ['purchase_listing', 'payable_opening', 'PURCHASE_SOURCE_PARTNER_CODES'],
  ] as const) {
    const sourcePartners = summaryRowsOf(files, debtKind)
    const listingRows = rowsOf(files, kind)
    const missing: ParsedStagingRow[] = []

    for (const row of listingRows) {
      const affectsDebt = isDebtAffectingListing(kind, row)
      const match = affectsDebt ? findSourcePartner(row, sourcePartners) : undefined
      applySourcePartner(row, match, affectsDebt)
      if (affectsDebt && !match) missing.push(row)
    }

    checks.push({
      code: checkCode,
      label: `${FILE_KIND_LABELS[kind]} dùng nguyên mã công nợ trong file Quyên`,
      status: missing.length === 0 ? 'passed' : 'failed',
      expected: 0,
      actual: missing.length,
      difference: missing.length,
      explanation: missing.length === 0
        ? undefined
        : missing
            .slice(0, 10)
            .map((row) => `${text(row.normalized.invoice_no)} - ${text(row.normalized.partner_name)}`)
            .join('; '),
    })
  }
}

function findMoneyPartnerByDebtDetail(
  row: ParsedStagingRow,
  details: ParsedStagingRow[],
): ParsedStagingRow | undefined {
  const direction = text(row.normalized.direction)
  const amountField = direction === 'thu' ? 'credit' : 'debit'
  const candidates = details.filter((detail) =>
    text(detail.normalized.txn_date) === text(row.normalized.txn_date)
    && Math.abs(
      numeric(detail.normalized[amountField]) - numeric(row.normalized.amount),
    ) <= 0.01)
  return candidates.length === 1 ? candidates[0] : undefined
}

function mapMoneyPartnerCodes(
  files: ParsedAccountingFile[],
  checks: ImportPreviewCheck[],
): void {
  const receivableParties = summaryRowsOf(files, 'receivable_opening')
  const payableParties = summaryRowsOf(files, 'payable_opening')
  const receivableDetails = detailRowsOf(files, 'receivable_opening')
  const payableDetails = detailRowsOf(files, 'payable_opening')

  for (const kind of ['bank', 'cash'] as const) {
    const moneyRows = rowsOf(files, kind)
    let debtMapped = 0
    for (const row of moneyRows) {
      const isReceipt = row.normalized.direction === 'thu'
      const candidates = isReceipt ? receivableParties : payableParties
      const details = isReceipt ? receivableDetails : payableDetails
      const directMatch = findSourcePartner(row, candidates)
      const detailMatch = directMatch
        ? undefined
        : findMoneyPartnerByDebtDetail(row, details)
      const detailPartner = detailMatch
        ? candidates.find((candidate) =>
            text(candidate.normalized.partner_code)
            === text(detailMatch.normalized.partner_code))
        : undefined
      const match = directMatch ?? detailPartner

      applySourcePartner(row, match, Boolean(match))
      if (match) debtMapped += 1
    }

    if (moneyRows.length > 0) {
      checks.push({
        code: `${kind.toUpperCase()}_DEBT_MAPPING`,
        label: `${FILE_KIND_LABELS[kind]}: nhận diện dòng tác động công nợ bằng mã hoặc dấu vết nguồn`,
        status: 'passed',
        expected: debtMapped,
        actual: debtMapped,
        difference: 0,
        explanation: `${moneyRows.length - debtMapped} dòng không thuộc 131/331 vẫn được ghi tiền nhưng không tạo mã công nợ giả.`,
      })
    }
  }
}

function purchasePayableAmount(row: ParsedStagingRow): number {
  if (row.normalized.affects_debt !== true) return 0
  if (row.normalized.order_type === 'import'
      && row.normalized.purchase_nature === 'goods') {
    return numeric(row.normalized.subtotal)
  }
  return numeric(row.normalized.grand_total)
}

function addNaturalDebtFlowChecks(
  files: ParsedAccountingFile[],
  checks: ImportPreviewCheck[],
): void {
  const salesRows = rowsOf(files, 'sales_listing')
  const purchaseRows = rowsOf(files, 'purchase_listing')
  const moneyRows = [
    ...rowsOf(files, 'bank'),
    ...rowsOf(files, 'cash'),
  ]

  for (const [kind, prefix] of [
    ['receivable_opening', 'AR'],
    ['payable_opening', 'AP'],
  ] as const) {
    for (const row of summaryRowsOf(files, kind)) {
      const partnerCode = text(row.normalized.partner_code)
      const actualDebit = kind === 'receivable_opening'
        ? salesRows
            .filter((item) =>
              item.normalized.affects_debt === true
              && text(item.normalized.partner_code) === partnerCode)
            .reduce((sum, item) => sum + numeric(item.normalized.grand_total), 0)
        : moneyRows
            .filter((item) =>
              item.normalized.affects_debt === true
              && item.normalized.direction === 'chi'
              && text(item.normalized.partner_code) === partnerCode)
            .reduce((sum, item) => sum + numeric(item.normalized.amount), 0)
      const actualCredit = kind === 'receivable_opening'
        ? moneyRows
            .filter((item) =>
              item.normalized.affects_debt === true
              && item.normalized.direction === 'thu'
              && text(item.normalized.partner_code) === partnerCode)
            .reduce((sum, item) => sum + numeric(item.normalized.amount), 0)
        : purchaseRows
            .filter((item) =>
              item.normalized.affects_debt === true
              && text(item.normalized.partner_code) === partnerCode)
            .reduce((sum, item) => sum + purchasePayableAmount(item), 0)

      checks.push(check(
        `FLOW_${prefix}_DEBIT_${partnerCode}`,
        `${prefix} ${partnerCode}: phát sinh Nợ tự chảy từ chứng từ`,
        numeric(row.normalized.period_debit),
        actualDebit,
        1,
      ))
      checks.push(check(
        `FLOW_${prefix}_CREDIT_${partnerCode}`,
        `${prefix} ${partnerCode}: phát sinh Có tự chảy từ chứng từ`,
        numeric(row.normalized.period_credit),
        actualCredit,
        1,
      ))
    }
  }
}

export function buildImportPreview(files: ParsedAccountingFile[]): ImportPreview {
  const checks: ImportPreviewCheck[] = []

  for (const kind of REQUIRED_KINDS) {
    const matches = files.filter((file) => file.kind === kind)
    checks.push({
      code: `FILE_${kind.toUpperCase()}`,
      label: `Có đúng 1 file ${FILE_KIND_LABELS[kind]}`,
      status: matches.length === 1 ? 'passed' : 'failed',
      expected: 1,
      actual: matches.length,
      difference: matches.length - 1,
      explanation: matches.length === 0 ? 'Thiếu file bắt buộc' : matches.length > 1 ? 'Có file trùng loại' : undefined,
    })
  }

  linkImportPurchaseJournals(files)
  mapListingPartnerCodes(files, checks)

  for (const side of ['sales', 'purchase'] as const) {
    const listingRows = rowsOf(files, `${side}_listing`)
    const journalRows = rowsOf(files, `${side}_journal`)
    const listing: ListingInvoice[] = listingRows.map((row) => ({
      invoiceNo: text(row.normalized.invoice_no),
      invoiceDate: text(row.normalized.invoice_date),
      amount: numeric(row.normalized.subtotal),
    }))
    const journal: JournalLine[] = journalRows.map((row) => ({
      invoiceNo: text(row.normalized.invoice_no),
      invoiceDate: text(
        row.normalized.posting_invoice_date
        ?? row.normalized.invoice_date,
      ),
      productCode: text(row.normalized.product_code),
      amount: numeric(row.normalized.amount),
    }))
    const reconciliation = reconcileInvoiceJournal(listing, journal)
    checks.push({
      code: `${side.toUpperCase()}_JOURNAL_SUBSET`,
      label: `${FILE_KIND_LABELS[`${side}_journal`]} là tập con có mã hàng của ${FILE_KIND_LABELS[`${side}_listing`]}`,
      status: reconciliation.ok ? 'passed' : 'failed',
      expected: 0,
      actual: reconciliation.errors.length,
      difference: reconciliation.errors.length,
      explanation: reconciliation.errors.map((error) => error.message).slice(0, 5).join('; ') || undefined,
    })
  }

  const sourceProductRows = [
    ...rowsOf(files, 'sales_journal'),
    ...rowsOf(files, 'purchase_journal'),
    ...rowsOf(files, 'inventory'),
  ]
  const missingProductCodes = sourceProductRows.filter(
    (row) => !text(row.normalized.product_code),
  )
  checks.push({
    code: 'SOURCE_PRODUCT_CODES',
    label: 'Mọi mã hàng lấy nguyên văn từ Nhật ký/NXT của Quyên',
    status: missingProductCodes.length === 0 ? 'passed' : 'failed',
    expected: 0,
    actual: missingProductCodes.length,
    difference: missingProductCodes.length,
    explanation: missingProductCodes.length === 0
      ? undefined
      : missingProductCodes
          .slice(0, 10)
          .map((row) => `Dòng ${row.rowNumber}`)
          .join('; '),
  })

  for (const row of rowsOf(files, 'inventory')) {
    const code = text(row.normalized.product_code) || String(row.rowNumber)
    checks.push(check(
      `NXT_QTY_${code}`,
      `Cân số lượng NXT ${code}`,
      numeric(row.normalized.closing_quantity),
      numeric(row.normalized.opening_quantity)
        + numeric(row.normalized.receipt_quantity)
        - numeric(row.normalized.issue_quantity),
      0.00001,
    ))
    checks.push(check(
      `NXT_VALUE_${code}`,
      `Cân giá trị NXT ${code}`,
      numeric(row.normalized.closing_value),
      numeric(row.normalized.opening_value)
        + numeric(row.normalized.receipt_value)
        - numeric(row.normalized.issue_value),
      1,
    ))
  }

  for (const [kind, prefix] of [
    ['receivable_opening', 'AR'],
    ['payable_opening', 'AP'],
  ] as const) {
    const debtRows = rowsOf(files, kind)
    const summaryRows = debtRows.filter((row) => row.normalized.record_type !== 'detail')
    const detailRows = debtRows.filter((row) => row.normalized.record_type === 'detail')
    for (const row of summaryRows) {
      const partnerCode = text(row.normalized.partner_code) || String(row.rowNumber)
      const openingNet = numeric(row.normalized.opening_debit) - numeric(row.normalized.opening_credit)
      const movementNet = numeric(row.normalized.period_debit) - numeric(row.normalized.period_credit)
      const closingNet = numeric(row.normalized.closing_debit) - numeric(row.normalized.closing_credit)
      checks.push(check(
        `DEBT_${prefix}_${partnerCode}`,
        `Cân công nợ ${prefix} ${partnerCode}`,
        closingNet,
        openingNet + movementNet,
        1,
      ))
      const partnerDetails = detailRows.filter((detail) => text(detail.normalized.partner_code) === partnerCode)
      if (partnerDetails.length > 0) {
        checks.push(check(
          `DEBT_DETAIL_DEBIT_${prefix}_${partnerCode}`,
          `Chi tiết phát sinh Nợ ${prefix} ${partnerCode}`,
          numeric(row.normalized.period_debit),
          partnerDetails.reduce((sum, detail) => sum + numeric(detail.normalized.debit), 0),
          1,
        ))
        checks.push(check(
          `DEBT_DETAIL_CREDIT_${prefix}_${partnerCode}`,
          `Chi tiết phát sinh Có ${prefix} ${partnerCode}`,
          numeric(row.normalized.period_credit),
          partnerDetails.reduce((sum, detail) => sum + numeric(detail.normalized.credit), 0),
          1,
        ))
      }
    }
  }

  mapMoneyPartnerCodes(files, checks)
  addNaturalDebtFlowChecks(files, checks)

  const inventoryRows = rowsOf(files, 'inventory')
  const inventoryByCode = new Map(inventoryRows.map((row) => [text(row.normalized.product_code), row]))
  for (const [journalKind, movementField, codePrefix] of [
    ['purchase_journal', 'receipt_quantity', 'PURCHASE'],
    ['sales_journal', 'issue_quantity', 'SALES'],
  ] as const) {
    const aggregate = new Map<string, number>()
    for (const row of rowsOf(files, journalKind)) {
      const productCode = text(row.normalized.product_code)
      aggregate.set(productCode, (aggregate.get(productCode) ?? 0) + numeric(row.normalized.quantity))
    }
    for (const [productCode, quantity] of aggregate) {
      const inventoryRow = inventoryByCode.get(productCode)
      checks.push(check(
        `${codePrefix}_TO_NXT_${productCode}`,
        `${FILE_KIND_LABELS[journalKind]} → NXT ${productCode}`,
        inventoryRow ? numeric(inventoryRow.normalized[movementField]) : null,
        quantity,
        0.00001,
        inventoryRow ? undefined : 'Mã hàng không có trong file NXT',
      ))
    }
  }

  const purchaseValues = new Map<string, number>()
  for (const row of rowsOf(files, 'purchase_journal')) {
    const productCode = text(row.normalized.product_code)
    purchaseValues.set(
      productCode,
      (purchaseValues.get(productCode) ?? 0) + numeric(row.normalized.amount),
    )
  }
  for (const [productCode, value] of purchaseValues) {
    const inventoryRow = inventoryByCode.get(productCode)
    checks.push(check(
      `PURCHASE_VALUE_TO_NXT_${productCode}`,
      `Giá trị Nhật ký mua → NXT ${productCode}`,
      inventoryRow ? numeric(inventoryRow.normalized.receipt_value) : null,
      value,
      1,
      inventoryRow ? undefined : 'Mã hàng không có trong file NXT',
    ))
  }

  const errorCount = checks.filter((item) => item.status === 'failed').length
  const warningCount = checks.filter((item) => item.status === 'warning').length
  return {
    files: files.map((file) => ({
      filename: file.filename,
      kind: file.kind,
      sheetName: file.sheetName,
      rowCount: file.rows.length,
      sha256: file.sha256,
    })),
    checks,
    totalRows: files.reduce((sum, file) => sum + file.rows.length, 0),
    errorCount,
    warningCount,
    readyToApprove: errorCount === 0,
  }
}
