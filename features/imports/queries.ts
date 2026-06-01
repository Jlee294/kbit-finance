import { createClient } from '@/lib/supabase/server'

export type ImportOrderRow = {
  id: string
  order_code: string
  order_date: string
  order_type: string
  currency: string
  exchange_rate: number | null
  goods_value: number
  import_duty: number
  vat_import: number
  other_fees: number
  cost_total: number       // GENERATED: goods_value + import_duty + other_fees
  amount_paid: number
  outstanding: number      // GENERATED: total - amount_paid
  is_intercompany: boolean
  company_id: string
  supplier_id: string
  suppliers: { name: string; code: string } | null
}

export type ImportOrderDetail = ImportOrderRow & {
  project_id: string | null
  counterpart_company_id: string | null
  companies: { name: string } | null
  // Hóa đơn
  invoice_template:  string | null
  invoice_symbol:    string | null
  invoice_no:        string | null
  invoice_date:      string | null
  supplier_tax_code: string | null
  vat_amount:        number | null
  dinh_khoan_no:     string | null
  dinh_khoan_co:     string | null
  nhan_su_thuc_hien: string | null
  warehouse_id:      string | null
  stock_added:       boolean
  supplier_order_items: ImportItemRow[]
}

export type ImportItemRow = {
  id: string
  product_id: string | null
  description: string | null
  qty: number
  unit_price: number
  line_total: number    // GENERATED: qty × unit_price
  unit_cost: number | null
  products: { code: string; name: string; unit: string | null } | null
}

/** Danh sách đơn nhập khẩu (mới nhất trước) */
export async function listImportOrders(companyId?: string): Promise<ImportOrderRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('supplier_orders')
    .select(`
      id, order_code, order_date, order_type, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, is_intercompany,
      company_id, supplier_id,
      suppliers!supplier_id(name, code)
    `)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ImportOrderRow[]
}

/** Chi tiết 1 đơn nhập khẩu kèm dòng hàng */
export async function getImportOrder(id: string): Promise<ImportOrderDetail> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_orders')
    .select(`
      id, order_code, order_date, order_type, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, is_intercompany,
      company_id, supplier_id, project_id, counterpart_company_id,
      invoice_template, invoice_symbol, invoice_no, invoice_date,
      supplier_tax_code, vat_amount, dinh_khoan_no, dinh_khoan_co,
      nhan_su_thuc_hien, warehouse_id, stock_added,
      suppliers!supplier_id(name, code),
      companies!company_id(name),
      supplier_order_items(
        id, product_id, description, qty, unit_price, line_total, unit_cost,
        products(code, name, unit)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ImportOrderDetail
}
