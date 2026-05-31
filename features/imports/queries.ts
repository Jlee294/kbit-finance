import { createClient } from '@/lib/supabase/server'

export type ImportOrderRow = {
  id: string
  order_code: string
  order_date: string
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
      id, order_code, order_date, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, is_intercompany,
      company_id, supplier_id,
      suppliers!supplier_id(name, code)
    `)
    .eq('order_type', 'import')
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
      id, order_code, order_date, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, is_intercompany,
      company_id, supplier_id, project_id, counterpart_company_id,
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
