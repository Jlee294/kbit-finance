/**
 * lib/sheets.ts — Google Sheets helpers
 *
 * 1-way sync: App → Sheets (không đọc ngược lại)
 * Chỉ sync các giao dịch đã approved + chưa có synced_to_sheet_at.
 *
 * Env vars:
 *   GOOGLE_SHEET_ID — ID của spreadsheet (từ URL)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 */

import { getAccessToken, SHEETS_SCOPE } from './google'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export type CellValue = string | number | boolean | null

/**
 * Append rows vào một sheet/range cụ thể.
 * Dùng USER_ENTERED để số/ngày được parse đúng.
 *
 * @param spreadsheetId  — GOOGLE_SHEET_ID hoặc override
 * @param range          — VD: 'Thu tien!A:Z' hoặc 'Sheet1'
 * @param rows           — Mảng 2D: [[col1, col2, ...], ...]
 */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  rows: CellValue[][]
): Promise<void> {
  if (rows.length === 0) return

  const token = await getAccessToken(SHEETS_SCOPE)

  const url =
    `${API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets append thất bại (${res.status}): ${body}`)
  }
}

// ─── Sheet layouts ────────────────────────────────────────────────────────────

/** Header row cho sheet Thu tiền */
export const INCOME_SHEET_RANGE = 'Thu tien'
export const INCOME_SHEET_HEADERS: string[] = [
  'ID', 'Ngày GD', 'Công ty', 'Khách hàng', 'Số tiền', 'Tiền tệ', 'Số tiền VND',
  'Trạng thái', 'Người duyệt', 'Ghi chú', 'Đồng bộ lúc'
]

/** Header row cho sheet Chi phí */
export const EXPENSE_SHEET_RANGE = 'Chi phi'
export const EXPENSE_SHEET_HEADERS: string[] = [
  'ID', 'Ngày GD', 'Công ty', 'NCC', 'Loại chi', 'Số tiền VND',
  'Trạng thái', 'Người duyệt', 'Ghi chú', 'Đồng bộ lúc'
]

/** Format một income row thành mảng cell values */
export function formatIncomeRow(txn: {
  id: string
  txn_date: string
  company_name: string
  customer_name: string
  amount: number
  currency: string
  amount_vnd: number | null
  status: string
  approver_name?: string | null
  note?: string | null
}): CellValue[] {
  return [
    txn.id,
    txn.txn_date,
    txn.company_name,
    txn.customer_name,
    txn.amount,
    txn.currency,
    txn.amount_vnd ?? txn.amount,
    txn.status,
    txn.approver_name ?? '',
    txn.note ?? '',
    new Date().toISOString(),
  ]
}

/** Format một expense row thành mảng cell values */
export function formatExpenseRow(txn: {
  id: string
  txn_date: string
  company_name: string
  supplier_name?: string | null
  expense_type: string
  amount_vnd: number
  status: string
  approver_name?: string | null
  note?: string | null
}): CellValue[] {
  return [
    txn.id,
    txn.txn_date,
    txn.company_name,
    txn.supplier_name ?? '',
    txn.expense_type,
    txn.amount_vnd,
    txn.status,
    txn.approver_name ?? '',
    txn.note ?? '',
    new Date().toISOString(),
  ]
}
