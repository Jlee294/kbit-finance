/**
 * Parser sao kê Techcombank định dạng Excel (.xlsx/.xls) hoặc CSV.
 *
 * Format thực tế từ Techcom Business "Transaction History" / Truy vấn giao dịch:
 *
 *   Dòng 1-11: METADATA
 *     "So tai khoan/Account number,88896368,..."
 *     "Ten tai khoan/Account name,KBIT...,..."
 *     "Loai tien/Currency,VND,..."
 *     ...
 *
 *   Dòng 12: HEADER 13 cột
 *     "Ngay KH thuc hien/Requesting date"       ← datetime YYYY-MM-DD HH:MM:SS
 *     "Ngay giao dich/Transaction date"         ← date YYYY-MM-DD  (cột chính)
 *     "So but toan/Reference number"
 *     "Ngan hang doi tac/Remitter's bank"
 *     "Tai khoan dich/Remitter's account number"
 *     "Tên tài khoản đối ứng/Remitter's account name"  ← để match KH/NCC
 *     "Dien giai/Description"
 *     "No/Debit"                                ← số ÂM (-4860000)
 *     "Co/Credit"                               ← số dương
 *     "Phi - Lai/Fee - Interest"
 *     "Thue/VAT"
 *     "So du/Running balance"
 *
 *   Dòng 13+: DATA
 *   Dòng cuối: "Phieu nay duoc in tu he thong..."
 */

import * as XLSX from 'xlsx'
import type { ParsedBankStatement, ParsedBankTxn } from './bank-techcom'

// ── Aliases tên cột (sắp xếp theo PRIORITY — match cụ thể trước) ─────────────
// Cùng 1 nhóm key thì alias cụ thể (specific) phải đặt TRƯỚC alias chung.

interface ColMatch {
  key: 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance' | 'reference' | 'counterpart_account' | 'counterpart_name' | 'counterpart_bank'
  patterns: string[]      // ưu tiên patterns đầu danh sách
  priority: number        // số càng nhỏ = ưu tiên càng cao (chọn trước khi conflict)
}

const COLUMN_RULES: ColMatch[] = [
  // DATE — "Ngày giao dịch" / "Transaction date" priority hơn "Ngày KH thực hiện" / "ngay"
  { key: 'date',                priority: 1,  patterns: ['ngay giao dich', 'transaction date', 'posting date', 'value date', 'ngay hieu luc', 'ngay hach toan'] },
  { key: 'date',                priority: 5,  patterns: ['ngay kh thuc hien', 'requesting date', 'ngay gd', 'ngay'] },

  // DESCRIPTION
  { key: 'description',         priority: 1,  patterns: ['dien giai', 'noi dung giao dich', 'noi dung', 'mo ta', 'description', 'narrative', 'memo', 'remark', 'detail'] },

  // DEBIT (NỢ) — Techcom là số âm. Match "no" trước, nhưng "no" rất ngắn nên cần check kỹ
  { key: 'debit',               priority: 1,  patterns: ['so tien ghi no', 'amount debit', 'debit amount', 'ghi no'] },
  { key: 'debit',               priority: 5,  patterns: ['debit', 'no/debit', 'dr', 'no'] },

  // CREDIT (CÓ)
  { key: 'credit',              priority: 1,  patterns: ['so tien ghi co', 'amount credit', 'credit amount', 'ghi co'] },
  { key: 'credit',              priority: 5,  patterns: ['credit', 'co/credit', 'cr', 'co'] },

  // AMOUNT (gộp — chỉ dùng khi không có debit/credit riêng)
  { key: 'amount',              priority: 10, patterns: ['so tien', 'amount', 'value'] },

  // BALANCE
  { key: 'balance',             priority: 1,  patterns: ['so du', 'running balance', 'closing balance', 'balance'] },

  // REFERENCE
  { key: 'reference',           priority: 1,  patterns: ['so but toan', 'reference number', 'so tham chieu', 'so giao dich', 'so chung tu', 'reference', 'ref no'] },

  // COUNTERPART NAME — quan trọng để gợi ý KH/NCC
  { key: 'counterpart_name',    priority: 1,  patterns: ['ten tai khoan doi ung', "remitter's account name", 'ten doi ung', 'beneficiary name', 'remitter name'] },
  { key: 'counterpart_account', priority: 1,  patterns: ['tai khoan dich', "remitter's account number", 'tai khoan doi ung', 'tk doi ung', 'counterparty account'] },
  { key: 'counterpart_bank',    priority: 1,  patterns: ['ngan hang doi tac', "remitter's bank", 'partner bank'] },
]

