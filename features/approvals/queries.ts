import { createClient } from '@/lib/supabase/server'

export interface PendingIncome {
  id: string
  company_id: string
  amount: number
  txn_date: string
  status: string
  created_by: string | null
  note: string | null
  companies: { name: string } | null
  customers: { name: string } | null
}

export interface PendingExpense {
  id: string
  company_id: string
  amount_vnd: number
  txn_date: string
  status: string
  created_by: string | null
  note: string | null
  companies: { name: string } | null
}

export async function listPendingIncome(): Promise<PendingIncome[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('income_transactions')
    .select('id, company_id, amount, txn_date, status, created_by, note, companies!company_id(name), customers!customer_id(name)')
    .in('status', ['draft', 'confirmed'])
    .order('txn_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PendingIncome[]
}

export async function listPendingExpense(): Promise<PendingExpense[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_transactions')
    .select('id, company_id, amount_vnd, txn_date, status, created_by, note, companies!company_id(name)')
    .in('status', ['draft', 'confirmed'])
    .order('txn_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PendingExpense[]
}

export async function countPending(): Promise<number> {
  const supabase = await createClient()
  const [inc, exp] = await Promise.all([
    supabase.from('income_transactions').select('id', { count: 'exact', head: true }).in('status', ['draft', 'confirmed']),
    supabase.from('expense_transactions').select('id', { count: 'exact', head: true }).in('status', ['draft', 'confirmed']),
  ])
  return (inc.count ?? 0) + (exp.count ?? 0)
}
