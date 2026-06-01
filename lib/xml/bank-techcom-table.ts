/**
 * Parser sao kê Techcombank định dạng Excel (.xlsx/.xls) hoặc CSV.
 *
 * Techcom Business iBank xuất file sao kê có cấu trúc đại khái:
 *   - Vài dòng đầu là header (logo, tên TK, kỳ sao kê, số dư đầu/cuối)
 *   - 1 dòng là tiêu đề cột (Số tham chiếu / Ngày / Diễn giải / Nợ / Có / Số dư)
 *   - Các dòng tiếp theo là giao dịch
 *
 * Parser này tự "phát hiện" dòng tiêu đề bằng cách tìm dòng đầu tiên
 * chứa các keyword: ngày, diễn giải, ghi nợ, ghi có, số tiền…
 * → sau dòng đó là data.
 *
 * Tên cột match nhiều biến thể (TIẾNG VIỆT + ENG) để chịu được các
 * version khác nhau của Techcom.
 */

import * as XLSX from 'xlsx'
import type { ParsedBankStatement, ParsedBankTxn } from './bank-techcom'

// ── Aliases tên cột ─────────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  date: [
    'ngay giao dich', 'ngay gd', 'ngay', 'ngay hach toan', 'ngay hieu luc',
    'transaction date', 'date', 'posting date', 'value date',
  ],
  description: [
    'dien giai', 'noi dung', 'noi dung giao dich', 'mo ta',
    'description', 'narrative', 'detail', 'remark', 'memo',
  ],
  debit: [
    'ghi no', 'no', 'so tien ghi no', 'chi', 'rut',
    'debit', 'dr', 'debit amount', 'amount debit', 'withdrawal',
  ],
  credit: [
    'ghi co', 'co', 'so tien ghi co', 'thu', 'nop',
    'credit', 'cr', 'credit amount', 'amount credit', 'deposit',
  ],
  balance: [
    'so du', 'so du cuoi', 'so du sau gd',
    'balance', 'running balance', 'closing balance',
  ],
  reference: [
    'so tham chieu', 'so giao dich', 'so chung tu', 'ma giao dich',
    'reference', 'ref', 'ref no', 'transaction id', 'txn id',
  ],
  amount: [
    'so tien', 'gia tri',
    'amount', 'value',
  ],
  account: [
    'tai khoan', 'so tai khoan', 'tai khoan doi ung', 'tk doi ung',
    'account', 'account number', 'counterparty account',
  ],
}

/** Chuẩn hóa: lowercase, bỏ dấu tiếng việt, bỏ khoảng trắng dư */
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Trả về key trong ALIASES nếu cell match */
function matchHeader(cell: string): keyof typeof ALIASES | null {
  const n = norm(cell)
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => n === a || n.includes(a))) return key as keyof typeof ALIASES
  }
  return null
}

/** Đọc số an toàn — chịu được "1,000,000" hoặc "1.000.000" hoặc " 50,000 " */
function num(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).replace(/\s/g, '')
  // Detect format: nếu có cả "," và "." → "," là nghìn (US format); ngược lại "," là thập phân (VN)
  let cleaned = s
  if (s.includes(',') && s.includes('.')) {
    cleaned = s.replace(/,/g, '')          // 1,000,000.50 → 1000000.50
  } else if (s.includes(',') && !s.includes('.')) {
    // Có thể là VN ('1.234,56') — nhưng không có dot. Hoặc thousands "1,000". Decide by structure.
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = s.replace(',', '.')   // 12,5 → 12.5
    } else {
      cleaned = s.replace(/,/g, '')   // 1,000,000 → 1000000
    }
  } else {
    cleaned = s.replace(/\./g, '')    // 1.000.000 → 1000000 (VN có thể dùng dấu chấm làm thousands)
    // Nhưng nếu chỉ 1 dot và phần sau ≤ 2 ký tự, có thể là thập phân
    const m = s.match(/^(-?\d+)\.(\d{1,2})$/)
    if (m) cleaned = s
  }
  const n = Number(cleaned)
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
  // Excel epoch: 1899-12-30 (có bug ngày 1900-02-29 nên dùng 1899-12-30)
  const ms = (serial - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return excelSerialToDate(v)
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  // Có thể là 'YYYY-MM-DDTHH:MM:SS'
  const isoT = s.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoT) return `${isoT[1]}-${isoT[2]}-${isoT[3]}`
  return null
}

// ── Parser chính ─────────────────────────────────────────────────────────────

interface HeaderMap {
  date?:        number
  description?: number
  debit?:       number
  credit?:      number
  amount?:      number
  balance?:     number
  reference?:   number
}