/** Bỏ dấu tiếng Việt + lowercase + bỏ khoảng trắng dư */
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[\/_\-,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escape regex special chars */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Match header cell → trả về { key, priority } hoặc null
 *
 * Dùng \b word boundary để tránh match nhầm:
 *   "tai khoan dich account number" KHÔNG được match "co" (trong "account")
 *   "co credit" PHẢI match "co" (đầu chuỗi)
 */
function matchColumn(cell: string): { key: ColMatch['key']; priority: number } | null {
  const n = norm(cell)
  let best: { key: ColMatch['key']; priority: number } | null = null
  for (const rule of COLUMN_RULES) {
    for (const p of rule.patterns) {
      const re = new RegExp(`\\b${escapeRe(p)}\\b`)
      if (re.test(n)) {
        if (!best || rule.priority < best.priority) {
          best = { key: rule.key, priority: rule.priority }
        }
        break
      }
    }
  }
  return best
}

/** Số: chấp nhận "1,000,000", "1.000.000", "-4860000", "" */
function num(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = String(v).trim().replace(/\s/g, '')
  if (s === '' || s === '-') return 0
  // Có cả "," và "." → format US (",": thousands; ".": decimal)
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '')
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',')
    // Nếu phần sau cùng ≤ 2 ký tự → decimal VN
    if (parts.length === 2 && parts[parts.length - 1].length <= 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes('.')) {
    // Có thể là VN thousands "1.000.000" hoặc US decimal "1234.50"
    const parts = s.split('.')
    if (parts.length > 2) {
      // 3+ phần → thousands
      s = s.replace(/\./g, '')
    } else if (parts.length === 2 && parts[1].length === 3 && !s.startsWith('0.')) {
      // "1.000" — có thể là thousands hoặc decimal. Heuristic: nếu phần trước ngắn (≤3) thì decimal.
      // Để an toàn, giữ nguyên — Number() tự xử lý.
    }
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/** Excel serial date → YYYY-MM-DD */
function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null
  const ms = (serial - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function normalizeDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return excelSerialToDate(v)
  const s = String(v).trim()
  // YYYY-MM-DD hoặc YYYY-MM-DDTHH:MM:SS hoặc YYYY-MM-DD HH:MM:SS
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // DD/MM/YYYY hoặc DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return null
}

// ── Header detection ─────────────────────────────────────────────────────────

interface HeaderMap {
  date?:                number
  description?:         number
  debit?:               number
  credit?:              number
  amount?:              number
  balance?:             number
  reference?:           number
  counterpart_name?:    number
  counterpart_account?: number
  counterpart_bank?:    number
}

function findHeader(rows: any[][]): { headerIdx: number; map: HeaderMap } | null {
  // Techcom Excel có letterhead dài (~20 dòng) trước header, CSV ngắn hơn → quét 50
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i] ?? []
    const map: HeaderMap = {}
    // Track priority per key — nếu có 2 cell match cùng key, chọn priority thấp hơn
    const priorityPerKey: Partial<Record<keyof HeaderMap, number>> = {}

    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell == null) continue
      const match = matchColumn(String(cell))
      if (!match) continue
      const existing = priorityPerKey[match.key]
      if (existing == null || match.priority < existing) {
        map[match.key] = c
        priorityPerKey[match.key] = match.priority
      }
    }

    // Cần ít nhất Date + (Debit / Credit / Amount)
    if (map.date != null && (map.debit != null || map.credit != null || map.amount != null)) {
      return { headerIdx: i, map }
    }
  }
  return null
}

function findAccountNumber(rows: any[][], headerIdx: number): string | null {
  // Format Techcom Excel: cell "Số tài khoản/Account number" → next cell "88896368"
  // CSV: "So tai khoan/Account number,88896368,..."
  for (let i = 0; i < headerIdx; i++) {
    const row = rows[i] ?? []
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '')
      if (!cell) continue
      const n = norm(cell)
      if (n.includes('so tai khoan') || n.includes('account number')) {
        // Tìm cell tiếp theo trong cùng row có số
        for (let cc = c + 1; cc < row.length; cc++) {
          const next = String(row[cc] ?? '').trim()
          if (/^\d{6,20}$/.test(next)) return next
        }
      }
    }
  }
  // Fallback
  for (let i = 0; i < headerIdx; i++) {
    const joined = (rows[i] ?? []).map(c => String(c ?? '')).join(' ')
    const m = joined.match(/\b(\d{8,20})\b/)
    if (m) return m[1]
  }
  return null
}

