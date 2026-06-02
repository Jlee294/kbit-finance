import { createClient } from '@/lib/supabase/server'

export interface BankRow {
  id:                string
  direction:         'thu' | 'chi'
  txn_date:          string
  company_id:        string
  company_name:      string | null
  bank_account_id:   string
  bank_account_name: string | null
  partner_name:      string | null     // tên KH (thu) hoặc NCC (chi)
  amount_local:      number
  amount_vnd:        number
  currency:          string
  region:            string | null     // VN/KR cho chi, null cho thu
  note:              string | null
  status:            string
  is_unassigned:     boolean
}

export async function listBankLedger(opts: {
  companyId?:     string
  bankAccountId?: string
  direction?:     string
  from?:          string
  to?:            string
  limit?:         number
} = {}): Promise<BankRow[]> {
  const supabase = await createClient()

  // Query thu (incomes)
  let qi = supabase.from('income_transactions').select(`
    id, txn_date, company_id, bank_account_id, customer_id, amount, currency, amount_vnd,
    note, status, is_unassigned,
    companies!company_id ( name ),
    bank_accounts!bank_account_id ( account_name, bank_name, currency ),
    customers!customer_id ( name )
  `)
  if (opts.companyId)     qi = qi.eq('company_id', opts.companyId)
  if (opts.bankAccountId) qi = qi.eq('bank_account_id', opts.bankAccountId)
  if (opts.from)          qi = qi.gte('txn_date', opts.from)
  if (opts.to)            qi = qi.lte('txn_date', opts.to)

  // Query chi (expenses)
  let qe = supabase.from('expense_transactions').select(`
    id, txn_date, company_id, bank_account_id, supplier_id, region,
    amount_vnd, amount_krw, note, status,
    companies!company_id ( name ),
    bank_accounts!bank_account_id ( account_name, bank_name, currency ),
    suppliers!supplier_id ( name )
  `)
  if (opts.companyId)     qe = qe.eq('company_id', opts.companyId)
  if (opts.bankAccountId) qe = qe.eq('bank_account_id', opts.bankAccountId)
  if (opts.from)          qe = qe.gte('txn_date', opts.from)
  if (opts.to)            qe = qe.lte('txn_date', opts.to)

  const wantThu = opts.direction !== 'chi'
  const wantChi = opts.direction !== 'thu'

  const [thuRes, chiRes] = await Promise.all([
    wantThu ? qi : Promise.resolve({ data: [], error: null }),
    wantChi ? qe : Promise.resolve({ data: [], error: null }),
  ])

  interface IncomeRaw {
    id: string; txn_date: string; company_id: string; bank_account_id: string
    amount: number; currency: string; amount_vnd: number | null
    note: string | null; status: string; is_unassigned: boolean
    companies: { name: string } | null
    bank_accounts: { account_name: string; bank_name: string; currency: string } | null
    customers: { name: string } | null
  }
  interface ExpenseRaw {
    id: string; txn_date: string; company_id: string; bank_account_id: string
    region: string | null; amount_vnd: number | null; amount_krw: number | null
    note: string | null; status: string
    companies: { name: string } | null
    bank_accounts: { account_name: string; bank_name: string; currency: string } | null
    suppliers: { name: string } | null
  }

  const thuData = (thuRes as { data: unknown[]; error: { message: string } | null })
  const chiData = (chiRes as { data: unknown[]; error: { message: string } | null })
  if (thuData.error) console.error('[bank thu]', thuData.error.message)
  if (chiData.error) console.error('[bank chi]', chiData.error.message)

  const thuRows: BankRow[] = ((thuData.data ?? []) as IncomeRaw[]).map((r) => ({
    id:                r.id,
    direction:         'thu' as const,
    txn_date:          r.txn_date,
    company_id:        r.company_id,
    company_name:      r.companies?.name ?? null,
    bank_account_id:   r.bank_account_id,
    bank_account_name: r.bank_accounts ? `${r.bank_accounts.account_name} — ${r.bank_accounts.bank_name}` : null,
    partner_name:      r.customers?.name ?? null,
    amount_local:      Number(r.amount),
    amount_vnd:        Number(r.amount_vnd ?? r.amount),
    currency:          r.currency ?? 'VND',
    region:            null,
    note:              r.note,
    status:            r.status,
    is_unassigned:     !!r.is_unassigned,
  }))

  const chiRows: BankRow[] = ((chiData.data ?? []) as ExpenseRaw[]).map((r) => ({
    id:                r.id,
    direction:         'chi' as const,
    txn_date:          r.txn_date,
    company_id:        r.company_id,
    company_name:      r.companies?.name ?? null,
    bank_account_id:   r.bank_account_id,
    bank_account_name: r.bank_accounts ? `${r.bank_accounts.account_name} — ${r.bank_accounts.bank_name}` : null,
    partner_name:      r.suppliers?.name ?? null,
    amount_local:      r.region === 'KR' ? Number(r.amount_krw ?? 0) : Number(r.amount_vnd ?? 0),
    amount_vnd:        Number(r.amount_vnd ?? 0),
    currency:          r.region === 'KR' ? 'KRW' : 'VND',
    region:            r.region,
    note:              r.note,
    status:            r.status,
    is_unassigned:     false,
  }))

  const all = [...thuRows, ...chiRows].sort((a, b) =>
    a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : 0
  )
  return all.slice(0, opts.limit ?? 300)
}

export async function listBankAccounts() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bank_accounts')
    .select('id, account_name, bank_name, currency')
    .order('account_name')
  return (data ?? []) as Array<{ id: string; account_name: string; bank_name: string; currency: string }>
}
