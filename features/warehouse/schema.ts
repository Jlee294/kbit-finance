import { z } from 'zod'

export const ISSUE_REASONS = ['sale', 'damage', 'sample', 'other'] as const
export type IssueReason = (typeof ISSUE_REASONS)[number]

export const ISSUE_REASON_LABELS: Record<IssueReason, string> = {
  sale:   'Bán hàng',
  damage: 'Hỏng hóc',
  sample: 'Hàng mẫu',
  other:  'Lý do khác',
}

export const TXN_TYPE_LABELS: Record<string, string> = {
  receipt:         'Nhập kho',
  issue:           'Xuất kho',
  transfer_out:    'Luân chuyển ra',
  transfer_in:     'Luân chuyển vào',
  order_deduction: 'Xuất theo đơn',
  adjustment:      'Điều chỉnh',
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const receiptSchema = z.object({
  warehouse_id: z.string().uuid('Chọn kho'),
  product_id:   z.string().uuid('Chọn sản phẩm'),
  qty:          z.coerce.number().positive('Số lượng phải > 0'),
  txn_date:     z.string().regex(dateRegex, 'Ngày không hợp lệ'),
  note:         z.string().optional().nullable(),
})

export const issueSchema = receiptSchema.extend({
  reason: z.enum(ISSUE_REASONS),
})

export const transferSchema = z.object({
  from_warehouse_id: z.string().uuid('Chọn kho nguồn'),
  to_warehouse_id:   z.string().uuid('Chọn kho đích'),
  product_id:        z.string().uuid('Chọn sản phẩm'),
  qty:               z.coerce.number().positive('Số lượng phải > 0'),
  txn_date:          z.string().regex(dateRegex, 'Ngày không hợp lệ'),
  note:              z.string().optional().nullable(),
}).refine(v => v.from_warehouse_id !== v.to_warehouse_id, {
  message: 'Kho nguồn và kho đích không được giống nhau',
  path: ['to_warehouse_id'],
})

export type ReceiptInput   = z.infer<typeof receiptSchema>
export type IssueInput     = z.infer<typeof issueSchema>
export type TransferInput  = z.infer<typeof transferSchema>