/** Tìm dòng tiêu đề + map cột. Trả về index dòng header + mapping. */
function findHeader(rows: any[][]): { headerIdx: number; map: HeaderMap } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] ?? []
    const map: HeaderMap = {}
    let matched = 0
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell == null) continue
      const key = matchHeader(String(cell))
      if (key && map[key as keyof HeaderMap] == null) {
        map[key as keyof HeaderMap] = c
        matched++
      }
    }
    // Cần ít nhất Date + (Debit hoặc Credit hoặc Amount)
    if (map.date != null && (map.debit != null || map.credit != null || map.amount != null)) {
      return { headerIdx: i, map }
    }
  }
  return null
}

/** Tìm số tài khoản trong các dòng trên cùng (trước header) */
function findAccountNumber(rows: any[][], headerIdx: number): string | null {
  const re = /(?:tai khoan|account|stk|so tk|so tai khoan)[^a-z0-9]*([0-9]{6,20})/i
  for (let i = 0; i < headerIdx; i++) {
    const joined = (rows[i] ?? []).map(c => String(c ?? '')).join(' ')
    const normalized = norm(joined)
    const m = normalized.match(re)
    if (m) return m[1]
    // Hoặc chỉ là 1 chuỗi số 10-20 chữ số
    const just = joined.match(/\b(\d{10,20})\b/)
    if (just) return just[1]
  }
  return null
}

/** Tìm currency (VND / USD / KRW) */
function findCurrency(rows: any[][], headerIdx: number): string {
  for (let i = 0; i < headerIdx; i++) {
    const joined = (rows[i] ?? []).map(c => String(c ?? '')).join(' ').toUpperCase()
    if (/\bUSD\b/.test(joined)) return 'USD'
    if (/\bKRW\b/.test(joined)) return 'KRW'
    if (/\bEUR\b/.test(joined)) return 'EUR'
  }
  return 'VND'
}

function rowsToTxns(rows: any[][], header: { headerIdx: number; map: HeaderMap }): ParsedBankTxn[] {
  const { headerIdx, map } = header
  const out: ParsedBankTxn[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.every(c => c == null || String(c).trim() === '')) continue

    const dateCell = map.date != null ? row[map.date] : null
    const txnDate  = normalizeDate(dateCell)
    if (!txnDate) continue   // skip dòng không phải txn (subtotal, footer…)

    let debit  = map.debit  != null ? num(row[map.debit])  : 0
    let credit = map.credit != null ? num(row[map.credit]) : 0

    // Nếu chỉ có cột Amount + dòng nào âm = chi, dương = thu
    if (debit === 0 && credit === 0 && map.amount != null) {
      const amt = num(row[map.amount])
      if (amt < 0) debit = -amt
      else credit = amt
    }

    if (debit === 0 && credit === 0) continue  // không có số tiền → bỏ

    const description = map.description != null ? String(row[map.description] ?? '').trim() : ''
    const reference   = map.reference   != null ? str(row[map.reference]) : null
    const balance     = map.balance     != null ? num(row[map.balance]) : null

    out.push({
      txn_date:    txnDate,
      description,
      reference,
      debit,
      credit,
      balance,
      counterpart: null,
    })
  }
  return out
}

// ── Public API ──────────────────────────────────────────────────────────────

export function parseBankExcelBuffer(buffer: ArrayBuffer, filename?: string): ParsedBankStatement {
  const warnings: string[] = []
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) {
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings: ['File rỗng'] }
  }
  const ws = wb.Sheets[firstSheetName]
  // header: 1 = lấy raw rows (array of arrays), blankrows: bỏ dòng rỗng giữa header bằng cách dùng false sau
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]

  const header = findHeader(rows)
  if (!header) {
    warnings.push('Không tìm thấy dòng tiêu đề (Ngày / Diễn giải / Nợ / Có…). Kiểm tra format file.')
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings }
  }

  const txns = rowsToTxns(rows, header)
  const account = findAccountNumber(rows, header.headerIdx)
  const currency = findCurrency(rows, header.headerIdx)

  if (txns.length === 0) warnings.push('Đọc được header nhưng không có dòng giao dịch nào')

  return {
    account_number: account,
    currency,
    txns,
    raw_filename: filename,
    warnings,
  }
}

export function parseBankCsvText(text: string, filename?: string): ParsedBankStatement {
  // Dùng XLSX để parse CSV (hỗ trợ quoted strings + escape)
  const wb = XLSX.read(text, { type: 'string', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]
  const warnings: string[] = []
  const header = findHeader(rows)
  if (!header) {
    warnings.push('Không tìm thấy dòng tiêu đề trong CSV. Cấu trúc lạ?')
    return { account_number: null, currency: 'VND', txns: [], raw_filename: filename, warnings }
  }
  return {
    account_number: findAccountNumber(rows, header.headerIdx),
    currency:       findCurrency(rows, header.headerIdx),
    txns:           rowsToTxns(rows, header),
    raw_filename:   filename,
    warnings,
  }
}
