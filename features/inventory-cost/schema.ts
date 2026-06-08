import { z } from 'zod'

export const openingStockSchema = z.object({
  product_id:   z.string().uuid('Chọn mã hàng'),
  warehouse_id: z.string().uuid('Chọn kho'),
  period:       z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'),
  qty:          z.coerce.number().nonnegative('SL ≥ 0'),
  unit_cost:    z.coerce.number().nonnegative('Đơn giá vốn ≥ 0'),
})

export const closePeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'),
  company_id: z.string().uuid('Chọn công ty'),
})

export type OpeningStockInput = z.infer<typeof openingStockSchema>
