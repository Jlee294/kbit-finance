import { createClient } from '@/lib/supabase/server'
import { computeLedger, cashEntryToLedgerSource } from './ledger'

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

// ── Bảng tổng hợp công nợ theo kỳ (Đầu kỳ / Phát sinh / Cuối kỳ) ─────────────

export interface LedgerOrderDetail {
  id:          string
  order_code:  string
  order_date:  string
  total:       number   // tổng phát sinh đơn (VND)
  paid:        number   // đã thanh toán (VND)
  outstanding: number   // còn lại (VND)
  is_cash?:    boolean  // true = dòng từ Chứng từ khác (không link sang đơn)
}

export interface LedgerRow {
  party_id:   string
  party_code: string
  party_name: string
  tax_code:   string | null
  symbol:     string    // 131-01 (KH) / 331-01 (NCC) — tự đánh số
  opening:    number    // số dư đầu kỳ (dương = chiều gốc)
  incurred:   number    // phát sinh tăng trong kỳ
  settled:    number    // đã thu/trả trong kỳ
  closing:    number    // số dư cuối kỳ
  deposit?:   number    // (chỉ phải thu) tiền cọc KH chưa gắn đơn — nhắc, KHÔNG tự trừ
  orders:     LedgerOrderDetail[]   // chi tiết để xổ ra khi click
}

interface PartyAccum {
  party_id:   string
  party_code: string
  party_name: string
  tax_code:   string | null
  source:     { order_date: string; total: number; paid: number }[]
  detail:     LedgerOrderDetail[]
}

/** Tính ledger từng đối tượng, lọc đối tượng có hoạt động, sắp xếp + đánh ký hiệu. */
function assembleLedger(groups: Map<string, PartyAccum>, year: number, prefix: string): LedgerRow[] {
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`
  const rows: LedgerRow[] = []
  for (const g of groups.values()) {
    const t = computeLedger(g.source, yearStart, yearEnd)
    if (t.opening === 0 && t.incurred === 0 && t.settled === 0) continue   // không liên quan kỳ
    rows.push({
      party_id:   g.party_id,
      party_code: g.party_code,
      party_name: g.party_name,
      tax_code:   g.tax_code,
      symbol:     '',
      opening:    t.opening,
      incurred:   t.incurred,
      settled:    t.settled,
      closing:    t.closing,
      orders:     g.detail.sort((a, b) => a.order_date.localeCompare(b.order_date)),
    })
  }
  rows.sort((a, b) => a.party_code.localeCompare(b.party_code))
  rows.forEach((r, i) => { r.symbol = `${prefix}-${String(i + 1).padStart(2, '0')}` })
  return rows
}

export async function getReceivableLedger(year: number, companyId?: string): Promise<LedgerRow[]> {
  const supabase = await createClient()
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`
  let q = supabase
    .from('customer_orders')
    .select(`
      id, customer_id, order_code, order_date, grand_total, amount_paid, outstanding, customer_tax_code,
      customers!customer_id ( code, name )
    `)
    .neq('fulfillment_status', 'draft')   // I2: đơn nháp chưa phát sinh công nợ (khớp báo cáo gốc)
    .lte('order_date', yearEnd)
    .order('order_date', { ascending: true })
  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) { console.error('[getReceivableLedger]', error.message); return [] }

  const groups = new Map<string, PartyAccum>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const id = r.customer_id
    let g = groups.get(id)
    if (!g) {
      g = { party_id: id, party_code: r.customers?.code ?? '', party_name: r.customers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(id, g)
    }
    const total = Number(r.grand_total), paid = Number(r.amount_paid), outstanding = Number(r.outstanding)
    g.source.push({ order_date: r.order_date, total, paid })
    if (!g.tax_code && r.customer_tax_code) g.tax_code = r.customer_tax_code
    if (r.order_date >= yearStart || outstanding > 0) {
      g.detail.push({ id: r.id, order_code: r.order_code, order_date: r.order_date, total, paid, outstanding })
    }
  }
  // Gộp "Chứng từ khác" gắn khách hàng (Thu → giảm phải thu, Chi → tăng)
  let cq = supabase
    .from('cash_book')
    .select(`id, ky_hieu, txn_date, so_tien, direction, customer_id, customers!customer_id ( code, name )`)
    .not('customer_id', 'is', null)
    .eq('status', 'confirmed')        // khớp báo cáo (0040): chỉ chứng từ khác đã confirmed
    .lte('txn_date', yearEnd)
  if (companyId) cq = cq.eq('company_id', companyId)
  const { data: cashData } = await cq
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cashData ?? []) as any[]) {
    const id = c.customer_id
    let g = groups.get(id)
    if (!g) {
      g = { party_id: id, party_code: c.customers?.code ?? '', party_name: c.customers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(id, g)
    }
    const src = cashEntryToLedgerSource({ txn_date: c.txn_date, so_tien: Number(c.so_tien), direction: c.direction }, 'AR')
    g.source.push(src)
    if (c.txn_date >= yearStart) {
      g.detail.push({ id: c.id, order_code: `CTK ${c.ky_hieu ?? ''}`.trim(), order_date: c.txn_date, total: src.total, paid: src.paid, outstanding: 0, is_cash: true })
    }
  }
  // KTT E1: Phiếu thu CHƯA GẮN ĐƠN vẫn vào công nợ phải thu (giảm closing).
  // Gộp tất cả income.is_unassigned có customer_id vào settled — tạo group mới nếu KH chưa có order.
  let dq = supabase
    .from('income_transactions')
    .select('id, customer_id, amount_vnd, amount, txn_date, status, customers!customer_id ( code, name )')
    .eq('is_unassigned', true)
    .in('status', ['confirmed', 'approved'])
    .lte('txn_date', yearEnd)
  if (companyId) dq = dq.eq('company_id', companyId)
  const { data: depData } = await dq
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (depData ?? []) as any[]) {
    if (!d.customer_id) continue
    const amount = Number(d.amount_vnd ?? d.amount ?? 0)
    let g = groups.get(d.customer_id)
    if (!g) {
      g = { party_id: d.customer_id, party_code: d.customers?.code ?? '', party_name: d.customers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(d.customer_id, g)
    }
    // Treat as "fully paid" pseudo-order: total=0, paid=amount → giảm closing
    g.source.push({ order_date: d.txn_date, total: 0, paid: amount })
    if (d.txn_date >= yearStart) {
      g.detail.push({ id: d.id, order_code: 'Thu chưa gắn đơn', order_date: d.txn_date, total: 0, paid: amount, outstanding: -amount, is_cash: true })
    }
  }
  return assembleLedger(groups, year, '131')
}

