import { createClient } from '@/lib/supabase/server'
import { orderCodePrefix } from './order-code'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderListRow = {
  id: string
  order_code: string
  order_date: string
  delivery_date: string | null
  grand_total: number
  amount_paid: number
  outstanding: number
  fulfillment_status: string
  payment_status: string
  lot_no: string | null
  discount_pct: number
  vat_pct: number
  shipping_fee: number
  created_at: string
  customer: { id: string; code: string; name: string }
  company: { id: string; name: string }
  project: { id: string; name: string } | null
}

export type OrderDetail = OrderListRow & {
  expiry_date: string | null
  is_intercompany: boolean
  counterpart_company_id: string | null
  counterpart_company: { id: string; name: string } | null
  warehouse_id: string | null
  warehouse: { id: string; code: string; name: string } | null
  stock_deducted: boolean
  // Hóa đơn
  invoice_template:  string | null
  invoice_symbol:    string | null
  invoice_no:        string | null
  invoice_date:      string | null
  customer_tax_code: string | null
  vat_amount:        number | null
  dinh_khoan_no:     string | null
  dinh_khoan_co:     string | null
  items: OrderItem[]
}

export type OrderItem = {
  id: string
  product_id: string | null
  description: string | null
  qty: number
  unit_price: number
  line_total: number
  lot_no: string | null
  expiry_date: string | null
  product: { id: string; name: string; code: string } | null
}

export type OrderRef = {
  id: string
  order_code: string
  order_date: string
  outstanding: number
  customer_id: string
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Danh sách đơn hàng (phân trang, lọc theo công ty / khách / trạng thái) */
export async function listOrders({
  companyId,
  customerId,
  fulfillmentStatus,
  paymentStatus,
  from,
  to,
  page = 1,
  pageSize = 30,
}: {
  companyId?: string
  customerId?: string
  fulfillmentStatus?: string
  paymentStatus?: string
  from?: string   // YYYY-MM-DD
  to?: string     // YYYY-MM-DD
  page?: number
  pageSize?: number
} = {}) {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  let q = supabase
    .from('customer_orders')
    .select(
      `id, order_code, order_date, delivery_date,
       grand_total, amount_paid, outstanding,
       fulfillment_status, payment_status,
       lot_no, discount_pct, vat_pct, shipping_fee, created_at,
       customer:customers!customer_id(id, code, name),
       company:companies!company_id(id, name),
       project:projects!project_id(id, name)`,
      { count: 'exact' },
    )
    .order('order_date', { ascending: false })
    .order('order_code', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (companyId) q = q.eq('company_id', companyId)
  if (customerId) q = q.eq('customer_id', customerId)
  if (fulfillmentStatus) q = q.eq('fulfillment_status', fulfillmentStatus)
  if (paymentStatus) q = q.eq('payment_status', paymentStatus)
  if (from) q = q.gte('order_date', from)
  if (to) q = q.lte('order_date', to)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  return {
    rows: (data ?? []) as unknown as OrderListRow[],
    total: count ?? 0,
    page,
    pageSize,
  }
}

/** Chi tiết 1 đơn hàng kèm items */
export async function getOrder(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_orders')
    .select(
      `id, order_code, order_date, delivery_date, expiry_date,
       grand_total, amount_paid, outstanding,
       fulfillment_status, payment_status,
       lot_no, discount_pct, vat_pct, shipping_fee,
       is_intercompany, counterpart_company_id,
       warehouse_id, stock_deducted,
       invoice_template, invoice_symbol, invoice_no, invoice_date,
       customer_tax_code, vat_amount, dinh_khoan_no, dinh_khoan_co,
       created_at,
       customer:customers!customer_id(id, code, name),
       company:companies!company_id(id, name),
       project:projects!project_id(id, name),
       counterpart_company:companies!counterpart_company_id(id, name),
       warehouse:warehouses!warehouse_id(id, code, name),
       items:customer_order_items(
         id, product_id, description, qty, unit_price, line_total,
         lot_no, expiry_date,
         product:products(id, name, code)
       )`,
    )
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null   // không tìm thấy
    throw new Error(error.message)
  }

  return data as unknown as OrderDetail
}

/**
 * Lấy số thứ tự tiếp theo cho mã đơn hàng.
 * Dùng max(seq) + 1 để tránh trùng khi đơn bị xoá.
 * Prefix ví dụ: 'FEMI-0526-'
 */
export async function getNextOrderSeq(
  customerCode: string,
  orderDate: string,
): Promise<number> {
  const supabase = await createClient()
  const prefix = orderCodePrefix(customerCode, orderDate)

  // Lấy mã đơn lớn nhất có cùng prefix
  const { data, error } = await supabase
    .from('customer_orders')
    .select('order_code')
    .like('order_code', `${prefix}%`)
    .order('order_code', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)

  if (!data || data.length === 0) return 1

  // Phần cuối: 'FEMI-0526-07' → '07' → 7
  const lastCode = data[0].order_code as string
  const seqStr = lastCode.slice(prefix.length)
  const seq = parseInt(seqStr, 10)
  return isNaN(seq) ? 1 : seq + 1
}

/**
 * Gợi ý đơn giá: lấy đơn giá lần cuối bán sản phẩm này cho khách.
 * Trả về null nếu chưa từng bán.
 */
export async function getLastUnitPrice(
  productId: string,
  customerId: string,
): Promise<number | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_order_items')
    .select(
      `unit_price,
       order:customer_orders!order_id(customer_id, order_date)`,
    )
    .eq('product_id', productId)
    .order('order_id', { ascending: false })   // proxy cho order_date
    .limit(20)  // lấy 20 để lọc theo customer

  if (error) throw new Error(error.message)

  // Lọc dòng có khách hàng phù hợp (join không filter được trực tiếp qua FK)
  const match = (data ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row: any) => row.order?.customer_id === customerId,
  )

  return match ? Number(match.unit_price) : null
}

/**
 * Danh sách đơn còn công nợ (dùng khi tạo phiếu thu / phân bổ thanh toán).
 */
export async function listUnpaidOrderRefs(customerId: string): Promise<OrderRef[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_orders')
    .select('id, order_code, order_date, outstanding, customer_id')
    .eq('customer_id', customerId)
    .gt('outstanding', 0)
    .order('order_date', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as OrderRef[]
}
