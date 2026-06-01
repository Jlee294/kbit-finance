/**
 * Parser sao kê Techcombank định dạng PDF.
 *
 * Dùng `unpdf` (PDF.js for serverless) để extract text. Cấu trúc text
 * mỗi giao dịch (sau khi normalize whitespace):
 *
 *   {ord} {DD/MM/YYYY HH:MM:SS} {DD/MM/YYYY} {ref} [{bank}] [{acc}]
 *   [{counterpart}] {description} {-amount|amount} {balance}
 *
 *   Số tiền luôn có dấu phẩy ngăn cách nghìn: "-4,860,000" / "50,883,368"
 *   Số dư cuối luôn có dấu phẩy. Account number không có phẩy → an toàn.
 *
 * Chiến lược:
 *   1. Tách text thành các "transaction block" bằng regex pattern đầu txn
 *      (số thứ tự + datetime)
 *   2. Trong mỗi block, lấy 2 số "money-formatted" (có comma) cuối cùng:
 *      - Cuối = balance
 *      - Trước cuối = amount (âm = chi, dương = thu)
 *   3. txn_date = date thứ 2 trong block (DD/MM/YYYY)
 *   4. description = text giữa date2 và amount
 *   5. reference = match pattern `FT\d+` hoặc `\d{8}-\d{8}`
 *   6. counterpart = best-effort từ description
 */

import { extractText } from 'unpdf'
import type { ParsedBankStatement, ParsedBankTxn } from './bank-techcom'

export async function parseBankTechcomPdf(
  buffer: ArrayBuffer,
  filename?: string,
): Promise<ParsedBankStatement> {
  const warnings: string[] = []
  const result = await extractText(new Uint8Array(buffer), { mergePages: true })
  // unpdf returns text as string when mergePages=true, else array
  const raw: string = typeof result.text === 'string'
    ? result.text
    : (result.text as unknown as string[]).join(' ')
  return parsePdfText(raw, filename, warnings)
}

