'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { krExpenseSchema, krSupplierPaySchema } from './schema'

/**
 * Ghi 1 phiếu chi tại Hàn Quốc qua RPC (D5: created_by set trong DB).
 * Lưu amount_krw + exchange_rate + amount_vnd (plan.md 3.4).
 * ⏳ A2: trả fctWarning=true khi expense_kind='service' → UI nhắc thuế nhà thầu FCT.
 */
export async function createKrExpense(input: unknown): Promise<{ ok: boolean; fctWarning: boolean }> {
  const d = krExpenseSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase.rpc('kbit_create_expense_kr', {
    p_company_id:             d.company_id,
    p_bank_account_id:        d.bank_account_id,
    p_supplier_id:            d.supplier_id ?? null,
    p_amount_krw:             d.amount_krw,
    p_exchange_rate:          d.exchange_rate,
    p_txn_date:               d.txn_date,
    p_expense_kind:           d.expense_kind,
    p_has_vat:                d.has_vat,
    p_vat_amount:             d.vat_amount,
    p_note:                   d.note ?? null,
    p_project_id:             d.project_id ?? null,
    p_is_intercompany:        d.is_intercompany,
    p_counterpart_company_id: d.counterpart_company_id ?? null,
    p_dinh_khoan_no:          d.dinh_khoan_no ?? null,
    p_dinh_khoan_co:          d.dinh_khoan_co ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/chi-kr')
  revalidatePath('/thu-tien') // bank balance changes
  return { ok: true, fctWarning: d.expense_kind === 'service' }
}

/**
 * Trả công nợ NCC ngoại tệ — 1 RPC atomic = 3 việc trong 1 transaction:
 *   (1) ghi phiếu chi KR
 *   (2) cộng supplier_orders.amount_paid (KRW nguyên tệ — D3)
 *   (3) ghi fx_gain_loss (chênh lệch tỷ giá)
 * D4: rate_booked ĐỌC từ supplier_orders.exchange_rate trong RPC; chỉ gửi p_rate_booked khi fallback.
 */
export async function payKrSupplierOrder(input: unknown): Promise<{ ok: boolean; expense_id: string }> {
  const d = krSupplierPaySchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('kbit_pay_kr_supplier', {
    p_supplier_order_id: d.supplier_order_id,
    p_bank_account_id:   d.bank_account_id,
    p_amount_krw:        d.amount_krw,
    p_rate_settled:      d.rate_settled,
    p_txn_date:          d.txn_date,
    p_rate_booked:       d.rate_booked ?? null,  // fallback chỉ khi đơn chưa có exchange_rate
    p_note:              d.note ?? null,
    p_dinh_khoan_no:     d.dinh_khoan_no ?? null,
    p_dinh_khoan_co:     d.dinh_khoan_co ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/chi-kr')
  revalidatePath('/thu-tien')
  return { ok: true, expense_id: data as string }
}