function findCurrency(rows: any[][], headerIdx: number): string {
  for (let i = 0; i < headerIdx; i++) {
    const row = rows[i] ?? []
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '')
      if (norm(cell).includes('loai tien') || /currency/i.test(cell)) {
        // Lấy cell tiếp theo
        for (let cc = c + 1; cc < row.length; cc++) {
          const next = String(row[cc] ?? '').trim().toUpperCase()
          if (/^(VND|USD|KRW|EUR|JPY|GBP)$/.test(next)) return next
        }
      }
    }
    const joined = (row).map(c => String(c ?? '')).join(' ').toUpperCase()
    if (/\bUSD\b/.test(joined)) return 'USD'
    if (/\bKRW\b/.test(joined)) return 'KRW'
  }
  return 'VND'
}

function rowsToTxns(rows: any[][], header: { headerIdx: number; map: HeaderMap }): ParsedBankTxn[] {
  const { headerIdx, map } = header
  const out: ParsedBankTxn[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.every(c => c == null || String(c).trim() === '')) continue

    // Skip footer "Phieu nay duoc in tu..." / "Ngay gio in..."
    const firstCell = String(row[0] ?? '').toLowerCase()
    if (firstCell.includes('phieu nay duoc in') ||
        firstCell.includes('ngay gio in') ||
        firstCell.includes('printed on') ||
        firstCell.includes('this paper')) continue

    const dateCell = map.date != null ? row[map.date] : null
    const txnDate = normalizeDate(dateCell)
    if (!txnDate) continue

    // Lấy ABS để chịu được Techcom (debit là số âm) và VCB (debit là số dương)
    let debit  = map.debit  != null ? Math.abs(num(row[map.debit]))  : 0
    let credit = map.credit != null ? Math.abs(num(row[map.credit])) : 0

    // Fallback: chỉ có cột Amount (signed) — âm = chi, dương = thu
    if (debit === 0 && credit === 0 && map.amount != null) {
      const amt = num(row[map.amount])
      if (amt < 0) debit = -amt
      else if (amt > 0) credit = amt
    }

    if (debit === 0 && credit === 0) continue

    const description = map.description != null ? String(row[map.description] ?? '').trim() : ''
    const reference   = map.reference   != null ? str(row[map.reference]) : null
    const balance     = map.balance     != null ? num(row[map.balance]) : null

    // Counterpart: ưu tiên name, fallback bank
    let counterpart: string | null = null
    if (map.counterpart_name != null) counterpart = str(row[map.counterpart_name])
    if (!counterpart && map.counterpart_bank != null) counterpart = str(row[map.counterpart_bank])

    out.push({
      txn_date:    txnDate,
      description,
      reference,
      debit,
      credit,
      balance,
      counterpart,
    })
  }
  return out
}

// ── Public API ──────────────────────────────────────────────────────────────

export function parseBankExcelBuffer(buffer: ArrayBuffer, filename?: string): ParsedBankStatement {
  const warnings: string[] = []
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: false, cellText: false })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) {
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings: ['File rỗng / không có sheet'] }
  }
  const ws = wb.Sheets[firstSheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]

  const header = findHeader(rows)
  if (!header) {
    warnings.push(`Không tìm thấy dòng tiêu đề. File có ${rows.length} dòng. 5 dòng đầu: ${rows.slice(0, 5).map(r => r.slice(0, 3).join('|')).join(' / ')}`)
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings }
  }

  const txns = rowsToTxns(rows, header)
  const account = findAccountNumber(rows, header.headerIdx)
  const currency = findCurrency(rows, header.headerIdx)

  if (txns.length === 0) {
    warnings.push(`Đọc được header (dòng ${header.headerIdx + 1}) nhưng không có giao dịch hợp lệ. Kiểm tra format ngày.`)
  }

  return {
    account_number: account,
    currency,
    txns,
    raw_filename: filename,
    warnings,
  }
}

export function parseBankCsvText(text: string, filename?: string): ParsedBankStatement {
  const wb = XLSX.read(text, { type: 'string', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]
  const warnings: string[] = []
  const header = findHeader(rows)
  if (!header) {
    warnings.push(`Không tìm thấy dòng tiêu đề trong CSV. File có ${rows.length} dòng.`)
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings }
  }
  const txns = rowsToTxns(rows, header)
  if (txns.length === 0) {
    warnings.push(`Đọc được header dòng ${header.headerIdx + 1} nhưng không có giao dịch hợp lệ.`)
  }
  return {
    account_number: findAccountNumber(rows, header.headerIdx),
    currency:       findCurrency(rows, header.headerIdx),
    txns,
    raw_filename:   filename,
    warnings,
  }
}
