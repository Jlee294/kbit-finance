/**
 * POST /api/sheets/sync
 *
 * Cron endpoint: đồng bộ giao dịch approved → Google Sheets.
 * Bảo vệ bằng CRON_SECRET header.
 *
 * Lấy tối đa 500 giao dịch/lần (income + expense riêng biệt).
 * Sau khi append, cập nhật synced_to_sheet_at để tránh duplicate.
 *
 * Env vars:
 *   CRON_SECRET       — Header secret (x-cron-secret)
 *   GOOGLE_SHEET_ID   — Spreadsheet ID
 *
 * Gọi từ Vercel Cron (vercel.json) hoặc bất kỳ scheduler nào.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  appendRows,
  formatIncomeRow,
  formatExpenseRow,
  INCOME_SHEET_RANGE,
  EXPENSE_SHEET_RANGE,
} from '@/lib/sheets'
import { dispatchAlert } from '@/features/integrations/alerts'

const BATCH = 500

export async function POST(req: NextRequest) {
  // ── Auth: CRON_SECRET ────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const header = req.headers.get('x-cron-secret')
    if (header !== cronSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) {
    return NextResponse.json({ error: 'GOOGLE_SHEET_ID chưa cấu hình' }, { status: 500 })
  }

  const supabase = await createClient()
  const now = new Date().toISOString()

  // ── Sync income_transactions ─────────────────────────────────────────────
  let incomeCount = 0
  {
    const { data: rows, error } = await supabase
      .from('income_transactions')
      .select(`
        id, txn_date, amount, currency, amount_vnd, status, note,
        companies!company_id(name),
        customers!customer_id(name),
        approved_by_user:users!approved_by(full_name)
      `)
      .eq('status', 'approved')
      .is('synced_to_sheet_at', null)
      .limit(BATCH)

    if (error) {
      console.error('[sheets/sync] income query error:', error)
    } else if (rows && rows.length > 0) {
      const formatted = rows.map(r => formatIncomeRow({
        id:            r.id,
        txn_date:      r.txn_date,
        company_name:  (r.companies as any)?.name ?? '',
        customer_name: (r.customers as any)?.name ?? '',
        amount:        r.amount,
        currency:      r.currency,
        amount_vnd:    r.amount_vnd,
        status:        r.status,
        approver_name: (r.approved_by_user as any)?.full_name,
        note:          r.note,
      }))

      await appendRows(sheetId, INCOME_SHEET_RANGE, formatted)

      // Mark synced
      const ids = rows.map(r => r.id)
      await supabase
        .from('income_transactions')
        .update({ synced_to_sheet_at: now })
        .in('id', ids)

      incomeCount = rows.length
    }
  }

  // ── Sync expense_transactions ────────────────────────────────────────────
  let expenseCount = 0
  {
    const { data: rows, error } = await supabase
      .from('expense_transactions')
      .select(`
        id, txn_date, amount_vnd, expense_type, status, note,
        companies!company_id(name),
        suppliers!supplier_id(name),
        approved_by_user:users!approved_by(full_name)
      `)
      .eq('status', 'approved')
      .is('synced_to_sheet_at', null)
      .limit(BATCH)

    if (error) {
      console.error('[sheets/sync] expense query error:', error)
    } else if (rows && rows.length > 0) {
      const formatted = rows.map(r => formatExpenseRow({
        id:            r.id,
        txn_date:      r.txn_date,
        company_name:  (r.companies as any)?.name ?? '',
        supplier_name: (r.suppliers as any)?.name,
        expense_type:  r.expense_type ?? '',
        amount_vnd:    r.amount_vnd,
        status:        r.status,
        approver_name: (r.approved_by_user as any)?.full_name,
        note:          r.note,
      }))

      await appendRows(sheetId, EXPENSE_SHEET_RANGE, formatted)

      const ids = rows.map(r => r.id)
      await supabase
        .from('expense_transactions')
        .update({ synced_to_sheet_at: now })
        .in('id', ids)

      expenseCount = rows.length
    }
  }

  // ── Notify ────────────────────────────────────────────────────────────────
  if (incomeCount + expenseCount > 0) {
    await dispatchAlert({
      type: 'sheetsync_done',
      incomeCount,
      expenseCount,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, incomeCount, expenseCount })
}
