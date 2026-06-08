import { createClient } from '@/lib/supabase/server'
import { summarizeGrossProfit, pickLatestPeriod, type GrossRow } from './avg-cost'

/** Thẻ giá vốn của 1 kỳ (mọi mã). */
export async function listCostCards(period: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_cost_periods')
    .select('product_id, period, qty_open, value_open, qty_in, value_in, qty_out, value_out, avg_unit_cost, qty_close, value_close, status, products(code, name)')
    .eq('period', period)
    .order('status')
  return data ?? []
}

/** Lãi gộp 3 mức trong khoảng ngày [from, to] (chỉ dòng bán đã chốt giá vốn — cost_price not null).
 *  Lọc theo công ty của ĐƠN (đa công ty: mỗi công ty bộ số riêng). from/to = NĂM (global) + THÁNG (per-sheet). */
export async function grossProfit(from: string, to: string, companyId?: string) {
  const supabase = await createClient()
  let q = supabase
    .from('customer_order_items')
    .select('product_id, qty, unit_price, cost_price, products(code,name), customer_orders!inner(order_code, order_date, company_id)')
    .not('cost_price', 'is', null)
    .limit(10000)
  if (companyId) q = q.eq('customer_orders.company_id', companyId)
  const { data } = await q
  const rows: GrossRow[] = (data ?? [])
    .filter((r: any) => {
      const od = r.customer_orders?.order_date ?? ''
      return r.product_id && od >= from && od <= to
    })
    .map((r: any) => ({
      product_id:   r.product_id,
      qty:          Number(r.qty),
      unit_price:   Number(r.unit_price),
      cost_price:   r.cost_price != null ? Number(r.cost_price) : null,
      product_code: r.products?.code,
      product_name: r.products?.name,
      order_code:   r.customer_orders?.order_code,
    }))
  return summarizeGrossProfit(rows)
}

/** Kỳ (YYYY-MM) gần nhất CÓ lãi gộp (dòng bán đã chốt giá vốn — cost_price not null) của công ty.
 *  null nếu chưa có kỳ nào. Dùng làm kỳ mặc định khi mở trang Lãi gộp (tránh mở vào tháng trống). */
export async function latestGrossPeriod(companyId?: string): Promise<string | null> {
  const supabase = await createClient()
  let q = supabase
    .from('customer_order_items')
    .select('customer_orders!inner(order_date, company_id)')
    .not('cost_price', 'is', null)
    .limit(10000)
  if (companyId) q = q.eq('customer_orders.company_id', companyId)
  const { data } = await q
  const dates = (data ?? []).map((r: any) => r.customer_orders?.order_date ?? '')
  return pickLatestPeriod(dates)
}

/** Danh sách số dư đầu kỳ đã khai (txn_type='opening') trong 1 kỳ, kèm mã + kho. */
export async function listOpeningBalances(period: string, companyId?: string) {
  const supabase = await createClient()
  const start = `${period}-01`
  let q = supabase
    .from('warehouse_transactions')
    .select('product_id, warehouse_id, qty, unit_cost, products(code,name), warehouses(code,name)')
    .eq('txn_type', 'opening')
    .eq('txn_date', start)
  if (companyId) q = q.eq('company_id', companyId)
  const { data } = await q.order('product_id')
  return (data ?? []).map((r: any) => ({
    product_id:   r.product_id,
    warehouse_id: r.warehouse_id,
    qty:          Number(r.qty),
    unit_cost:    r.unit_cost != null ? Number(r.unit_cost) : 0,
    value:        Number(r.qty) * (r.unit_cost != null ? Number(r.unit_cost) : 0),
    product:      r.products ? `[${r.products.code}] ${r.products.name}` : r.product_id,
    warehouse:    r.warehouses ? r.warehouses.name : r.warehouse_id,
  }))
}
