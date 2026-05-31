import { z } from 'zod'

export const COST_CURRENCIES = ['VND', 'KRW', 'USD'] as const
export type CostCurrency = (typeof COST_CURRENCIES)[number]

export const CURR_SYMBOL: Record<CostCurrency, string> = {
  VND: 'đ',
  KRW: '₩',
  USD: '$',
}

export const productSchema = z.object({
  code:  z.string().min(1, 'Bắt buộc'),
  name:  z.string().min(1, 'Bắt buộc'),
  unit:  z.string().min(1, 'Bắt buộc'),

  brand_id: z.string().uuid().optional().nullable(),

  // Chi phí sản xuất (nguyên liệu, đóng gói, vận chuyển)
  cost_material:       z.coerce.number().min(0).optional().nullable(),
  cost_material_curr:  z.enum(COST_CURRENCIES).default('KRW'),
  cost_bottle:         z.coerce.number().min(0).optional().nullable(),
  cost_bottle_curr:    z.enum(COST_CURRENCIES).default('KRW'),
  cost_packaging:      z.coerce.number().min(0).optional().nullable(),
  cost_packaging_curr: z.enum(COST_CURRENCIES).default('KRW'),
  cost_shipping:       z.coerce.number().min(0).optional().nullable(),
  cost_shipping_curr:  z.enum(COST_CURRENCIES).default('KRW'),

  // Giá niêm yết
  price_list_kr: z.coerce.number().min(0).optional().nullable(), // KRW
  price_list_vn: z.coerce.number().min(0).optional().nullable(), // VND
})

export type ProductInput = z.infer<typeof productSchema>
