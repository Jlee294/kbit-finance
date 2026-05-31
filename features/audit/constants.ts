// Shared constants — NO server imports, safe for client components.

export const AUDITABLE_TABLES = [
  'income_transactions',
  'expense_transactions',
  'customer_orders',
  'supplier_orders',
  'payment_allocations',
  'supplier_order_items',
  'documents',
] as const

export type AuditableTable = (typeof AUDITABLE_TABLES)[number]

export const TABLE_LABELS: Record<string, string> = {
  income_transactions:  'Thu tiền',
  expense_transactions: 'Chi phí',
  customer_orders:      'Đơn hàng',
  supplier_orders:      'Nhập khẩu',
  payment_allocations:  'Phân bổ thu',
  supplier_order_items: 'Dòng hàng NK',
  documents:            'Chứng từ',
}
