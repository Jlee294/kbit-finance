import { createClient } from '@/lib/supabase/server'
import type { ReportFilter, ConsolidatedFilter } from './schema'
import { computePurchaseInvoiceTotals } from '@/features/invoices/purchase-total'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'
import {
  calculateProfitLoss,
  type ProfitLossResult,
  type PurchaseTreatment,
} from './profit-loss'

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
  if (isDemoMode()) {
    const money = GLA_DATA.bankTransactions
      .filter((row) => row.companyId === f.companyId)
      .filter((row) => !f.from || row.txnDate >= f.from)
      .filter((row) => !f.to || row.txnDate <= f.to)
    const totalIncome = f.projectId
      ? 0
      : money
          .filter((row) => row.direction === 'thu')
          .reduce((total, row) => total + row.amountVnd, 0)
    const totalExpense = f.projectId
      ? 0
      : money
          .filter((row) => row.direction === 'chi')
          .reduce((total, row) => total + row.amountVnd, 0)
    return {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_cash_flow: totalIncome - totalExpense,
      ar_outstanding: GLA_DATA.receivables.reduce((total, row) => total + row.closingDebit, 0),
      ap_outstanding: GLA_DATA.payables.reduce((total, row) => total + row.closingCredit, 0),
      currency: 'VND',
    }
  }

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
  if (isDemoMode()) {
    const sales = GLA_DATA.salesInvoices.filter(
      (row) => (!f.from || row.invoiceDate >= f.from) && (!f.to || row.invoiceDate <= f.to),
    )
    const purchases = GLA_DATA.purchaseInvoices.filter(
      (row) => (!f.from || row.invoiceDate >= f.from) && (!f.to || row.invoiceDate <= f.to),
    )
    const recognizedSales = sales.filter((row) => row.recognizeRevenue)
    const revenue = recognizedSales.reduce((total, row) => total + row.grandTotal, 0)
    const revenueNet = recognizedSales.reduce((total, row) => total + row.subtotal, 0)
    const revenueVat = sales.reduce((total, row) => total + row.vatAmount, 0)
    const purchaseNet = purchases.reduce((total, row) => total + row.subtotal, 0)
    const purchaseVat = purchases.reduce((total, row) => total + row.vatAmount, 0)
    return {
      revenue,
      revenueNet,
      revenueVat,
      purchase: purchaseNet + purchaseVat,
      purchaseNet,
      purchaseVat,
      salesCount: sales.length,
      purchaseCount: purchases.length,
    }
  }

  const supabase = await createClient()

  // Bán ra
  let sq = supabase
    .from('customer_orders')
    .select('grand_total, vat_amount, vat_pct, invoice_date, order_date, recognize_revenue')
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

  const sales = (salesRes.data ?? []) as Array<{ grand_total: number | null; vat_amount: number | null; vat_pct: number | null; recognize_revenue: boolean }>
  let revenue = 0, revenueNet = 0, revenueVat = 0
  for (const r of sales) {
    const total  = Number(r.grand_total ?? 0)
    const vatPct = Number(r.vat_pct ?? 0)
    const vat    = r.vat_amount != null
      ? Number(r.vat_amount)
      : (vatPct > 0 ? Math.round(total * vatPct / (100 + vatPct)) : 0)
    if (r.recognize_revenue) {
      revenue += total
      revenueNet += total - vat
    }
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
    revenueNet,
    revenueVat,
    purchase,
    purchaseNet: purchase - purchaseVat,
    purchaseVat,
    salesCount:    sales.length,
    purchaseCount: purchases.length,
  }
}

