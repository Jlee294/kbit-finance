import { createClient } from '@/lib/supabase/server'

// ── Công nợ phải THU (KH) — từ customer_orders.outstanding ──────────────────

export interface ArRow {
  customer_id:   string
  customer_code: string
  customer_name: string
  company_name:  string | null
  orders_count:  number
  total_amount:  number     // tổng grand_total các đơn còn nợ
  total_paid:    number     // tổng đã thu
  outstanding:   number     // còn phải thu
  oldest_date:   string     // ngày đơn cũ nhất chưa thu
}

export async function listAccountsReceivable(opts: {
  companyId?: string
} = {}): Promise<ArRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('customer_orders')
    .select(`
      customer_id, order_date, grand_total, amount_paid, outstanding,
      companies!company_id ( name ),
      customers!customer_id ( code, name )
    `)
    .gt('outstanding', 0)
    .order('order_date', { ascending: true })

  if (opts.companyId) q = q.eq('company_id', opts.companyId)

  const { data, error } = await q
  if (error) { console.error('[listAR]', error.message); return [] }

  // Group theo customer_id
  const map = new Map<string, ArRow>()
  for (const r of (data ?? []) as any[]) {
    const cid = r.customer_id
    const existing = map.get(cid)
    if (existing) {
      existing.orders_count += 1
      existing.total_amount += Number(r.grand_total)
      existing.total_paid   += Number(r.amount_paid)
      existing.outstanding  += Number(r.outstanding)
      if (r.order_date < existing.oldest_date) existing.oldest_date = r.order_date
    } else {
      map.set(cid, {
        customer_id:   cid,
        customer_code: r.customers?.code ?? '',
        customer_name: r.customers?.name ?? '',
        company_name:  r.companies?.name ?? null,
        orders_count:  1,
        total_amount:  Number(r.grand_total),
        total_paid:    Number(r.amount_paid),
        outstanding:   Number(r.outstanding),
        oldest_date:   r.order_date,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
}

// ── Công nợ phải TRẢ (NCC) — từ supplier_orders.outstanding ──────────────────

export interface ApRow {
  supplier_id:   string
  supplier_code: string
  supplier_name: string
  company_name:  string | null
  orders_count:  number
  total_amount:  number
  total_paid:    number
  outstanding:   number     // còn phải trả NCC (VND)
  oldest_date:   string
}

export async function listAccountsPayable(opts: {
  companyId?: string
} = {}): Promise<ApRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('supplier_orders')
    .select(`
      supplier_id, order_date, cost_total, amount_paid, outstanding, currency, exchange_rate,
      companies!company_id ( name ),
      suppliers!supplier_id ( code, name )
    `)
    .gt('outstanding', 0)
    .order('order_date', { ascending: true })

  if (opts.companyId) q = q.eq('company_id', opts.companyId)

  const { data, error } = await q
  if (error) { console.error('[listAP]', error.message); return [] }

  const map = new Map<string, ApRow>()
  for (const r of (data ?? []) as any[]) {
    const sid = r.supplier_id
    const rate = r.currency === 'KRW' ? Number(r.exchange_rate ?? 0) : 1
    const costVnd  = Number(r.cost_total)   * rate
    const paidVnd  = Number(r.amount_paid)  * rate
    const outVnd   = Number(r.outstanding)  * rate
    const existing = map.get(sid)
    if (existing) {
      existing.orders_count += 1
      existing.total_amount += costVnd
      existing.total_paid   += paidVnd
      existing.outstanding  += outVnd
      if (r.order_date < existing.oldest_date) existing.oldest_date = r.order_date
    } else {
      map.set(sid, {
        supplier_id:   sid,
        supplier_code: r.suppliers?.code ?? '',
        supplier_name: r.suppliers?.name ?? '',
        company_name:  r.companies?.name ?? null,
        orders_count:  1,
        total_amount:  costVnd,
        total_paid:    paidVnd,
        outstanding:   outVnd,
        oldest_date:   r.order_date,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
}

// ── Phải thu chi hộ (nhân viên) — từ internal_receivables ────────────────────

export interface IrRow {
  id:               string
  person:           string
  amount:           number
  collected_amount: number
  outstanding:      number
  status:           string
  expense_id:       string
  txn_date:         string | null
  note:             string | null
}

export async function listInternalReceivables(): Promise<IrRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('internal_receivables')
    .select(`
      id, person, amount, collected_amount, status, expense_id,
      expense_transactions!expense_id ( txn_date, note )
    `)
    .eq('status', 'outstanding')
    .order('created_at', { ascending: false })
  if (error) { console.error('[listIR]', error.message); return [] }
  return (data ?? []).map((r: any) => ({
    id:               r.id,
    person:           r.person,
    amount:           Number(r.amount),
    collected_amount: Number(r.collected_amount),
    outstanding:      Number(r.amount) - Number(r.collected_amount),
    status:           r.status,
    expense_id:       r.expense_id,
    txn_date:         r.expense_transactions?.txn_date ?? null,
    note:             r.expense_transactions?.note ?? null,
  }))
}

// ── Phiếu thu cọc chưa gắn đơn — income.is_unassigned ───────────────────────

export interface DepositRow {
  id:            string
  txn_date:      string
  customer_id:   string
  customer_name: string
  amount:        number
  amount_vnd:    number
  currency:      string
  note:          string | null
}

export async function listUnassignedDeposits(): Promise<DepositRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('income_transactions')
    .select(`
      id, txn_date, customer_id, amount, amount_vnd, currency, note,
      customers!customer_id ( name )
    `)
    .eq('is_unassigned', true)
    .order('txn_date', { ascending: false })
  if (error) { console.error('[listDeposits]', error.message); return [] }
  return (data ?? []).map((r: any) => ({
    id:            r.id,
    txn_date:      r.txn_date,
    customer_id:   r.customer_id,
    customer_name: r.customers?.name ?? '',
    amount:        Number(r.amount),
    amount_vnd:    Number(r.amount_vnd ?? r.amount),
    currency:      r.currency ?? 'VND',
    note:          r.note,
  }))
}
