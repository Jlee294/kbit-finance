import { createClient } from '@/lib/supabase/server'

export type ExpenseVnRow = {
  id: string
  txn_date: string
  amount_vnd: number
  note: string | null
  has_vat: boolean
  vat_amount: number
  is_chi_ho: boolean
  chi_ho_person: string | null
  expense_category: string | null
  is_intercompany: boolean
  status: string
  company_id: string
  bank_account_id: string
  project_id: string | null
  companies: { name: string } | null
  bank_accounts: { name: string; currency: string } | null
  projects: { name: string } | null
  suppliers: { name: string } | null
  internal_receivables: ReceivableRow[]
}

export type ReceivableRow = {
  id: string
  person: string
  amount: number
  collected_amount: number
  status: string
}

/**
 * Tổng chi phí thực sự của công ty (VN):
 * - Chỉ tính is_chi_ho = false (chi hộ KHÔNG phải chi phí công ty)
 * - Lọc theo status confirmed/approved
 * - Tuỳ chọn lọc theo company và khoảng ngày
 */
export async function sumCompanyExpenseVN(
  companyId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<number> {
  const supabase = await createClient()

  let q = supabase
    .from('expense_transactions')
    .select('amount_vnd')
    .eq('region', 'VN')
    .eq('is_chi_ho', false)
    .in('status', ['confirmed', 'approved'])

  if (companyId) q = q.eq('company_id', companyId)
  if (fromDate)  q = q.gte('txn_date', fromDate)
  if (toDate)    q = q.lte('txn_date', toDate)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return (data ?? []).reduce((s, r) => s + Number(r.amount_vnd), 0)
}

/**
 * Tổng chi hộ chưa thu lại (outstanding)
 */
export async function sumOutstandingChiHo(companyId?: string): Promise<number> {
  const supabase = await createClient()

  // JOIN expense -> internal_receivables (outstanding)
  let q = supabase
    .from('internal_receivables')
    .select('amount, collected_amount, expense_transactions!expense_id(company_id)')
    .eq('status', 'outstanding')

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter((r) => {
      if (!companyId) return true
      const exp = r.expense_transactions as unknown as { company_id: string } | null
      return exp?.company_id === companyId
    })
    .reduce((s, r) => s + Number(r.amount) - Number(r.collected_amount), 0)
}

/** Danh sách chi phí VN (mới nhất trước) */
export async function listExpensesVN(companyId?: string): Promise<ExpenseVnRow[]> {
  const supabase = await createClient()

  let q = supabase
    .from('expense_transactions')
    .select(`
      id, txn_date, amount_vnd, note,
      has_vat, vat_amount,
      is_chi_ho, chi_ho_person,
      expense_category, is_intercompany,
      status, company_id, bank_account_id, project_id,
      companies!company_id(name),
      bank_accounts!bank_account_id(name, currency),
      projects!project_id(name),
      suppliers!supplier_id(name),
      internal_receivables(id, person, amount, collected_amount, status)
    `)
    .eq('region', 'VN')
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ExpenseVnRow[]
}

/** Danh sách chi hộ còn outstanding */
export async function listOutstandingReceivables(companyId?: string) {
  const supabase = await createClient()

  let q = supabase
    .from('internal_receivables')
    .select(`
      id, person, amount, collected_amount, status,
      expense_transactions!expense_id(
        id, txn_date, note, company_id,
        companies!company_id(name)
      )
    `)
    .eq('status', 'outstanding')
    .order('created_at', { ascending: false })

  const { data, error } = await q
  if (error) throw new Error(error.message)

  // Lọc theo công ty nếu có
  const rows = (data ?? []) as unknown as Array<{
    id: string
    person: string
    amount: number
    collected_amount: number
    status: string
    expense_transactions: {
      id: string
      txn_date: string
      note: string | null
      company_id: string
      companies: { name: string } | null
    } | null
  }>

  if (!companyId) return rows
  return rows.filter((r) => r.expense_transactions?.company_id === companyId)
}