export async function getPayableLedger(year: number, companyId?: string): Promise<LedgerRow[]> {
  const supabase = await createClient()
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`
  let q = supabase
    .from('supplier_orders')
    .select(`
      id, supplier_id, order_code, order_date,
      goods_value, import_duty, vat_import, other_fees, amount_paid, outstanding,
      currency, exchange_rate, supplier_tax_code,
      suppliers!supplier_id ( code, name )
    `)
    .lte('order_date', yearEnd)
    .order('order_date', { ascending: true })
  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) { console.error('[getPayableLedger]', error.message); return [] }

  const groups = new Map<string, PartyAccum>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const id = r.supplier_id
    let g = groups.get(id)
    if (!g) {
      g = { party_id: id, party_code: r.suppliers?.code ?? '', party_name: r.suppliers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(id, g)
    }
    const rate = r.currency === 'KRW' ? Number(r.exchange_rate ?? 0) : 1
    const total = (Number(r.goods_value) + Number(r.import_duty) + Number(r.vat_import) + Number(r.other_fees)) * rate
    const paid  = Number(r.amount_paid) * rate
    const outstanding = Number(r.outstanding) * rate
    g.source.push({ order_date: r.order_date, total, paid })
    if (!g.tax_code && r.supplier_tax_code) g.tax_code = r.supplier_tax_code
    if (r.order_date >= yearStart || outstanding > 0) {
      g.detail.push({ id: r.id, order_code: r.order_code, order_date: r.order_date, total, paid, outstanding })
    }
  }
  // Gộp "Chứng từ khác" gắn NCC (Chi → giảm phải trả, Thu → tăng)
  let cq = supabase
    .from('cash_book')
    .select(`id, ky_hieu, txn_date, so_tien, direction, supplier_id, suppliers!supplier_id ( code, name )`)
    .not('supplier_id', 'is', null)
    .eq('status', 'confirmed')        // khớp báo cáo (0040): chỉ chứng từ khác đã confirmed
    .lte('txn_date', yearEnd)
  if (companyId) cq = cq.eq('company_id', companyId)
  const { data: cashData } = await cq
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cashData ?? []) as any[]) {
    const id = c.supplier_id
    let g = groups.get(id)
    if (!g) {
      g = { party_id: id, party_code: c.suppliers?.code ?? '', party_name: c.suppliers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(id, g)
    }
    const src = cashEntryToLedgerSource({ txn_date: c.txn_date, so_tien: Number(c.so_tien), direction: c.direction }, 'AP')
    g.source.push(src)
    if (c.txn_date >= yearStart) {
      g.detail.push({ id: c.id, order_code: `CTK ${c.ky_hieu ?? ''}`.trim(), order_date: c.txn_date, total: src.total, paid: src.paid, outstanding: 0, is_cash: true })
    }
  }

  // KTT E1: Phiếu chi gắn NCC nhưng CHƯA gắn đơn (supplier_order_id IS NULL)
  // vẫn vào công nợ phải trả → giảm closing balance NCC đó.
  let eq = supabase
    .from('expense_transactions')
    .select('id, supplier_id, supplier_order_id, amount_vnd, txn_date, status, suppliers!supplier_id ( code, name )')
    .not('supplier_id', 'is', null)
    .is('supplier_order_id', null)
    .in('status', ['confirmed', 'approved'])
    .lte('txn_date', yearEnd)
  if (companyId) eq = eq.eq('company_id', companyId)
  const { data: expData } = await eq
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (expData ?? []) as any[]) {
    const id = e.supplier_id
    let g = groups.get(id)
    if (!g) {
      g = { party_id: id, party_code: e.suppliers?.code ?? '', party_name: e.suppliers?.name ?? '', tax_code: null, source: [], detail: [] }
      groups.set(id, g)
    }
    const amount = Number(e.amount_vnd ?? 0)
    g.source.push({ order_date: e.txn_date, total: 0, paid: amount })
    if (e.txn_date >= yearStart) {
      g.detail.push({ id: e.id, order_code: 'Chi chưa gắn đơn', order_date: e.txn_date, total: 0, paid: amount, outstanding: -amount, is_cash: true })
    }
  }
  return assembleLedger(groups, year, '331')
}
