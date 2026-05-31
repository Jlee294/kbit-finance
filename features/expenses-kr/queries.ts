import { createClient } from '@/lib/supabase/server'

export type KrExpenseRow = {
  id: string
  txn_date: string
  amount_krw: number
  exchange_rate: number
  amount_vnd: number
  expense_kind: 'goods' | 'service'
  has_vat: boolean
  vat_amount: number
  is_intercompany: boolean
  status: string
  note: string | null
  supplier_id: string | null
  supplier_order_id: string | null
  project_id: string | null
  company_id: string
  bank_account_id: string
  companies: { name: string } | null
  bank_accounts: { name: string } | null
  suppliers: { name: string } | null
}

export type KrUnpaidOrder = {
  id: string
  order_code: string
  order_date: string
  currency: string
  amount_paid: number
  outstanding: number
  supplier_id: string
  exchange_rate: number | null   // rate_booked — có thể null nếu đơn cũ
  suppliers: { name: string } | null
}

/** Danh sách chi KR (mới nhất trước) */
export async function listKrExpenses(): Promise<KrExpenseRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_transactions')
    .select(`
      id, txn_date, amount_krw, exchange_rate, amount_vnd,
      expense_kind, has_vat, vat_amount,
      is_intercompany, status, note,
      supplier_id, supplier_order_id, project_id,
      company_id, bank_account_id,
      companies!company_id(name),
      bank_accounts!bank_account_id(name),
      suppliers!supplier_id(name)
    `)
    .eq('region', 'KR')
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as KrExpenseRow[]
}

/** NCC nước Hàn Quốc */
export async function listKrSuppliers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, code, name')
    .eq('country', 'KR')
    .eq('is_active', true)
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Tài khoản ngân hàng KRW */
export async function listKrwBankAccounts() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, name, company_id')
    .eq('currency', 'KRW')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Đơn NCC KRW còn nợ (outstanding > 0) + rate_booked từ exchange_rate của đơn */
export async function getKrSupplierOrdersUnpaid(): Promise<KrUnpaidOrder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_orders')
    .select(`
      id, order_code, order_date, currency,
      amount_paid, outstanding, supplier_id, exchange_rate,
      suppliers!supplier_id(name)
    `)
    .eq('currency', 'KRW')
    .gt('outstanding', 0)
    .order('order_date')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as KrUnpaidOrder[]
}

/**
 * Gợi ý tỷ giá KRW→VND theo ngày (lấy dòng gần nhất ≤ onDate).
 * Trả null nếu chưa có dữ liệu → người dùng tự nhập.
 */
export async function suggestRate(onDate: string): Promise<number | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('currency_from', 'KRW')
    .eq('currency_to', 'VND')
    .lte('rate_date', onDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.rate ?? null
}
