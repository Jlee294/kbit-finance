'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { incomeSchema, assignDepositSchema } from './schema'

/** Ghi phiếu thu + phân bổ nhiều đơn (atomic qua RPC plpgsql). */
export async function createIncomeWithAllocations(input: unknown) {
  const data = incomeSchema.parse(input)
  const supabase = await createClient()

  const { data: incomeId, error } = await supabase.rpc('kbit_record_income', {
    p_company_id:      data.company_id,
    p_bank_account_id: data.bank_account_id,
    p_customer_id:     data.customer_id,
    p_amount:          data.amount,
    p_txn_date:        data.txn_date,
    p_note:            data.note ?? null,
    p_allocations:     data.allocations.map((a) => ({
      customer_order_id: a.customer_order_id,
      allocated_amount:  a.allocated_amount,
    })),
    p_project_id: data.project_id ?? null,
    p_dinh_khoan_no: data.dinh_khoan_no ?? null,
    p_dinh_khoan_co: data.dinh_khoan_co ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/thu-tien')
  revalidatePath('/don-hang')
  return incomeId as string
}

/** Gắn phiếu thu cọc (is_unassigned) vào các đơn hàng về sau (atomic). */
export async function assignDeposit(input: unknown) {
  const data = assignDepositSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase.rpc('kbit_assign_deposit', {
    p_income_id:   data.income_id,
    p_allocations: data.allocations.map((a) => ({
      customer_order_id: a.customer_order_id,
      allocated_amount:  a.allocated_amount,
    })),
  })

  if (error) throw new Error(error.message)

  revalidatePath('/thu-tien')
  revalidatePath('/don-hang')
}

/**
 * Server action dùng bởi IncomeForm (client) để lấy đơn còn nợ khi chọn KH.
 * Không thể gọi query server trực tiếp từ client component nên dùng action.
 */
export async function fetchOrdersForAlloc(companyId: string, customerId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customer_orders')
    .select('id, order_code, grand_total, amount_paid, outstanding, payment_status')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .gt('outstanding', 0)
    .order('order_date')
  if (error) throw new Error(error.message)
  return data ?? []
}
