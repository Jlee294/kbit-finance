/**
 * Parser hóa đơn điện tử theo Thông tư 78/2021/TT-BTC (chuẩn quốc gia VN).
 *
 * File XML thường có cấu trúc:
 *   <HDon>
 *     <DLHDon>
 *       <TTChung>...</TTChung>
 *       <NDHDon>
 *         <NBan>...</NBan>     ← Người bán (NCC của ta)
 *         <NMua>...</NMua>     ← Người mua (công ty ta)
 *         <DSHHDVu>            ← Danh sách hàng hóa dịch vụ
 *           <HHDVu>...</HHDVu>
 *         </DSHHDVu>
 *         <TToan>...</TToan>   ← Tổng tiền
 *       </NDHDon>
 *     </DLHDon>
 *     <DSCKS>...</DSCKS>       ← Chữ ký số (bỏ qua)
 *   </HDon>
 *
 * Phần mềm xuất: Misa, Viettel, VNPT, Easyinvoice, FPT...
 */

import { XMLParser } from 'fast-xml-parser'

export interface ParsedInvoice {
  // Header
  invoice_template:   string | null   // KHMSHDon (Ký hiệu mẫu)
  invoice_symbol:     string | null   // KHHDon (Ký hiệu HĐ)
  invoice_no:         string | null   // SHDon (Số HĐ)
  invoice_date:       string | null   // NLap (Ngày lập, YYYY-MM-DD)
  invoice_type:       string | null   // THDon (Loại HĐ)

  // Người bán (NCC của ta)
  supplier_tax_code:  string | null   // MST
  supplier_name:      string | null   // Ten
  supplier_address:   string | null   // DChi
  supplier_phone:     string | null   // SDThoai

  // Người mua (công ty mình)
  buyer_tax_code:     string | null
  buyer_name:         string | null

  // Tổng tiền
  subtotal:           number           // TgTCThue (tổng tiền chưa thuế)
  vat_amount:         number           // TgTThue (tổng tiền thuế)
  grand_total:        number           // TgTTTBSo (tổng cộng)

  // Dòng hàng
  items: ParsedInvoiceItem[]

  // Diagnostic
  raw_filename?: string
  warnings: string[]
}

export interface ParsedInvoiceItem {
  no:           number            // STT
  name:         string            // THHDVu
  unit:         string | null     // DVTinh
  qty:          number             // SLuong
  unit_price:   number             // DGia
  amount:       number             // ThTien
  vat_rate:     number | null     // TSuat (%)
  vat_amount:   number             // TThue
}

const parser = new XMLParser({
  ignoreAttributes:  false,
  attributeNamePrefix: '@_',
  parseTagValue:     true,
  trimValues:        true,
  // Force arrays for repeating elements
  isArray: (tagName) => ['HHDVu', 'LTSuat'].includes(tagName),
})

/** Trả về số hoặc 0 (xử lý null/undefined/empty string an toàn) */
function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/** Tìm node đầu tiên match path, hỗ trợ namespace variant */
function pick(obj: any, path: string[]): any {
  let cur = obj
  for (const key of path) {
    if (cur == null) return null
    cur = cur[key]
  }
  return cur
}

/** Parse 1 file XML string → ParsedInvoice */
export function parseInvoiceTT78(xml: string, filename?: string): ParsedInvoice {
  const warnings: string[] = []
  const root = parser.parse(xml)

  // Tìm <HDon> / <DLHDon> — đôi khi nested khác nhau
  const hdon  = root?.HDon ?? root?.['?xml']?.HDon ?? root
  const dl    = pick(hdon, ['DLHDon']) ?? hdon

  const ttc   = pick(dl, ['TTChung']) ?? {}
  const ndh   = pick(dl, ['NDHDon']) ?? {}
  const nban  = pick(ndh, ['NBan']) ?? {}
  const nmua  = pick(ndh, ['NMua']) ?? {}
  const tToan = pick(ndh, ['TToan']) ?? {}

  // Items
  const dsHhDvu = pick(ndh, ['DSHHDVu']) ?? {}
  const hhItems = Array.isArray(dsHhDvu.HHDVu) ? dsHhDvu.HHDVu : (dsHhDvu.HHDVu ? [dsHhDvu.HHDVu] : [])

  const items: ParsedInvoiceItem[] = hhItems.map((it: any, idx: number) => ({
    no:         num(it.STT) || (idx + 1),
    name:       String(it.THHDVu ?? '').trim(),
    unit:       str(it.DVTinh),
    qty:        num(it.SLuong),
    unit_price: num(it.DGia),
    amount:     num(it.ThTien),
    vat_rate:   it.TSuat != null ? num(String(it.TSuat).replace('%', '').replace(/[^0-9.\-]/g, '')) : null,
    vat_amount: num(it.TThue),
  }))

  if (items.length === 0) warnings.push('Không tìm thấy dòng hàng (DSHHDVu/HHDVu)')

  // Date format conversion YYYY-MM-DD
  let invoiceDate: string | null = null
  const rawDate = str(ttc.NLap)
  if (rawDate) {
    // Có thể là 2024-05-26 hoặc 26/05/2024 hoặc 2024-05-26T00:00:00
    const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    const dmyMatch = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (isoMatch) invoiceDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    else if (dmyMatch) invoiceDate = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`
    else warnings.push(`Định dạng ngày lập lạ: "${rawDate}"`)
  }

  const result: ParsedInvoice = {
    invoice_template:  str(ttc.KHMSHDon),
    invoice_symbol:    str(ttc.KHHDon),
    invoice_no:        str(ttc.SHDon),
    invoice_date:      invoiceDate,
    invoice_type:      str(ttc.THDon),

    supplier_tax_code: str(nban.MST),
    supplier_name:     str(nban.Ten),
    supplier_address:  str(nban.DChi),
    supplier_phone:    str(nban.SDThoai),

    buyer_tax_code:    str(nmua.MST),
    buyer_name:        str(nmua.Ten),

    subtotal:    num(tToan.TgTCThue),
    vat_amount:  num(tToan.TgTThue),
    grand_total: num(tToan.TgTTTBSo),

    items,
    raw_filename: filename,
    warnings,
  }

  // Validate cơ bản
  if (!result.invoice_no) warnings.push('Thiếu Số HĐ (SHDon)')
  if (!result.supplier_tax_code) warnings.push('Thiếu MST người bán (NBan/MST)')
  if (result.grand_total === 0 && items.length > 0) {
    warnings.push('Tổng tiền = 0 — có thể XML lỗi')
  }

  return result
}
