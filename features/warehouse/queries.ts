import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface Warehouse {
  id: string
  code: string
  name: string
  is_active: boolean
  is_default: boolean
  company_id: string
}

export interface StockRow {
  warehouse_id:   string
  warehouse_code: string
  warehouse_name: string
  product_id:     string
  product_code:   string
  product_name:   string
  unit:           string | null
  qty_on_hand:    number
}

export interface TxnRow {
  id:               string
  txn_date:         string
  txn_type:         string
  warehouse_name:   string
  product_name:     string
  product_code:     string
  qty:              number
  reason:           string | null
  note:             string | null
  to_warehouse_name: string | null
  ref_order_id:     string | null
  created_by_name:  string | null
  company_name:     string
  has_invoice:      boolean   // KTT C3
}

export const listWarehouses = cache(async (companyId?: string): Promise<Warehouse[]> => {
  const supabase = await createClient()
  let q = supabase
    .from('warehouses').select('id, code, name, is_active, is_default, company_id')
    .eq('is_active', true)
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q.order('code')
  if (error) { console.error('[listWarehouses]', error.message); return [] }
  return (data ?? []) as Warehouse[]
})

/** Kho mặc định (kho chính) của 1 công ty — gọi RPC kbit_default_warehouse.
 *  Trả null nếu công ty không có kho active. Dùng để tự điền kho khi tạo đơn bán/mua. */
export async function defaultWarehouseId(companyId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_default_warehouse', { p_company_id: companyId })
  if (error) { console.error('[defaultWarehouseId]', error.message); return null }
  return (data as string | null) ?? null
}

export const listStock = cache(async (warehouseId?: string): Promise<StockRow[]> => {
  const supabase = await createClient()
  let q = supabase
    .from('warehouse_stock')
    .select(`
      warehouse_id,
      warehouses!warehouse_id ( code, name ),
      product_id,
      products!product_id ( code, name, unit ),
      qty_on_hand
    `)
    .gt('qty_on_hand', 0)
    .order('qty_on_hand', { ascending: false })

  if (warehouseId) q = q.eq('warehouse_id', warehouseId)

  const { data, error } = await q
  if (error) { console.error('[listStock]', error.message); return [] }

  interface StockRaw {
    warehouse_id: string
    warehouses: { code: string; name: string } | null
    product_id: string
    products: { code: string; name: string; unit: string | null } | null
    qty_on_hand: number
  }
  return ((data ?? []) as unknown as StockRaw[]).map((r) => ({
    warehouse_id:   r.warehouse_id,
    warehouse_code: r.warehouses?.code ?? '',
    warehouse_name: r.warehouses?.name ?? '',
    product_id:     r.product_id,
    product_code:   r.products?.code ?? '',
    product_name:   r.products?.name ?? '',
    unit:           r.products?.unit ?? null,
    qty_on_hand:    r.qty_on_hand,
  }))
})

export async function listTransactions(opts: {
  warehouseId?: string
  productId?: string
  txnType?: string
  companyId?: string
  onlyNoInvoice?: boolean   // KTT C3: filter chưa có hóa đơn
  limit?: number
}): Promise<TxnRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('warehouse_transactions')
    .select(`
      id, txn_date, txn_type, qty, reason, note, ref_order_id, has_invoice,
      warehouses!warehouse_id        ( name ),
      products!product_id            ( code, name ),
      to_wh:warehouses!to_warehouse_id ( name ),
      users!created_by               ( full_name ),
      companies!company_id           ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.warehouseId)   q = q.eq('warehouse_id', opts.warehouseId)
  if (opts.productId)     q = q.eq('product_id', opts.productId)
  if (opts.txnType)       q = q.eq('txn_type', opts.txnType)
  if (opts.companyId)     q = q.eq('company_id', opts.companyId)
  if (opts.onlyNoInvoice) q = q.eq('has_invoice', false)

  const { data, error } = await q
  if (error) { console.error('[listTransactions]', error.message); return [] }

  interface TxnRaw {
    id: string
    txn_date: string
    txn_type: string
    qty: number
    reason: string | null
    note: string | null
    ref_order_id: string | null
    has_invoice: boolean | null
    warehouses: { name: string } | null
    products: { code: string; name: string } | null
    to_wh: { name: string } | null
    users: { full_name: string } | null
    companies: { name: string } | null
  }
  return ((data ?? []) as unknown as TxnRaw[]).map((r) => ({
    id:               r.id,
    txn_date:         r.txn_date,
    txn_type:         r.txn_type,
    warehouse_name:   r.warehouses?.name ?? '',
    product_code:     r.products?.code ?? '',
    product_name:     r.products?.name ?? '',
    qty:              r.qty,
    reason:           r.reason ?? null,
    note:             r.note ?? null,
    to_warehouse_name: r.to_wh?.name ?? null,
    ref_order_id:     r.ref_order_id ?? null,
    created_by_name:  r.users?.full_name ?? null,
    company_name:     r.companies?.name ?? '',
    has_invoice:      r.has_invoice ?? true,
  }))
}

export async function getStockQty(warehouseId: string, productId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('warehouse_stock')
    .select('qty_on_hand')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .single()
  return data?.qty_on_hand ?? 0
}

export interface NxtRow {
  product_id: string; code: string; name: string; unit: string | null
  qty_open: number; value_open: number; qty_in: number; value_in: number
  qty_out: number; value_out: number; qty_close: number; value_close: number; avg_cost: number
}

/** Bảng Nhập-Xuất-Tồn theo kỳ (YYYY-MM), tùy chọn lọc 1 kho. Suy từ sổ cái (RPC kbit_inventory_nxt). */
export async function listInventoryNxt(period: string, warehouseId?: string, companyId?: string): Promise<NxtRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_inventory_nxt', {
    p_period: period,
    p_warehouse_id: warehouseId ?? null,
    p_company_id: companyId ?? null,
  })
  if (error) { console.error('[listInventoryNxt]', error.message); return [] }
  return ((data ?? []) as any[]).map((r) => ({
    product_id: r.product_id, code: r.code, name: r.name, unit: r.unit,
    qty_open: Number(r.qty_open), value_open: Number(r.value_open),
    qty_in: Number(r.qty_in), value_in: Number(r.value_in),
    qty_out: Number(r.qty_out), value_out: Number(r.value_out),
    qty_close: Number(r.qty_close), value_close: Number(r.value_close), avg_cost: Number(r.avg_cost),
  }))
}

// ── Quản lý kho (danh mục) ────────────────────────────────────────────────────

export interface WarehouseAdminRow {
  id:           string
  code:         string
  name:         string
  note:         string | null
  is_active:    boolean
  is_default:   boolean
  company_id:   string
  company_name: string
}

export const listWarehousesAdmin = cache(async (): Promise<WarehouseAdminRow[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, code, name, note, is_active, is_default, company_id, companies!company_id ( code, name )')
    .order('company_id')
  if (error) { console.error('[listWarehousesAdmin]', error.message); return [] }

  interface WhRaw {
    id: string
    code: string
    name: string
    note: string | null
    is_active: boolean
    is_default: boolean
    company_id: string
    companies: { code: string; name: string } | null
  }
  return ((data ?? []) as unknown as WhRaw[]).map((r) => ({
    id:           r.id,
    code:         r.code,
    name:         r.name,
    note:         r.note ?? null,
    is_active:    r.is_active,
    is_default:   r.is_default,
    company_id:   r.company_id,
    company_name: r.companies ? `${r.companies.code} — ${r.companies.name}` : '',
  }))
})
