import type { Database } from '@/types/database'
type Payment = Database['public']['Enums']['payment_status']

export function derivePaymentStatus(grandTotal: number, amountPaid: number): Payment {
  if (grandTotal <= 0 || amountPaid <= 0) return 'unpaid'
  if (amountPaid >= grandTotal) return 'paid'
  return 'partial'
}

export function computeGrandTotal(items: { qty: number; unit_price: number }[]): number {
  return items.reduce((s, it) => s + it.qty * it.unit_price, 0)
}
