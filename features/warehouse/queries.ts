import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface Warehouse {
  id: string
  code: string
  name: string
  is_active: boolean
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
}

export const listWarehouses = cache(async (): Promise<Warehouse[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses').select('id, code, name, is_active')
    .eq('is_active', true).order('code')
  if (error) { console.error('[listWarehouses]', error.message); return [] }
  return (data ?? []) as Warehouse[]
})

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
  limit?: number
}): Promise<TxnRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('warehouse_transactions')
    .select(`
      id, txn_date, txn_type, qty, reason, note, ref_order_id,
      warehouses!warehouse_id        ( name ),
      products!product_id            ( code, name ),
      to_wh:warehouses!to_warehouse_id ( name ),
      users!created_by               ( full_name )
    `)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.warehouseId) q = q.eq('warehouse_id', opts.warehouseId)
  if (opts.productId)   q = q.eq('product_id', opts.productId)
  if (opts.txnType)     q = q.eq('txn_type', opts.txnType)

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
    warehouses: { name: string } | null
    products: { code: string; name: string } | null
    to_wh: { name: string } | null
    users: { full_name: string } | null
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
