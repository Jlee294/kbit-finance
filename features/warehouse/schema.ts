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
  unit_cost:    z.coerce.number().nonnegative('Đơn giá vốn ≥ 0').optional().nullable(),  // giá vốn nhập/đv
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

// ── Quản lý kho (danh mục) ────────────────────────────────────────────────────

export const warehouseAdminSchema = z.object({
  company_id: z.string().uuid('Chọn công ty'),
  code:       z.string().min(1, 'Bắt buộc'),
  name:       z.string().min(1, 'Bắt buộc'),
  note:       z.string().optional().nullable(),
  is_active:  z.boolean().optional(),   // I-3: bật/tắt kho qua UI (kho dừng không hiện ở dropdown nhập/xuất)
  is_default: z.boolean().optional(),   // B: kho chính của công ty (tự dùng khi tạo đơn không chọn kho)
})

export type WarehouseAdminInput = z.infer<typeof warehouseAdminSchema>
