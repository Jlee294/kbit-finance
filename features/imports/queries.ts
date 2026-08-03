import { createClient } from '@/lib/supabase/server'
import { orderCodePrefix } from '@/features/orders/order-code'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'

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
  payable_total: number
  payable_outstanding: number
  landed_cost_vnd: number
  recoverable_import_vat_vnd: number
  vat_amount: number | null
  invoice_no: string | null
  invoice_symbol: string | null
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
  import_cost_components: ImportCostComponentRow[]
  supplier_order_items: ImportItemRow[]
}

export type ImportCostComponentRow = {
  id: string
  kind: 'goods' | 'import_duty' | 'import_vat' | 'freight' | 'service' | 'other'
  creditor_type: 'supplier' | 'tax_authority' | 'service_provider' | 'other'
  creditor_supplier_id: string | null
  description: string | null
  currency: 'VND' | 'KRW'
  amount: number
  exchange_rate: number
  amount_vnd: number
  capitalizable: boolean
  creditor: { code: string; name: string } | null
}

export type ImportItemRow = {
  id: string
  product_id: string | null
  description: string | null
  qty: number
  unit_price: number
  line_total: number    // GENERATED: qty × unit_price
  unit_cost: number | null
  lot_no:      string | null    // KTT G
  expiry_date: string | null    // KTT G
  accounting_treatment: 'inventory' | 'expense' | 'prepaid' | 'tool' | 'fixed_asset' | 'tax_fee' | 'pass_through' | 'contract_penalty' | 'other'
  accounting_category_id: string | null
  products: { code: string; name: string; unit: string | null } | null
}

/** Danh sách đơn nhập khẩu (mới nhất trước) */
export async function listImportOrders(companyId?: string): Promise<ImportOrderRow[]> {
  if (isDemoMode()) {
    return GLA_DATA.purchaseJournal
      .filter((row) => !companyId || row.companyId === companyId)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
      .map((row) => ({
        id: row.id,
        order_code: row.orderCode,
        order_date: row.orderDate,
        order_type: row.orderType,
        currency: 'VND',
        exchange_rate: 1,
        goods_value: row.subtotal,
        import_duty: 0,
        vat_import: 0,
        other_fees: 0,
        cost_total: row.subtotal,
        amount_paid: row.amountPaid,
        outstanding: row.outstanding,
        payable_total: row.subtotal,
        payable_outstanding: row.outstanding,
        landed_cost_vnd: row.subtotal,
        recoverable_import_vat_vnd: 0,
        vat_amount: 0,
        invoice_no: row.invoiceNo,
        invoice_symbol: row.invoiceSymbol,
        is_intercompany: false,
        company_id: row.companyId,
        supplier_id: row.supplierId,
        suppliers: { name: row.supplierName, code: row.supplierCode },
      }))
  }

  const supabase = await createClient()
  let q = supabase
    .from('supplier_orders')
    .select(`
      id, order_code, order_date, order_type, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, payable_total, payable_outstanding,
      landed_cost_vnd, recoverable_import_vat_vnd, is_intercompany,
      vat_amount, invoice_no, invoice_symbol,
      company_id, supplier_id,
      suppliers!supplier_id(name, code),
      inventory_items:supplier_order_items!inner(product_id, source_line_amount)
    `)
    .not('inventory_items.product_id', 'is', null)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: any) => {
    const journalGoods = (row.inventory_items ?? [])
      .reduce((sum: number, item: any) => sum + Number(item.source_line_amount ?? 0), 0)
    const { inventory_items: _, ...rest } = row
    return { ...rest, goods_value: journalGoods || row.goods_value } as ImportOrderRow
  })
}

