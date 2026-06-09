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
  doc_count: number          // KTT D2: số chứng từ đính kèm
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
  doc_count: number          // KTT D2
}

/** Đếm chứng từ cho mảng entity_id (KTT D2) */
async function countDocsByEntity(
  entityType: 'income' | 'expense',
  ids: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (ids.length === 0) return result
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('entity_id')
    .eq('entity_type', entityType)
    .in('entity_id', ids)
  for (const d of (data ?? []) as { entity_id: string }[]) {
    result.set(d.entity_id, (result.get(d.entity_id) ?? 0) + 1)
  }
  return result
}

export async function listPendingIncome(): Promise<PendingIncome[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('income_transactions')
    .select('id, company_id, amount, txn_date, status, created_by, note, companies!company_id(name), customers!customer_id(name)')
    .in('status', ['draft', 'confirmed'])
    .order('txn_date', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Omit<PendingIncome, 'doc_count'>[]
  const counts = await countDocsByEntity('income', rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, doc_count: counts.get(r.id) ?? 0 }))
}

export async function listPendingExpense(): Promise<PendingExpense[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_transactions')
    .select('id, company_id, amount_vnd, txn_date, status, created_by, note, companies!company_id(name)')
    .in('status', ['draft', 'confirmed'])
    .order('txn_date', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Omit<PendingExpense, 'doc_count'>[]
  const counts = await countDocsByEntity('expense', rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, doc_count: counts.get(r.id) ?? 0 }))
}

export async function countPending(): Promise<number> {
  const supabase = await createClient()
  const [inc, exp] = await Promise.all([
    supabase.from('income_transactions').select('id', { count: 'exact', head: true }).in('status', ['draft', 'confirmed']),
    supabase.from('expense_transactions').select('id', { count: 'exact', head: true }).in('status', ['draft', 'confirmed']),
  ])
  return (inc.count ?? 0) + (exp.count ?? 0)
}
