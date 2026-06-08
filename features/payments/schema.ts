import { z } from 'zod'

export const allocationSchema = z.object({
  customer_order_id: z.string().uuid(),
  allocated_amount:  z.coerce.number().positive('Số tiền phân bổ phải > 0'),
})

export const incomeSchema = z.object({
  company_id:      z.string().uuid(),
  bank_account_id: z.string().uuid(),
  customer_id:     z.string().uuid(),
  amount:          z.coerce.number().positive('Số tiền phiếu thu phải > 0'),
  txn_date:        z.string().min(1, 'Bắt buộc'),
  note:            z.string().optional().nullable(),
  project_id:      z.string().uuid().optional().nullable(),  // [D16]
  dinh_khoan_no:   z.string().optional().nullable(),
  dinh_khoan_co:   z.string().optional().nullable(),
  allocations:     z.array(allocationSchema).default([]),
}).refine(
  (v) => v.allocations.reduce((s, a) => s + a.allocated_amount, 0) <= v.amount,
  { message: 'Tổng phân bổ không được vượt tiền phiếu thu', path: ['allocations'] },
)

export type IncomeInput = z.infer<typeof incomeSchema>

export const assignDepositSchema = z.object({
  income_id:   z.string().uuid(),
  allocations: z.array(allocationSchema).min(1, 'Chọn ít nhất 1 đơn'),
})
export type AssignDepositInput = z.infer<typeof assignDepositSchema>
