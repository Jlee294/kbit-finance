import { createClient } from '@/lib/supabase/server'

// ── Bảng kê bán ra — 1 dòng / hóa đơn ─────────────────────────────────────────

export interface SalesInvoiceRow {
  id:                string
  order_code:        string
  invoice_template:  string | null
  invoice_symbol:    string | null
  invoice_no:        string | null
  invoice_date:      string | null
  order_date:        string
  customer_name:     string
  customer_code:     string
  customer_tax_code: string | null
  noi_dung:          string         // gộp các dòng hàng
  subtotal:          number         // tiền chưa VAT (= grand_total trừ VAT)
  vat_pct:           number
  vat_amount:        number
  grand_total:       number
  company_name:      string
  fulfillment_status: string
  payment_status:    string
}

export async function listSalesInvoices(opts: {
  companyId?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<SalesInvoiceRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('customer_orders')
    .select(`
      id, order_code, order_date,
      invoice_template, invoice_symbol, invoice_no, invoice_date, customer_tax_code,
      vat_pct, vat_amount, grand_total,
      fulfillment_status, payment_status,
      customers!customer_id ( code, name ),
      companies!company_id ( name ),
      items:customer_order_items ( description, products(name) )
    `)
    .order('order_date', { ascending: false })
    .limit(opts.limit ?? 300)

  if (opts.companyId) q = q.eq('company_id', opts.companyId)
  if (opts.from)      q = q.gte('order_date', opts.from)
  if (opts.to)        q = q.lte('order_date', opts.to)

  const { data, error } = await q
  if (error) { console.error('[listSalesInvoices]', error.message); return [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => {
    const vatPct  = Number(r.vat_pct ?? 0)
    const total   = Number(r.grand_total ?? 0)
    // Nếu có vat_amount nhập tay thì dùng, không thì tính từ vat_pct
    const vatAmt  = r.vat_amount != null
      ? Number(r.vat_amount)
      : (vatPct > 0 ? Math.round(total * vatPct / (100 + vatPct)) : 0)
    const subtotal = total - vatAmt
    const noiDung = (r.items ?? [])
      .map((it: any) => it.products?.name || it.description || '')
      .filter(Boolean)
      .join(', ')
    return {
      id:                r.id,
      order_code:        r.order_code,
      invoice_template:  r.invoice_template,
      invoice_symbol:    r.invoice_symbol,
      invoice_no:        r.invoice_no,
      invoice_date:      r.invoice_date,
      order_date:        r.order_date,
      customer_name:     r.customers?.name ?? '',
      customer_code:     r.customers?.code ?? '',
      customer_tax_code: r.customer_tax_code,
      noi_dung:          noiDung,
      subtotal,
      vat_pct:           vatPct,
      vat_amount:        vatAmt,
      grand_total:       total,
      company_name:      r.companies?.name ?? '',
      fulfillment_status: r.fulfillment_status,
      payment_status:    r.payment_status,
    }
  })
}

// ── Bảng kê mua vào — 1 dòng / hóa đơn từ supplier_orders ────────────────────

export interface PurchaseInvoiceRow {
  id:                string
  order_code:        string
  invoice_template:  string | null
  invoice_symbol:    string | null
  invoice_no:        string | null
  invoice_date:      string | null
  order_date:        string
  supplier_name:     string
  supplier_code:     string
  supplier_tax_code: string | null
  noi_dung:          string
  subtotal:          number
  vat_pct:           number
  vat_amount:        number
  grand_total:       number
  company_name:      string
  order_type:        string
}

export async function listPurchaseInvoices(opts: {
  companyId?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<PurchaseInvoiceRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('supplier_orders')
    .select(`
      id, order_code, order_date, order_type,
      invoice_template, invoice_symbol, invoice_no, invoice_date, supplier_tax_code,
      vat_amount, grand_total,
      suppliers!supplier_id ( code, name ),
      companies!company_id ( name ),
      items:supplier_order_items ( description, products(name) )
    `)
    .order('order_date', { ascending: false })
    .limit(opts.limit ?? 300)

  if (opts.companyId) q = q.eq('company_id', opts.companyId)
  if (opts.from)      q = q.gte('order_date', opts.from)
  if (opts.to)        q = q.lte('order_date', opts.to)

  const { data, error } = await q
  if (error) { console.error('[listPurchaseInvoices]', error.message); return [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => {
    const total  = Number(r.grand_total ?? 0)
    const vatAmt = Number(r.vat_amount ?? 0)
    const subtotal = total - vatAmt
    const vatPct = subtotal > 0 ? Math.round((vatAmt / subtotal) * 1000) / 10 : 0
    const noiDung = (r.items ?? [])
      .map((it: any) => it.products?.name || it.description || '')
      .filter(Boolean)
      .join(', ')
    return {
      id:                r.id,
      order_code:        r.order_code,
      invoice_template:  r.invoice_template,
      invoice_symbol:    r.invoice_symbol,
      invoice_no:        r.invoice_no,
      invoice_date:      r.invoice_date,
      order_date:        r.order_date,
      supplier_name:     r.suppliers?.name ?? '',
      supplier_code:     r.suppliers?.code ?? '',
      supplier_tax_code: r.supplier_tax_code,
      noi_dung:          noiDung,
      subtotal,
      vat_pct:           vatPct,
      vat_amount:        vatAmt,
      grand_total:       total,
      company_name:      r.companies?.name ?? '',
      order_type:        r.order_type ?? '',
    }
  })
}