export async function getProfitAndLossSummary(f: {
  companyId: string
  from?: string
  to?: string
}): Promise<ProfitLossResult> {
  if (isDemoMode()) {
    const sales = GLA_DATA.salesInvoices.filter(
      (row) => (!f.from || row.invoiceDate >= f.from) && (!f.to || row.invoiceDate <= f.to),
    )
    const purchases = GLA_DATA.purchaseInvoices.filter(
      (row) => (!f.from || row.invoiceDate >= f.from) && (!f.to || row.invoiceDate <= f.to),
    )
    const purchaseJournal = GLA_DATA.purchaseJournal.filter(
      (row) => (!f.from || row.invoiceDate >= f.from) && (!f.to || row.invoiceDate <= f.to),
    )
    const inventoryRows = Object.entries(GLA_DATA.inventoryByMonth)
      .filter(([period]) =>
        (!f.from || `${period}-31` >= f.from)
        && (!f.to || `${period}-01` <= f.to))
      .flatMap(([, rows]) => rows)
    const cogs = inventoryRows.reduce((sum, row) => sum + row.valueOut, 0)
    return calculateProfitLoss({
      recognizedRevenue: sales
        .filter((row) => row.recognizeRevenue)
        .reduce((sum, row) => sum + row.subtotal, 0),
      giftDeclaredValue: sales
        .filter((row) => row.isGift)
        .reduce((sum, row) => sum + row.subtotal, 0),
      cogs,
      purchases: [
        {
          amount: purchaseJournal.reduce((sum, row) => sum + row.subtotal, 0),
          treatment: 'inventory',
        },
        {
          amount:
            purchases.reduce((sum, row) => sum + row.subtotal, 0)
            - purchaseJournal.reduce((sum, row) => sum + row.subtotal, 0),
          treatment: 'expense',
        },
      ],
    })
  }

  const supabase = await createClient()
  let salesQuery = supabase
    .from('customer_orders')
    .select(`
      grand_total, vat_amount, recognize_revenue, is_gift,
      items:customer_order_items(qty,cost_price)
    `)
    .eq('company_id', f.companyId)
    .not('invoice_date', 'is', null)
  if (f.from) salesQuery = salesQuery.gte('invoice_date', f.from)
  if (f.to) salesQuery = salesQuery.lte('invoice_date', f.to)

  let purchaseQuery = supabase
    .from('supplier_order_items')
    .select(`
      line_total, source_line_amount, accounting_treatment,
      supplier_orders!inner(company_id,invoice_date)
    `)
    .eq('supplier_orders.company_id', f.companyId)
    .not('supplier_orders.invoice_date', 'is', null)
  if (f.from) purchaseQuery = purchaseQuery.gte('supplier_orders.invoice_date', f.from)
  if (f.to) purchaseQuery = purchaseQuery.lte('supplier_orders.invoice_date', f.to)

  const [salesResult, purchaseResult] = await Promise.all([salesQuery, purchaseQuery])
  if (salesResult.error) throw new Error(salesResult.error.message)
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)

  let recognizedRevenue = 0
  let giftDeclaredValue = 0
  let cogs = 0
  for (const order of (salesResult.data ?? []) as any[]) {
    const net = Number(order.grand_total ?? 0) - Number(order.vat_amount ?? 0)
    if (order.recognize_revenue) recognizedRevenue += net
    if (order.is_gift) giftDeclaredValue += net
    for (const item of order.items ?? []) {
      cogs += Number(item.qty ?? 0) * Number(item.cost_price ?? 0)
    }
  }

  return calculateProfitLoss({
    recognizedRevenue,
    giftDeclaredValue,
    cogs,
    purchases: ((purchaseResult.data ?? []) as any[]).map((item) => ({
      amount: Number(item.source_line_amount ?? item.line_total ?? 0),
      treatment: item.accounting_treatment as PurchaseTreatment,
    })),
  })
}

export async function getConsolidatedReport(f: ConsolidatedFilter): Promise<ConsolidatedReportRow> {
  if (isDemoMode()) {
    const report = await getCompanyReport({
      companyId: GLA_DATA.company.id,
      from: f.from,
      to: f.to,
    })
    return {
      total_income_vnd: report.total_income,
      total_expense_vnd: report.total_expense,
      net_cash_flow_vnd: report.net_cash_flow,
      ar_outstanding_vnd: report.ar_outstanding,
      ap_outstanding_vnd: report.ap_outstanding,
      missing_rate: false,
    }
  }

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