/** Logic parser thuần — tách riêng để test dễ */
export function parsePdfText(
  raw: string,
  filename: string | undefined,
  warnings: string[],
): ParsedBankStatement {
  // Normalize: gộp whitespace, strip page header lặp + footer
  // Techcom PDF có header column "Số thứ tự/ Order number ... Số dư/ Running balance"
  // lặp ở mỗi page → cắt mid-transaction. Strip để text liền mạch.
  const text = raw
    .replace(/\s+/g, ' ')
    // Strip column header lặp trên mỗi page: "Số thứ tự/...Running balance"
    .replace(/Số thứ tự\/[\s\S]*?Running balance/g, ' ')
    // Strip footer của mỗi page: timestamp + page number "01/06/2026 15:17:09 1/4Phiếu"
    // Anchor bằng lookahead "Phiếu" hoặc "|" để KHÔNG match nhầm txn data
    // (txn có "31/05/2026 02:00:20 30/05/2026" mà regex có thể backtrack thành "30/0")
    .replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\d{1,2}\/\d{1,2}(?=Phiếu|\|)/g, ' ')
    // Strip phrase "Phiếu này được in..." → "...sign and seal" (Vietnamese + English)
    .replace(/Phiếu này được in[\s\S]*?(?:and not to sign and seal|đóng dấu)/g, ' ')
    // Strip residual "| Printed on:Ngày giờ in/"
    .replace(/\|?\s*Printed on:\s*Ngày giờ in\/?/g, ' ')
    // Strip "Trang X/Y" / "Page X of Y"
    .replace(/Trang\s+\d+\s*\/\s*\d+/g, ' ')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // ── Header info ─────────────────────────────────────────────────────────
  const accMatch = text.match(/(?:Số tài khoản|Account number)\s*\/?\s*(\d{6,20})/i)
  const currMatch = text.match(/(?:Đơn vị tiền tệ|Loại tiền|Currency)\s*\/?\s*(VND|USD|KRW|EUR|JPY)/i)

  // ── Tìm vị trí bắt đầu của mỗi giao dịch ────────────────────────────────
  // Pattern: ord + datetime "1 31/05/2026 02:00:20"
  // Dùng \b + post-filter để loại bỏ "692" trong "57,866,692" (digit/comma trước)
  const txnStartRe = /\b(\d{1,3})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})\s/g
  const starts: number[] = []
  const ords: number[] = []
  let m: RegExpExecArray | null
  while ((m = txnStartRe.exec(text)) !== null) {
    // Post-filter: bỏ qua nếu ký tự ngay trước ord là digit hoặc comma
    // (case: "57,866,692" có "692" được match → loại)
    const prev = m.index > 0 ? text[m.index - 1] : ''
    if (prev && /[\d,]/.test(prev)) continue
    starts.push(m.index)
    ords.push(Number(m[1]))
  }

  if (starts.length === 0) {
    warnings.push('Không tìm thấy giao dịch nào trong PDF (không match pattern ord + datetime)')
    return {
      account_number: accMatch?.[1] ?? null,
      currency: currMatch?.[1]?.toUpperCase() ?? 'VND',
      txns: [],
      raw_filename: filename,
      warnings,
    }
  }

  // ── Parse từng block ────────────────────────────────────────────────────
  const txns: ParsedBankTxn[] = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]
    const end = starts[i + 1] ?? text.length
    const block = text.slice(start, end).trim()

    // Date giao dịch (date thứ 2 trong block — sau datetime đầu)
    // Datetime đầu: "31/05/2026 02:00:20" → bỏ
    // Date 2: chỉ "DD/MM/YYYY" không kèm time
    const afterFirstDt = block.replace(/^(\d+)\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s*/, '')
    const date2Match = afterFirstDt.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!date2Match) {
      warnings.push(`Bỏ qua block ${i + 1}: không tìm thấy ngày giao dịch`)
      continue
    }
    const txn_date = `${date2Match[3]}-${date2Match[2]}-${date2Match[1]}`

    // ── Lấy 2 số cuối block: {amount} {balance}
    // - balance: PHẢI có dấu phẩy (số dư bank thường ≥ 1000)
    // - amount: có thể có hoặc không phẩy (lãi suất 830đ không có phẩy)
    // - amount có thể âm: "-4,860,000 50,881,652"
    //
    // Strategy: tìm LAST occurrence của balance pattern (có phẩy), sau đó
    // amount = số ngay trước. Cho phép có text sau balance (footer leftover).
    const balRe = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g
    let lastBal: RegExpExecArray | null = null
    let bm: RegExpExecArray | null
    while ((bm = balRe.exec(block)) !== null) lastBal = bm
    if (!lastBal) {
      warnings.push(`Bỏ qua block ${i + 1}: không tìm thấy số dư (balance phải có dấu phẩy)`)
      continue
    }

    const balanceRaw = lastBal[1]
    const balance    = Number(balanceRaw.replace(/,/g, ''))

    // amount = số ngay trước balance (có thể có/không phẩy, có thể âm)
    const beforeBal = block.slice(0, lastBal.index).trimEnd()
    const amountMatch = beforeBal.match(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*$/)
    if (!amountMatch) {
      warnings.push(`Bỏ qua block ${i + 1}: không có số tiền trước balance`)
      continue
    }

    const amountRaw = amountMatch[1]
    const amountVal = Number(amountRaw.replace(/,/g, ''))
    const amountIdx = beforeBal.length - amountRaw.length

    let debit = 0, credit = 0
    if (amountVal < 0) debit = Math.abs(amountVal)
    else credit = amountVal

    // ── Description + reference + counterpart ──
    // Lấy phần text giữa date2 và amount
    const date2End = block.indexOf(date2Match[0]) + date2Match[0].length
    const midText = block.slice(date2End, amountIdx).trim()

    // Reference: match đầu "FT26149053029205" hoặc "88896368-20260531"
    let reference: string | null = null
    const refRe = /^(FT\d+[\s\-]*\d*|\d{8}\s*-\s*\d{6,12})/i
    const refMatch = midText.match(refRe)
    if (refMatch) {
      reference = refMatch[1].replace(/\s+/g, '')
    }

    // Sau khi tách reference, phần còn lại = bank + acc + counterpart + description
    let remaining = refMatch ? midText.slice(refMatch[0].length).trim() : midText

    // Counterpart name: heuristic — chuỗi UPPERCASE liên tục thường là tên đối tác
    // Vd: "NGOAI THUONG VN (VCB) 1051669619 CTCP DAUTU THUONG MAI VA DICH VU NHI GIA KBIT thanh toan phi..."
    // Tìm chuỗi UPPER có ≥3 từ liên tục
    let counterpart: string | null = null
    // Pattern: account number (8-15 digits) followed by UPPERCASE words
    const accThenName = remaining.match(/\b\d{6,16}\s+([A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ][A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ\s]{5,80})/)
    if (accThenName) {
      counterpart = accThenName[1].trim().replace(/\s+/g, ' ')
      // Bỏ counterpart khỏi remaining để description sạch
      remaining = remaining.replace(accThenName[0], '').trim()
    } else {
      // Fallback: lấy chuỗi UPPERCASE >5 chữ đầu tiên
      const upperOnly = remaining.match(/\b([A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]{2,}(?:\s+[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]{2,}){2,})/)
      if (upperOnly) counterpart = upperOnly[1].trim()
    }

    // Description: phần text còn lại, bỏ tiền tố là số (account number)
    const description = remaining.replace(/^\s*\d{6,16}\s+/, '').trim().slice(0, 500)

    txns.push({
      txn_date,
      description,
      reference,
      debit,
      credit,
      balance,
      counterpart,
    })
  }

  return {
    account_number: accMatch?.[1] ?? null,
    currency: (currMatch?.[1]?.toUpperCase() ?? 'VND'),
    txns,
    raw_filename: filename,
    warnings,
  }
}
