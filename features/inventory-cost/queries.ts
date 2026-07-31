import { createClient } from '@/lib/supabase/server'
import { summarizeGrossProfit, pickLatestPeriod, type GrossRow } from './avg-cost'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'

/** Thẻ giá vốn của 1 kỳ (mọi mã). */
export async function listCostCards(period: string) {
  if (isDemoMode()) {
    return (GLA_DATA.inventoryByMonth[period] ?? []).map((row) => ({
      product_id: row.productId,
      period,
      qty_open: row.qtyOpen,
      value_open: row.valueOpen,
      qty_in: row.qtyIn,
      value_in: row.valueIn,
      qty_out: row.qtyOut,
      value_out: row.valueOut,
      avg_unit_cost: row.avgCost,
      qty_close: row.qtyClose,
      value_close: row.valueClose,
      status: 'closed',
      products: { code: row.code, name: row.name },
    }))
  }

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
  if (isDemoMode()) {
    if (companyId && companyId !== GLA_DATA.company.id) return summarizeGrossProfit([])
    const rows: GrossRow[] = []
    for (const order of GLA_DATA.salesJournal) {
      if (order.orderDate < from || order.orderDate > to) continue
      const monthInventory = GLA_DATA.inventoryByMonth[order.orderDate.slice(0, 7)] ?? []
      for (const item of order.items) {
        const inventory = monthInventory.find((row) => row.productId === item.productId)
        const costPrice = inventory && inventory.qtyOut
          ? inventory.valueOut / inventory.qtyOut
          : 0
        rows.push({
          product_id: item.productId,
          qty: item.qty,
          unit_price: item.unitPrice,
          cost_price: costPrice,
          product_code: item.productCode,
          product_name: item.productName,
          order_code: order.orderCode,
          invoice_no: order.invoiceNo ?? undefined,
          recognize_revenue: order.recognizeRevenue,
        })
      }
    }
    return summarizeGrossProfit(rows)
  }

  const supabase = await createClient()
  let q = supabase
    .from('customer_order_items')
    .select('product_id, qty, unit_price, cost_price, products(code,name), customer_orders!inner(order_code, invoice_no, order_date, company_id, recognize_revenue, is_gift)')
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
      invoice_no:   r.customer_orders?.invoice_no,
      recognize_revenue: r.customer_orders?.recognize_revenue !== false,
    }))
  return summarizeGrossProfit(rows)
}

/** Kỳ (YYYY-MM) gần nhất CÓ lãi gộp (dòng bán đã chốt giá vốn — cost_price not null) của công ty.
 *  null nếu chưa có kỳ nào. Dùng làm kỳ mặc định khi mở trang Lãi gộp (tránh mở vào tháng trống). */
export async function latestGrossPeriod(companyId?: string): Promise<string | null> {
  if (isDemoMode()) return !companyId || companyId === GLA_DATA.company.id ? '2026-06' : null

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

/** Giá vốn BQ hiện hành theo mã (cache product_moving_cost). Map product_id → { qty, avg, value }. */
export async function listMovingCostByProduct(): Promise<Map<string, { qty: number; avg: number; value: number }>> {
  if (isDemoMode()) {
    return new Map(GLA_DATA.inventorySummary.map((row) => [
      row.productId,
      { qty: row.qtyClose, avg: row.avgCost, value: row.valueClose },
    ]))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_moving_cost')
    .select('product_id, qty_on_hand, avg_cost')
  const m = new Map<string, { qty: number; avg: number; value: number }>()
  if (error) { console.error('[listMovingCostByProduct]', error.message); return m }
  for (const r of (data ?? []) as any[]) {
    const qty = Number(r.qty_on_hand) || 0
    const avg = Number(r.avg_cost) || 0
    const cur = m.get(r.product_id) ?? { qty: 0, avg: 0, value: 0 }
    cur.qty   += qty
    cur.value += qty * avg
    cur.avg    = cur.qty !== 0 ? cur.value / cur.qty : avg   // BQ gộp nhiều công ty
    m.set(r.product_id, cur)
  }
  return m
}

/** Danh sách số dư đầu kỳ đã khai (txn_type='opening') trong 1 kỳ, kèm mã + kho. */
export async function listOpeningBalances(period: string, companyId?: string) {
  if (isDemoMode()) {
    if (companyId && companyId !== GLA_DATA.company.id) return []
    return (GLA_DATA.inventoryByMonth[period] ?? [])
      .filter((row) => row.qtyOpen !== 0 || row.valueOpen !== 0)
      .map((row) => ({
        product_id: row.productId,
        warehouse_id: GLA_DATA.warehouse.id,
        qty: row.qtyOpen,
        unit_cost: row.qtyOpen ? row.valueOpen / row.qtyOpen : 0,
        value: row.valueOpen,
        product: `[${row.code}] ${row.name}`,
        warehouse: GLA_DATA.warehouse.name,
      }))
  }

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
