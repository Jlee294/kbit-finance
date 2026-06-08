/**
 * Tính tiền cho 1 dòng "Bảng kê mua vào" từ một đơn supplier_orders.
 *
 * LƯU Ý GỐC: bảng `supplier_orders` KHÔNG có cột `grand_total` (khác với
 * `customer_orders`). Trước đây query đọc `grand_total` ở supplier_orders nên
 * lỗi và bảng kê mua vào trống. Ở đây tự tính từ các cột có thật.
 *
 * Quy ước (bảng kê hóa đơn GTGT mua vào — chuẩn VN):
 *   - subtotal   = tiền hàng chưa VAT (= goods_value)
 *   - vat_amount = số VAT của hóa đơn (ưu tiên vat_amount, không có thì vat_import)
 *   - grand_total = subtotal + vat_amount
 * Đơn ngoại tệ (KRW) quy về VND bằng exchange_rate để cột tiền đồng nhất VND.
 */
export interface PurchaseTotalInput {
  goods_value:   number | null
  vat_import:    number | null
  vat_amount:    number | null
  currency:      string | null
  exchange_rate: number | null
}

export interface PurchaseTotals {
  subtotal:    number
  vat_amount:  number
  grand_total: number
}

export function computePurchaseInvoiceTotals(o: PurchaseTotalInput): PurchaseTotals {
  const rate = o.currency === 'KRW' ? Number(o.exchange_rate ?? 0) : 1
  const subtotal   = Number(o.goods_value ?? 0) * rate
  const vatNative  = o.vat_amount != null ? Number(o.vat_amount) : Number(o.vat_import ?? 0)
  const vat_amount = vatNative * rate
  return {
    subtotal,
    vat_amount,
    grand_total: subtotal + vat_amount,
  }
}