/** Chi tiết 1 đơn nhập khẩu kèm dòng hàng */
export async function getImportOrder(id: string): Promise<ImportOrderDetail> {
  if (isDemoMode()) {
    const row = GLA_DATA.purchaseJournal.find((item) => item.id === id)
    if (!row) throw new Error('Không tìm thấy nhật ký mua GLA')
    return {
      id: row.id,
      order_code: row.orderCode,
      order_date: row.orderDate,
      order_type: row.orderType,
      currency: 'VND',
      exchange_rate: 1,
      goods_value: row.subtotal,
      import_duty: 0,
      vat_import: 0,
      other_fees: 0,
      cost_total: row.subtotal,
      amount_paid: row.amountPaid,
      outstanding: row.outstanding,
      payable_total: row.subtotal,
      payable_outstanding: row.outstanding,
      landed_cost_vnd: row.subtotal,
      recoverable_import_vat_vnd: 0,
      vat_amount: 0,
      invoice_no: row.invoiceNo,
      invoice_symbol: row.invoiceSymbol,
      is_intercompany: false,
      company_id: row.companyId,
      supplier_id: row.supplierId,
      suppliers: { name: row.supplierName, code: row.supplierCode },
      project_id: null,
      counterpart_company_id: null,
      companies: { name: GLA_DATA.company.name },
      invoice_template: row.invoiceTemplate,
      invoice_date: row.invoiceDate,
      supplier_tax_code: row.supplierTaxCode,
      dinh_khoan_no: '156',
      dinh_khoan_co: '331',
      nhan_su_thuc_hien: null,
      warehouse_id: GLA_DATA.warehouse.id,
      stock_added: true,
      import_cost_components: [],
      supplier_order_items: row.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        description: item.description,
        qty: item.qty,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        unit_cost: item.unitPrice,
        lot_no: item.lotNo,
        expiry_date: item.expiryDate,
        accounting_treatment: 'inventory',
        accounting_category_id: null,
        products: {
          code: item.productCode,
          name: item.productName,
          unit: item.unit,
        },
      })),
    }
  }

  const supabase = await createClient()
  // KTT G: defensive — thử select với lot_no/expiry_date; fallback nếu mig 0045 chưa chạy
  const baseSelect = `
      id, order_code, order_date, order_type, currency, exchange_rate,
      goods_value, import_duty, vat_import, other_fees,
      cost_total, amount_paid, outstanding, payable_total, payable_outstanding,
      landed_cost_vnd, recoverable_import_vat_vnd, is_intercompany,
      company_id, supplier_id, project_id, counterpart_company_id,
      invoice_template, invoice_symbol, invoice_no, invoice_date,
      supplier_tax_code, vat_amount, dinh_khoan_no, dinh_khoan_co,
      nhan_su_thuc_hien, warehouse_id, stock_added,
      suppliers!supplier_id(name, code),
      companies!company_id(name),
      import_cost_components(
        id, kind, creditor_type, creditor_supplier_id, description,
        currency, amount, exchange_rate, amount_vnd, capitalizable,
        creditor:suppliers!creditor_supplier_id(code, name)
      )`
  let data: any = null
  let error: { message: string } | null = null
  const r1 = await supabase
    .from('supplier_orders')
    .select(`${baseSelect},
      supplier_order_items(
        id, product_id, description, qty, unit_price, line_total, unit_cost, lot_no, expiry_date,
        accounting_treatment, accounting_category_id,
        products(code, name, unit)
      )`)
    .eq('id', id)
    .single()
  data = r1.data; error = r1.error
  if (error && /lot_no|expiry_date/i.test(error.message)) {
    const fb = await supabase
      .from('supplier_orders')
      .select(`${baseSelect},
        supplier_order_items(
          id, product_id, description, qty, unit_price, line_total, unit_cost,
          accounting_treatment, accounting_category_id,
          products(code, name, unit)
        )`)
      .eq('id', id)
      .single()
    data = fb.data; error = fb.error
  }
  if (error) throw new Error(error.message)
  return data as unknown as ImportOrderDetail
}

/** Đơn NCC trong nước (VNĐ) còn nợ — gọn cho form phiếu chi (không tải toàn bộ đơn). */
export async function listUnpaidVndSupplierOrders(): Promise<
  { id: string; order_code: string; supplier_id: string; outstanding: number }[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_orders')
    .select('id, order_code, supplier_id, payable_outstanding')
    .eq('currency', 'VND')
    .eq('creates_payable', true)
    .gt('payable_outstanding', 0)
    .order('order_date', { ascending: false })
  if (error) { console.error('[listUnpaidVndSupplierOrders]', error.message); return [] }
  return (data ?? []).map((row) => ({
    id: row.id,
    order_code: row.order_code,
    supplier_id: row.supplier_id,
    outstanding: Number(row.payable_outstanding),
  }))
}

/**
 * Số thứ tự tiếp theo cho mã đơn NCC (dùng khi để trống → tự sinh).
 * Sao quy ước getNextOrderSeq bên bán: max(seq cùng prefix) + 1, dựa max để tránh trùng khi đơn bị xoá.
 * Prefix ví dụ: 'SS-0526-'
 */
export async function getNextSupplierOrderSeq(
  supplierCode: string,
  orderDate: string,
): Promise<number> {
  const supabase = await createClient()
  const prefix = orderCodePrefix(supplierCode, orderDate)

  const { data, error } = await supabase
    .from('supplier_orders')
    .select('order_code')
    .like('order_code', `${prefix}%`)
    .order('order_code', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return 1

  const lastCode = data[0].order_code as string
  const seq = parseInt(lastCode.slice(prefix.length), 10)
  return isNaN(seq) ? 1 : seq + 1
}
