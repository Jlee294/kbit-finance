import { z } from 'zod'

export const manufacturerSchema = z.object({
  code:      z.string().min(1, 'Bắt buộc'),
  name:      z.string().min(1, 'Bắt buộc'),
  country:   z.string().default('KR'),
  phone:     z.string().optional().nullable(),
  email:     z.string().optional().nullable(),
  address:   z.string().optional().nullable(),
  note:      z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
})

export type ManufacturerInput = z.infer<typeof manufacturerSchema>

export const PRICE_CURRENCIES = ['KRW', 'VND', 'USD'] as const

export const manufacturerPriceSchema = z.object({
  manufacturer_id:    z.string().uuid(),
  product_id:         z.string().uuid('Chọn sản phẩm'),
  unit_price:         z.coerce.number().positive('Đơn giá > 0'),
  currency:           z.enum(PRICE_CURRENCIES).default('KRW'),
  moq:                z.coerce.number().int().nonnegative().optional().nullable(),
  effective_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ'),
  includes_bottle:    z.boolean().default(false),
  includes_packaging: z.boolean().default(false),
  note:               z.string().optional().nullable(),
})

export type ManufacturerPriceInput = z.infer<typeof manufacturerPriceSchema>
