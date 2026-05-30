import type { Database } from '@/types/database'
type Payment = Database['public']['Enums']['payment_status']

export function derivePaymentStatus(grandTotal: number, amountPaid: number): Payment {
  if (grandTotal <= 0 || amountPaid <= 0) return 'unpaid'
  if (amountPaid >= grandTotal) return 'paid'
  return 'partial'
}

/** Tiểu tổng (tổng các dòng hàng, chưa tính chiết khấu / VAT / vận chuyển). */
export function computeGrandTotal(items: { qty: number; unit_price: number }[]): number {
  return items.reduce((s, it) => s + it.qty * it.unit_price, 0)
}

export type OrderTotals = {
  subtotal:       number  // tiểu tổng
  discountAmount: number  // số tiền chiết khấu
  vatBase:        number  // subtotal - discount (cơ sở tính VAT)
  vatAmount:      number  // tiền VAT
  shippingFee:    number  // phí vận chuyển
  grandTotal:     number  // tổng thanh toán
}

/**
 * Tính đầy đủ: subtotal → chiết khấu → VAT → phí ship → grand total.
 * Làm tròn từng bước theo VND (nguyên đồng).
 */
export function computeOrderTotals(
  items: { qty: number; unit_price: number }[],
  discountPct = 0,
  vatPct = 0,
  shippingFee = 0,
): OrderTotals {
  const subtotal       = items.reduce((s, it) => s + it.qty * it.unit_price, 0)
  const discountAmount = Math.round(subtotal * discountPct / 100)
  const vatBase        = subtotal - discountAmount
  const vatAmount      = Math.round(vatBase * vatPct / 100)
  const grandTotal     = vatBase + vatAmount + shippingFee
  return { subtotal, discountAmount, vatBase, vatAmount, shippingFee, grandTotal }
}
