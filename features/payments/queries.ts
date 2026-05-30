import { createClient } from '@/lib/supabase/server'

export type IncomeRow = {
  id: string
  txn_date: string
  amount: number
  is_unassigned: boolean
  note: string | null
  status: string
  customer_id: string
  bank_account_id: string
  customers: { name: string } | null
  bank_accounts: { name: string; currency: string } | null
}

export type BankBalance = {
  bank_account_id: string
  name: string
  currency: string
  company_id: string
  balance: number
}

/** Danh sách phiếu thu (mới nhất trước), kèm tên KH + tài khoản. */
export async function listIncomes(companyId?: string) {
  const supabase = await createClient()
  let q = supabase
    .from('income_transactions')
    .select(
      `id, txn_date, amount, is_unassigned, note, status,
       customer_id, bank_account_id,
       customers!customer_id(name),
       bank_accounts!bank_account_id(name, currency)`,
    )
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as IncomeRow[]
}

/** Đơn của 1 khách hàng còn công nợ (outstanding > 0) để chọn phân bổ. */
export async function getCustomerOrdersForAlloc(companyId: string, customerId: string) {
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

/**
 * Số dư các tài khoản ngân hàng (VIEW chuẩn D2 — trừ chi theo đúng currency).
 * VIEW chỉ trả (bank_account_id, currency, balance) → JOIN bank_accounts để lọc công ty + lấy tên.
 */
export async function getBankBalances(companyId?: string): Promise<BankBalance[]> {
  const supabase = await createClient()

  let accQ = supabase
    .from('bank_accounts')
    .select('id, name, currency, company_id')
    .eq('is_active', true)
    .order('name')
  if (companyId) accQ = accQ.eq('company_id', companyId)

  const [accRes, balRes] = await Promise.all([
    accQ,
    supabase.from('v_bank_balances').select('bank_account_id, balance'),
  ])

  if (accRes.error) throw new Error(accRes.error.message)
  // VIEW chưa tồn tại (migration chưa chạy) → trả balance = 0 thay vì crash trang
  if (balRes.error) {
    console.warn('v_bank_balances không tồn tại — chạy migration 0003 trên Supabase')
    return (accRes.data ?? []).map((a) => ({
      bank_account_id: a.id,
      name: a.name,
      currency: a.currency,
      company_id: a.company_id,
      balance: 0,
    }))
  }

  const balById = new Map(
    (balRes.data ?? []).map((r) => [r.bank_account_id, Number(r.balance)]),
  )

  return (accRes.data ?? []).map((a) => ({
    bank_account_id: a.id,
    name: a.name,
    currency: a.currency,
    company_id: a.company_id,
    balance: balById.get(a.id) ?? 0,
  }))
}

/** Số dư trả trước của 1 khách hàng. */
export async function getCustomerPrepaid(customerId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('prepaid_balance')
    .eq('id', customerId)
    .single()
  if (error) throw new Error(error.message)
  return Number(data?.prepaid_balance ?? 0)
}
