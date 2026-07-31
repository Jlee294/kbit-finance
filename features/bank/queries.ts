import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'
import { cookies } from 'next/headers'
import { calculateBankSummary, type BankMovement } from './summary'
import { parseDemoOpeningValue, toDemoOpeningCookieName } from './demo-opening'

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

export interface BankAccountOption {
  id: string
  company_id: string
  company_name: string | null
  name: string
  account_no: string | null
  currency: string
}

export interface BankAccountSummary {
  bankAccountId: string
  companyId: string
  companyName: string | null
  bankAccountName: string
  accountNo: string | null
  currency: string
  year: number
  declaredOpening: number
  opening: number
  receipts: number
  payments: number
  closing: number
}

export async function listBankLedger(opts: {
  companyId?:     string
  bankAccountId?: string
  direction?:     string
  from?:          string
  to?:            string
  limit?:         number
} = {}): Promise<BankRow[]> {
  if (isDemoMode()) {
    return GLA_DATA.bankTransactions
      .filter((row) => !opts.companyId || row.companyId === opts.companyId)
      .filter((row) => !opts.bankAccountId || row.bankAccountId === opts.bankAccountId)
      .filter((row) => !opts.direction || row.direction === opts.direction)
      .filter((row) => !opts.from || row.txnDate >= opts.from)
      .filter((row) => !opts.to || row.txnDate <= opts.to)
      .sort((a, b) => b.sourceDateSerial - a.sourceDateSerial)
      .slice(0, opts.limit ?? 300)
      .map((row) => ({
        id: row.id,
        direction: row.direction,
        txn_date: row.txnDate,
        company_id: row.companyId,
        company_name: GLA_DATA.company.name,
        bank_account_id: row.bankAccountId,
        bank_account_name: GLA_DATA.bankAccount.name,
        partner_name: row.partyName,
        amount_local: row.amountLocal,
        amount_vnd: row.amountVnd,
        currency: row.currency,
        region: 'VN',
        note: row.note,
        status: row.status,
        is_unassigned: !row.affectsDebt,
      }))
  }

  const supabase = await createClient()

  // Query thu (incomes)
  let qi = supabase.from('income_transactions').select(`
    id, txn_date, company_id, bank_account_id, customer_id, amount, currency, amount_vnd,
    note, status, is_unassigned,
    companies!company_id ( name ),
    bank_accounts!bank_account_id ( name, currency ),
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
    bank_accounts!bank_account_id ( name, currency ),
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
    bank_accounts: { name: string; currency: string } | null
    customers: { name: string } | null
  }
  interface ExpenseRaw {
    id: string; txn_date: string; company_id: string; bank_account_id: string
    region: string | null; amount_vnd: number | null; amount_krw: number | null
    note: string | null; status: string
    companies: { name: string } | null
    bank_accounts: { name: string; currency: string } | null
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
    bank_account_name: r.bank_accounts ? r.bank_accounts.name : null,
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
    bank_account_name: r.bank_accounts ? r.bank_accounts.name : null,
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

export async function listBankAccounts(): Promise<BankAccountOption[]> {
  if (isDemoMode()) {
    return [{
      id: GLA_DATA.bankAccount.id,
      company_id: GLA_DATA.bankAccount.companyId,
      company_name: GLA_DATA.company.name,
      name: GLA_DATA.bankAccount.name,
      account_no: GLA_DATA.bankAccount.accountNumber,
      currency: GLA_DATA.bankAccount.currency,
    }]
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, company_id, name, account_no, currency, companies!company_id(name)')
    .eq('is_active', true)
    .order('name')
  if (error) {
    console.error('[listBankAccounts]', error.message)
    return []
  }
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    company_name: row.companies?.name ?? null,
    name: row.name,
    account_no: row.account_no,
    currency: row.currency,
  }))
}

export async function getBankAccountSummaries(opts: {
  companyId?: string
  bankAccountId?: string
  year: number
  from: string
  to: string
}): Promise<BankAccountSummary[]> {
  if (isDemoMode()) {
    const account = GLA_DATA.bankAccount
    if ((opts.companyId && opts.companyId !== account.companyId)
        || (opts.bankAccountId && opts.bankAccountId !== account.id)) {
      return []
    }
    const defaultOpening = opts.year === GLA_DATA.period.year ? account.openingBalance : 0
    const cookieStore = await cookies()
    const savedOpening = parseDemoOpeningValue(
      cookieStore.get(toDemoOpeningCookieName(account.id, opts.year))?.value ?? null,
    )
    const result = calculateBankSummary({
      declaredOpening: savedOpening ?? defaultOpening,
      year: opts.year,
      from: opts.from,
      to: opts.to,
      movements: GLA_DATA.bankTransactions.map((row) => ({
        txnDate: row.txnDate,
        direction: row.direction,
        amount: row.amountLocal,
      })),
    })
    return [{
      bankAccountId: account.id,
      companyId: account.companyId,
      companyName: GLA_DATA.company.name,
      bankAccountName: account.name,
      accountNo: account.accountNumber,
      currency: account.currency,
      year: opts.year,
      ...result,
    }]
  }

  const supabase = await createClient()
  let accountQuery = supabase
    .from('bank_accounts')
    .select('id, company_id, name, account_no, currency, companies!company_id(name)')
    .eq('is_active', true)
    .order('name')
  if (opts.companyId) accountQuery = accountQuery.eq('company_id', opts.companyId)
  if (opts.bankAccountId) accountQuery = accountQuery.eq('id', opts.bankAccountId)
  const { data: accountData, error: accountError } = await accountQuery
  if (accountError) {
    console.error('[getBankAccountSummaries:accounts]', accountError.message)
    return []
  }

  const accounts = (accountData ?? []) as any[]
  const accountIds = accounts.map((account) => account.id as string)
  if (accountIds.length === 0) return []

  const yearFrom = `${opts.year}-01-01`
  const [openingResult, incomeResult, expenseResult] = await Promise.all([
    supabase
      .from('bank_opening_balances')
      .select('bank_account_id, amount')
      .eq('year', opts.year)
      .in('bank_account_id', accountIds),
    supabase
      .from('income_transactions')
      .select('bank_account_id, txn_date, amount')
      .in('bank_account_id', accountIds)
      .in('status', ['confirmed', 'approved'])
      .gte('txn_date', yearFrom)
      .lte('txn_date', opts.to),
    supabase
      .from('expense_transactions')
      .select('bank_account_id, txn_date, amount_vnd, amount_krw')
      .in('bank_account_id', accountIds)
      .in('status', ['confirmed', 'approved'])
      .gte('txn_date', yearFrom)
      .lte('txn_date', opts.to),
  ])

  if (openingResult.error || incomeResult.error || expenseResult.error) {
    console.error(
      '[getBankAccountSummaries]',
      openingResult.error?.message ?? incomeResult.error?.message ?? expenseResult.error?.message,
    )
    return []
  }

  const openingByAccount = new Map(
    (openingResult.data ?? []).map((row: any) => [
      row.bank_account_id as string,
      Number(row.amount ?? 0),
    ]),
  )
  const movementsByAccount = new Map<string, BankMovement[]>()
  const addMovement = (bankAccountId: string, movement: BankMovement) => {
    movementsByAccount.set(
      bankAccountId,
      [...(movementsByAccount.get(bankAccountId) ?? []), movement],
    )
  }
  for (const row of incomeResult.data ?? []) {
    addMovement(row.bank_account_id, {
      txnDate: row.txn_date,
      direction: 'thu',
      amount: Number(row.amount ?? 0),
    })
  }
  const currencyByAccount = new Map(
    accounts.map((account) => [account.id as string, account.currency as string]),
  )
  for (const row of expenseResult.data ?? []) {
    addMovement(row.bank_account_id, {
      txnDate: row.txn_date,
      direction: 'chi',
      amount: currencyByAccount.get(row.bank_account_id) === 'KRW'
        ? Number(row.amount_krw ?? 0)
        : Number(row.amount_vnd ?? 0),
    })
  }

  return accounts.map((account) => ({
    bankAccountId: account.id,
    companyId: account.company_id,
    companyName: account.companies?.name ?? null,
    bankAccountName: account.name,
    accountNo: account.account_no,
    currency: account.currency,
    year: opts.year,
    ...calculateBankSummary({
      declaredOpening: openingByAccount.get(account.id) ?? 0,
      year: opts.year,
      from: opts.from,
      to: opts.to,
      movements: movementsByAccount.get(account.id) ?? [],
    }),
  }))
}
