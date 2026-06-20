import { createClient } from '@/lib/supabase/server'
import { computePurchaseInvoiceTotals } from '@/features/invoices/purchase-total'

// ── Kiểu dữ liệu trả về cho Dashboard giám đốc ───────────────────────────────
export interface DashboardKpis {
  revenue:     number   // doanh thu bán ra (gồm VAT) trong kỳ
  revenueNet:  number   // doanh thu chưa VAT
  purchase:    number   // chi phí mua vào (gồm VAT)
  grossProfit: number   // lãi gộp = doanh thu thuần đã chốt giá vốn − giá vốn
  cogs:        number
  cashIn:      number   // tiền đã thu thực
  cashOut:     number   // tiền đã chi thực
  netCash:     number
  ar:          number   // công nợ phải thu
  ap:          number   // công nợ phải trả
  salesCount:  number
  purchaseCount: number
}

export interface MonthPoint {
  month:       string   // '01'..'12'
  label:       string   // 'T1'..'T12'
  revenue:     number
  purchase:    number
  grossProfit: number
  cashIn:      number
  cashOut:     number
  netCash:     number
}

export interface BreakdownRow {
  id:      string
  name:    string
  revenue: number
  profit:  number   // lãi gộp (chỉ phần đã chốt giá vốn)
  share:   number   // % doanh thu
}

export interface RankRow { id: string; code: string; name: string; revenue: number; profit: number; qty?: number }

