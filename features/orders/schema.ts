import { z } from 'zod'

export const FULFILLMENT = ['draft', 'confirmed', 'awaiting_goods', 'delivered'] as const

export const orderItemSchema = z.object({
  product_id:  z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  qty:         z.coerce.number().positive('Số lượng phải > 0'),
  unit_price:  z.coerce.number().min(0, 'Đơn giá không âm'),
  lot_no:      z.string().optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).refine((it) => !!it.product_id || (it.description?.trim()?.length ?? 0) > 0, {
  message: 'Mỗi dòng phải chọn sản phẩm hoặc nhập mô tả',
  path: ['description'],
})

export const createOrderSchema = z.object({
  company_id: z.string().uuid('Chọn công ty'),
  project_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid('Chọn khách hàng'),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fulfillment_status: z.enum(FULFILLMENT).default('confirmed'),
  lot_no: z.string().optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  is_intercompany: z.coerce.boolean().default(false),
  counterpart_company_id: z.string().uuid().optional().nullable(),
  discount_pct:  z.coerce.number().min(0).max(100).default(0),
  vat_pct:       z.coerce.number().min(0).max(100).default(0),
  shipping_fee:  z.coerce.number().min(0).default(0),
  warehouse_id:  z.string().uuid().optional().nullable(),
  items: z.array(orderItemSchema).min(1, 'Đơn phải có ít nhất 1 dòng hàng'),
}).refine((v) => !v.is_intercompany || !!v.counterpart_company_id, {
  message: 'Giao dịch nội bộ phải chọn công ty đối tác',
  path: ['counterpart_company_id'],
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export const updateOrderSchema = createOrderSchema
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
