/**
 * Parser sao kê ngân hàng Techcombank (Business Banking).
 *
 * Techcom có thể xuất XML qua iBank/Techcom Connect với cấu trúc:
 *
 *   <Statement>
 *     <Account>
 *       <AccountNumber>123456789</AccountNumber>
 *       <Currency>VND</Currency>
 *     </Account>
 *     <Transactions>
 *       <Transaction>
 *         <TransactionDate>2024-05-26</TransactionDate>
 *         <Description>...</Description>
 *         <DebitAmount>0</DebitAmount>     ← ghi nợ = chi
 *         <CreditAmount>1000000</CreditAmount> ← ghi có = thu
 *         <Balance>5000000</Balance>
 *         <Reference>TXN123</Reference>
 *       </Transaction>
 *     </Transactions>
 *   </Statement>
 *
 * Parser này cố gắng "lỏng" — match nhiều tên tag khác nhau vì Techcom
 * có 3-4 format XML khác nhau tùy version iBank. Nếu không match, sẽ
 * trả về warnings để user biết cần điều chỉnh manual.
 */

import { XMLParser } from 'fast-xml-parser'

export interface ParsedBankTxn {
  txn_date:        string          // YYYY-MM-DD ngày giao dịch
  txn_time:        string | null   // HH:MM:SS giờ KH thực hiện (nếu có)
  description:     string          // diễn giải thuần (đã tách khỏi datetime + ref)
  reference:       string | null   // số bút toán (FT...)
  debit:           number           // số tiền ghi nợ (chi ra)
  credit:          number           // số tiền ghi có (thu vào)
  fee:             number           // phí — lãi
  vat:             number           // thuế
  balance:         number | null    // số dư sau giao dịch
  counterpart:     string | null    // tên đối ứng / NH đối tác
}

/** Tổng từ metadata file (để đối chiếu) */
export interface BankStatementSummary {
  opening_balance: number | null
  closing_balance: number | null
  total_debit:     number | null
  total_credit:    number | null
  total_fee:       number | null
  total_vat:       number | null
  debit_count:     number | null
  credit_count:    number | null
}

export interface ParsedBankStatement {
  account_number: string | null
  currency:       string
  txns:           ParsedBankTxn[]
  summary:        BankStatementSummary
  raw_filename?:  string
  warnings:       string[]
}

const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  parseTagValue:       true,
  trimValues:          true,
  isArray: (tag) => ['Transaction', 'transaction', 'Txn', 'Row', 'Item'].includes(tag),
})

function num(v: unknown): number {
  if (v == null || v === '') return 0
  // Loại bỏ dấu phẩy ngăn cách (Techcom hay xuất "1,000,000")
  const cleaned = String(v).replace(/,/g, '').replace(/\s/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/** Chuẩn hóa ngày về YYYY-MM-DD */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  // YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return null
}

/** Tìm transaction array trong nhiều format khác nhau */
function findTxnList(root: any): any[] {
  const candidates = [
    root?.Statement?.Transactions?.Transaction,
    root?.statement?.transactions?.transaction,
    root?.Statement?.Txns?.Txn,
    root?.Statement?.Detail?.Row,
    root?.BankStatement?.Transactions?.Transaction,
    root?.Document?.BkToCstmrStmt?.Stmt?.Ntry,  // ISO 20022 camt.053
    root?.Transactions?.Transaction,
    root?.transactions?.transaction,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c
    if (c && typeof c === 'object') return [c]
  }
  return []
}

/** Tìm account info */
function findAccount(root: any): { number: string | null; currency: string } {
  const number =
    root?.Statement?.Account?.AccountNumber ??
    root?.Statement?.AccountNumber ??
    root?.statement?.account?.accountNumber ??
    root?.BankStatement?.AccountNumber ??
    null
  const currency =
    root?.Statement?.Account?.Currency ??
    root?.Statement?.Currency ??
    root?.BankStatement?.Currency ??
    'VND'
  return { number: str(number), currency: String(currency || 'VND').toUpperCase() }
}

/** Extract 1 txn từ object */
function parseTxnNode(t: any): ParsedBankTxn | null {
  // Date — thử nhiều tên
  const rawDate =
    t.TransactionDate ?? t.TxnDate ?? t.Date ?? t.PostingDate ?? t.ValueDate ??
    t.transactionDate ?? t.date ?? t.NgayGiaoDich ?? t.Ngay ?? null
  const date = normalizeDate(str(rawDate))
  if (!date) return null

  const description =
    t.Description ?? t.Narrative ?? t.Memo ?? t.Detail ?? t.Remark ??
    t.description ?? t.NoiDung ?? t.DienGiai ?? ''

  const debit =
    num(t.DebitAmount ?? t.Debit ?? t.DR ?? t.AmountDebit ?? t.GhiNo ?? t.SoTienGhiNo ?? 0)
  const credit =
    num(t.CreditAmount ?? t.Credit ?? t.CR ?? t.AmountCredit ?? t.GhiCo ?? t.SoTienGhiCo ?? 0)

  // Một số format gộp 1 cột Amount + Type (D/C)
  if (debit === 0 && credit === 0 && (t.Amount || t.amount)) {
    const amt  = num(t.Amount ?? t.amount)
    const type = String(t.Type ?? t.type ?? t.DC ?? '').toUpperCase()
    if (type.startsWith('D') || type.includes('NỢ') || type.includes('NO')) {
      return {
        txn_date: date, txn_time: null,
        description: String(description).trim(),
        reference: str(t.Reference ?? t.RefNo ?? t.TxnId ?? null),
        debit: amt, credit: 0, fee: 0, vat: 0,
        balance: num(t.Balance ?? t.balance) || null,
        counterpart: str(t.CounterAccount ?? t.RelatedAccount ?? null),
      }
    } else {
      return {
        txn_date: date, txn_time: null,
        description: String(description).trim(),
        reference: str(t.Reference ?? t.RefNo ?? t.TxnId ?? null),
        debit: 0, credit: amt, fee: 0, vat: 0,
        balance: num(t.Balance ?? t.balance) || null,
        counterpart: str(t.CounterAccount ?? t.RelatedAccount ?? null),
      }
    }
  }

  return {
    txn_date:    date, txn_time: null,
    description: String(description).trim(),
    reference:   str(t.Reference ?? t.RefNo ?? t.TxnId ?? t.transactionId ?? null),
    debit, credit, fee: 0, vat: 0,
    balance:     num(t.Balance ?? t.balance) || null,
    counterpart: str(t.CounterAccount ?? t.RelatedAccount ?? null),
  }
}

export function parseBankTechcomXml(xml: string, filename?: string): ParsedBankStatement {
  const warnings: string[] = []
  const root = parser.parse(xml)

  const acc = findAccount(root)
  const rawTxns = findTxnList(root)

  if (rawTxns.length === 0) {
    warnings.push('Không tìm thấy danh sách giao dịch (Transactions/Transaction). Kiểm tra format XML.')
  }

  const txns: ParsedBankTxn[] = []
  for (const t of rawTxns) {
    const parsed = parseTxnNode(t)
    if (parsed) txns.push(parsed)
    else warnings.push(`Bỏ qua 1 giao dịch không đọc được ngày`)
  }

  return {
    account_number: acc.number,
    currency:       acc.currency,
    txns,
    summary: { opening_balance: null, closing_balance: null, total_debit: null, total_credit: null, total_fee: null, total_vat: null, debit_count: null, credit_count: null },
    raw_filename:   filename,
    warnings,
  }
}