export interface DashboardData {
  kpis:        DashboardKpis
  months:      MonthPoint[]
  byProject:   BreakdownRow[]
  byCompany:   BreakdownRow[]
  topCustomers: RankRow[]
  topProducts:  RankRow[]
  hasProjectFilter: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const mkey = (d: string | null) => (d ?? '').slice(5, 7)
function vatOf(total: number, vatAmount: number | null, vatPct: number | null) {
  if (vatAmount != null) return Number(vatAmount)
  const p = Number(vatPct ?? 0)
  return p > 0 ? Math.round(total * p / (100 + p)) : 0
}
function inRange(d: string | null, from: string, to: string) {
  return !!d && d >= from && d <= to
}

interface SalesRow {
  grand_total: number | null; vat_amount: number | null; vat_pct: number | null
  outstanding: number | null; order_date: string | null; fulfillment_status: string | null
  company_id: string; project_id: string | null; customer_id: string | null
  customers: { code: string; name: string } | null
}
interface PurchRow {
  goods_value: number | null; vat_amount: number | null; vat_import: number | null
  currency: string | null; exchange_rate: number | null; outstanding: number | null
  order_date: string | null; company_id: string; project_id: string | null
}
interface ItemRow {
  qty: number | null; unit_price: number | null; cost_price: number | null; product_id: string | null
  products: { code: string; name: string } | null
  customer_orders: { order_date: string | null; company_id: string; project_id: string | null } | null
}
interface CashRow { amount?: number | null; amount_vnd?: number | null; txn_date: string | null; project_id: string | null }

/**
 * Gom toàn bộ dữ liệu Dashboard trong 1 lần (song song). Trả số liệu cho:
 *   - KPI theo KỲ [from..to]
 *   - Chuỗi 12 tháng của `year` (xu hướng)
 *   - Cơ cấu theo dự án / công ty + top khách hàng / sản phẩm (theo kỳ)
 * companyId / projectId = null → gộp toàn bộ phạm vi user được phép (RLS lo).
 */
export async function getDashboardData(opts: {
  year: string
  companyId?: string | null
  projectId?: string | null
  from: string
  to: string
}): Promise<DashboardData> {
  const supabase = await createClient()
  const { year } = opts
  const companyId = opts.companyId || null
  const projectId = opts.projectId || null

  const yearFrom = `${year}-01-01`
  const yearTo   = `${year}-12-31`
  const rangeFrom = opts.from || yearFrom
  const rangeTo   = opts.to   || yearTo
  const fetchFrom = rangeFrom < yearFrom ? rangeFrom : yearFrom
  const fetchTo   = rangeTo   > yearTo   ? rangeTo   : yearTo

  // Build queries (lọc company/project tùy chọn)
  let sq = supabase.from('customer_orders')
    .select('grand_total, vat_amount, vat_pct, outstanding, order_date, fulfillment_status, company_id, project_id, customer_id, customers!customer_id(code,name)')
    .gte('order_date', fetchFrom).lte('order_date', fetchTo).limit(20000)
  let pq = supabase.from('supplier_orders')
    .select('goods_value, vat_amount, vat_import, currency, exchange_rate, outstanding, order_date, company_id, project_id')
    .gte('order_date', fetchFrom).lte('order_date', fetchTo).limit(20000)
  let iq = supabase.from('customer_order_items')
    .select('qty, unit_price, cost_price, product_id, products!product_id(code,name), customer_orders!inner(order_date, company_id, project_id)')
    .limit(50000)
  let incq = supabase.from('v_income_lines')
    .select('amount, txn_date, project_id, company_id')
    .gte('txn_date', fetchFrom).lte('txn_date', fetchTo).limit(20000)
  let expq = supabase.from('v_expense_lines')
    .select('amount_vnd, txn_date, project_id, company_id')
    .gte('txn_date', fetchFrom).lte('txn_date', fetchTo).limit(20000)

  if (companyId) {
    sq = sq.eq('company_id', companyId); pq = pq.eq('company_id', companyId)
    iq = iq.eq('customer_orders.company_id', companyId)
    incq = incq.eq('company_id', companyId); expq = expq.eq('company_id', companyId)
  }
  if (projectId) {
    sq = sq.eq('project_id', projectId); pq = pq.eq('project_id', projectId)
    iq = iq.eq('customer_orders.project_id', projectId)
    incq = incq.eq('project_id', projectId); expq = expq.eq('project_id', projectId)
  }

  const [salesRes, purchRes, itemRes, incRes, expRes, projRes, compRes] = await Promise.all([
    sq, pq, iq, incq, expq,
    supabase.from('projects').select('id, name'),
    supabase.from('companies').select('id, name'),
  ])

  const sales  = (salesRes.data ?? []) as unknown as SalesRow[]
  const purch  = (purchRes.data ?? []) as unknown as PurchRow[]
  const items  = (itemRes.data ?? []) as unknown as ItemRow[]
  const income = (incRes.data ?? []) as unknown as CashRow[]
  const expense= (expRes.data ?? []) as unknown as CashRow[]
  const projName = new Map<string, string>((projRes.data ?? []).map((p: any) => [p.id, p.name]))
  const compName = new Map<string, string>((compRes.data ?? []).map((c: any) => [c.id, c.name]))

  // ── KPI theo kỳ ────────────────────────────────────────────────────────────
  const kpis: DashboardKpis = {
    revenue: 0, revenueNet: 0, purchase: 0, grossProfit: 0, cogs: 0,
    cashIn: 0, cashOut: 0, netCash: 0, ar: 0, ap: 0, salesCount: 0, purchaseCount: 0,
  }

  // 12 tháng
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return { month: m, label: `T${i + 1}`, revenue: 0, purchase: 0, grossProfit: 0, cashIn: 0, cashOut: 0, netCash: 0 }
  })
  const M = (m: string) => months[Number(m) - 1]

  // Breakdown maps (theo kỳ)
  const projAgg = new Map<string, { revenue: number; profit: number }>()
  const compAgg = new Map<string, { revenue: number; profit: number }>()
  const custAgg = new Map<string, { code: string; name: string; revenue: number; profit: number }>()
  const prodAgg = new Map<string, { code: string; name: string; revenue: number; profit: number; qty: number }>()

  // Doanh thu bán ra
  for (const r of sales) {
    const total = Number(r.grand_total ?? 0)
    const vat   = vatOf(total, r.vat_amount, r.vat_pct)
    const m = mkey(r.order_date)
    if (M(m)) M(m).revenue += total
    // AR: công nợ phải thu (loại draft), theo điểm cuối kỳ
    if (r.fulfillment_status !== 'draft' && r.order_date && r.order_date <= rangeTo) {
      kpis.ar += Number(r.outstanding ?? 0)
    }
    if (inRange(r.order_date, rangeFrom, rangeTo)) {
      kpis.revenue += total
      kpis.revenueNet += total - vat
      kpis.salesCount += 1
      const pid = r.project_id
      if (pid) {
        const a = projAgg.get(pid) ?? { revenue: 0, profit: 0 }; a.revenue += total; projAgg.set(pid, a)
      }
      const c = compAgg.get(r.company_id) ?? { revenue: 0, profit: 0 }; c.revenue += total; compAgg.set(r.company_id, c)
      if (r.customer_id) {
        const cu = custAgg.get(r.customer_id) ?? { code: r.customers?.code ?? '', name: r.customers?.name ?? '—', revenue: 0, profit: 0 }
        cu.revenue += total; custAgg.set(r.customer_id, cu)
      }
    }
  }

  // Chi phí mua vào
  for (const r of purch) {
    const { grand_total } = computePurchaseInvoiceTotals(r)
    const m = mkey(r.order_date)
    if (M(m)) M(m).purchase += grand_total
    // AP: công nợ phải trả (nguyên tệ × tỷ giá nếu KRW)
    if (r.order_date && r.order_date <= rangeTo) {
      const rate = r.currency === 'KRW' ? Number(r.exchange_rate ?? 0) : 1
      kpis.ap += Number(r.outstanding ?? 0) * rate
    }
    if (inRange(r.order_date, rangeFrom, rangeTo)) {
      kpis.purchase += grand_total
      kpis.purchaseCount += 1
    }
  }

  // Lãi gộp + top sản phẩm (từ dòng hàng đã chốt giá vốn)
  for (const it of items) {
    const od = it.customer_orders?.order_date ?? null
    const qty = Number(it.qty ?? 0)
    const rev = qty * Number(it.unit_price ?? 0)
    const hasCost = it.cost_price != null
    const cogs = hasCost ? qty * Number(it.cost_price) : 0
    const profit = hasCost ? rev - cogs : 0
    const m = mkey(od)
    if (M(m) && hasCost) M(m).grossProfit += profit
    if (inRange(od, rangeFrom, rangeTo)) {
      if (hasCost) { kpis.grossProfit += profit; kpis.cogs += cogs }
      // top sản phẩm
      if (it.product_id) {
        const p = prodAgg.get(it.product_id) ?? { code: it.products?.code ?? '', name: it.products?.name ?? '—', revenue: 0, profit: 0, qty: 0 }
        p.revenue += rev; p.profit += profit; p.qty += qty; prodAgg.set(it.product_id, p)
      }
      // gắn lãi gộp vào project/company (nếu có cost)
      const pid = it.customer_orders?.project_id
      if (pid && hasCost) { const a = projAgg.get(pid); if (a) a.profit += profit }
      const cid = it.customer_orders?.company_id
      if (cid && hasCost) { const c = compAgg.get(cid); if (c) c.profit += profit }
    }
  }

  // Dòng tiền (thu/chi thực)
  for (const r of income) {
    const m = mkey(r.txn_date)
    const amt = Number(r.amount ?? 0)
    if (M(m)) M(m).cashIn += amt
    if (inRange(r.txn_date, rangeFrom, rangeTo)) kpis.cashIn += amt
  }
  for (const r of expense) {
    const m = mkey(r.txn_date)
    const amt = Number(r.amount_vnd ?? 0)
    if (M(m)) M(m).cashOut += amt
    if (inRange(r.txn_date, rangeFrom, rangeTo)) kpis.cashOut += amt
  }

  for (const mp of months) mp.netCash = mp.cashIn - mp.cashOut
  kpis.netCash = kpis.cashIn - kpis.cashOut

  // ── Build breakdown rows ─────────────────────────────────────────────────────
  const totRev = kpis.revenue || 1
  const byProject: BreakdownRow[] = [...projAgg.entries()]
    .map(([id, a]) => ({ id, name: projName.get(id) ?? '(không rõ)', revenue: a.revenue, profit: a.profit, share: Math.round(a.revenue / totRev * 1000) / 10 }))
    .sort((x, y) => y.revenue - x.revenue)
  const byCompany: BreakdownRow[] = [...compAgg.entries()]
    .map(([id, a]) => ({ id, name: compName.get(id) ?? '(không rõ)', revenue: a.revenue, profit: a.profit, share: Math.round(a.revenue / totRev * 1000) / 10 }))
    .sort((x, y) => y.revenue - x.revenue)
  const topCustomers: RankRow[] = [...custAgg.entries()]
    .map(([id, a]) => ({ id, code: a.code, name: a.name, revenue: a.revenue, profit: a.profit }))
    .sort((x, y) => y.revenue - x.revenue).slice(0, 8)
  const topProducts: RankRow[] = [...prodAgg.entries()]
    .map(([id, a]) => ({ id, code: a.code, name: a.name, revenue: a.revenue, profit: a.profit, qty: a.qty }))
    .sort((x, y) => y.revenue - x.revenue).slice(0, 8)

  return { kpis, months, byProject, byCompany, topCustomers, topProducts, hasProjectFilter: !!projectId }
}
