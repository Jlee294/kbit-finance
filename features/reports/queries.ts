import { createClient } from '@/lib/supabase/server'
import type { ReportFilter, ConsolidatedFilter } from './schema'
import { computePurchaseInvoiceTotals } from '@/features/invoices/purchase-total'

export interface CompanyReportRow {
  total_income:   number
  total_expense:  number
  net_cash_flow:  number
  ar_outstanding: number
  ap_outstanding: number
  currency:       string
}

export interface ConsolidatedReportRow {
  total_income_vnd:   number
  total_expense_vnd:  number
  net_cash_flow_vnd:  number
  ar_outstanding_vnd: number
  ap_outstanding_vnd: number
  missing_rate:       boolean
}

export async function getCompanyReport(f: ReportFilter): Promise<CompanyReportRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_report_company', {
    p_company_id: f.companyId,
    p_project_id: f.projectId ?? null,
    p_from:       f.from       ?? null,
    p_to:         f.to         ?? null,
  })
  if (error) throw new Error(error.message)
  // RPC returns array of 1 row
  const row = (data as CompanyReportRow[])[0]
  return row ?? {
    total_income: 0, total_expense: 0, net_cash_flow: 0,
    ar_outstanding: 0, ap_outstanding: 0, currency: 'VND',
  }
}

// ── Doanh thu (bán ra) + Chi phí (mua vào) theo kỳ ───────────────────────────
// KTT: "bán ra là doanh thu". Lấy trực tiếp từ đơn (không phụ thuộc thu tiền mặt),
// kê theo NGÀY HÓA ĐƠN nếu có, ngược lại theo ngày đơn — đồng bộ với bảng kê.
export interface SalesPurchaseSummary {
  revenue:       number   // tổng doanh thu (bán ra, gồm VAT)
  revenueNet:    number   // doanh thu chưa VAT
  revenueVat:    number   // VAT đầu ra
  purchase:      number   // tổng chi phí mua vào (gồm VAT)
  purchaseNet:   number   // mua vào chưa VAT
  purchaseVat:   number   // VAT đầu vào
  salesCount:    number
  purchaseCount: number
}

export async function getSalesPurchaseSummary(f: {
  companyId: string
  from?: string
  to?: string
}): Promise<SalesPurchaseSummary> {
  const supabase = await createClient()

  // Bán ra
  let sq = supabase
    .from('customer_orders')
    .select('grand_total, vat_amount, vat_pct, invoice_date, order_date')
    .eq('company_id', f.companyId)
  if (f.from) sq = sq.gte('order_date', f.from)
  if (f.to)   sq = sq.lte('order_date', f.to)

  // Mua vào
  let pq = supabase
    .from('supplier_orders')
    .select('goods_value, vat_amount, vat_import, currency, exchange_rate, invoice_date, order_date')
    .eq('company_id', f.companyId)
  if (f.from) pq = pq.gte('order_date', f.from)
  if (f.to)   pq = pq.lte('order_date', f.to)

  const [salesRes, purchaseRes] = await Promise.all([sq, pq])
  if (salesRes.error)    console.error('[getSalesPurchaseSummary] sales', salesRes.error.message)
  if (purchaseRes.error) console.error('[getSalesPurchaseSummary] purchase', purchaseRes.error.message)

  const sales = (salesRes.data ?? []) as Array<{ grand_total: number | null; vat_amount: number | null; vat_pct: number | null }>
  let revenue = 0, revenueVat = 0
  for (const r of sales) {
    const total  = Number(r.grand_total ?? 0)
    const vatPct = Number(r.vat_pct ?? 0)
    const vat    = r.vat_amount != null
      ? Number(r.vat_amount)
      : (vatPct > 0 ? Math.round(total * vatPct / (100 + vatPct)) : 0)
    revenue    += total
    revenueVat += vat
  }

  const purchases = (purchaseRes.data ?? []) as Array<Parameters<typeof computePurchaseInvoiceTotals>[0]>
  let purchase = 0, purchaseVat = 0
  for (const r of purchases) {
    const { vat_amount, grand_total } = computePurchaseInvoiceTotals(r)
    purchase    += grand_total
    purchaseVat += vat_amount
  }

  return {
    revenue,
    revenueNet:  revenue - revenueVat,
    revenueVat,
    purchase,
    purchaseNet: purchase - purchaseVat,
    purchaseVat,
    salesCount:    sales.length,
    purchaseCount: purchases.length,
  }
}

export async function getConsolidatedReport(f: ConsolidatedFilter): Promise<ConsolidatedReportRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_report_consolidated', {
    p_from: f.from ?? null,
    p_to:   f.to   ?? null,
  })
  if (error) throw new Error(error.message)
  const row = (data as ConsolidatedReportRow[])[0]
  return row ?? {
    total_income_vnd: 0, total_expense_vnd: 0, net_cash_flow_vnd: 0,
    ar_outstanding_vnd: 0, ap_outstanding_vnd: 0, missing_rate: false,
  }
}
