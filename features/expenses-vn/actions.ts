'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { expenseVnSchema, collectReceivableSchema, payVnSupplierSchema } from './schema'

export async function createExpenseVn(input: unknown): Promise<string> {
  const data = expenseVnSchema.parse(input)
  const supabase = await createClient()

  const { data: expenseId, error } = await supabase.rpc('kbit_create_expense_vn', {
    p_company_id:             data.company_id,
    p_bank_account_id:        data.bank_account_id,
    p_txn_date:               data.txn_date,
    p_amount_vnd:             data.amount_vnd,
    p_note:                   data.note ?? null,
    p_has_vat:                data.has_vat,
    p_vat_amount:             data.vat_amount,
    p_is_chi_ho:              data.is_chi_ho,
    p_chi_ho_person:          data.chi_ho_person ?? null,
    p_expense_category:       data.expense_category ?? null,
    p_operation_id:           data.operation_id ?? null,
    p_is_intercompany:        data.is_intercompany,
    p_counterpart_company_id: data.counterpart_company_id ?? null,
    p_project_id:             data.project_id ?? null,
    p_supplier_id:            data.supplier_id ?? null,
    p_supplier_order_id:      data.supplier_order_id ?? null,
    p_dinh_khoan_no:          data.dinh_khoan_no ?? null,
    p_dinh_khoan_co:          data.dinh_khoan_co ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/chi-vn')
  revalidatePath('/thu-tien') // bank balance changes
  return expenseId as string
}

/**
 * Trả công nợ NCC trong nước (VNĐ): gọi RPC atomic kbit_pay_vn_supplier —
 * vừa ghi 1 phiếu chi (expense_transactions) vừa cộng supplier_orders.amount_paid
 * (giảm công nợ phải trả). Dùng chung cho cả phiếu chi gắn đơn và nút trả NCC.
 */
export async function payVnSupplier(input: unknown): Promise<string> {
  const data = payVnSupplierSchema.parse(input)
  const supabase = await createClient()

  const { data: expenseId, error } = await supabase.rpc('kbit_pay_vn_supplier', {
    p_supplier_order_id: data.supplier_order_id,
    p_bank_account_id:   data.bank_account_id,
    p_amount_vnd:        data.amount_vnd,
    p_txn_date:          data.txn_date,
    p_note:              data.note ?? null,
    p_dinh_khoan_no:     data.dinh_khoan_no ?? null,
    p_dinh_khoan_co:     data.dinh_khoan_co ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/chi-vn')
  revalidatePath('/cong-no')
  revalidatePath('/nhap-khau')
  return expenseId as string
}

export async function collectReceivable(input: unknown): Promise<void> {
  const data = collectReceivableSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase.rpc('kbit_collect_receivable', {
    p_receivable_id:  data.receivable_id,
    p_collect_amount: data.collect_amount,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/chi-vn')
}
