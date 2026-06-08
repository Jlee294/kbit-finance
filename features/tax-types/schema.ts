import { z } from 'zod'

export const taxTypeSchema = z.object({
  code: z.string().min(1, 'Mã không được để trống').max(20, 'Mã tối đa 20 ký tự').trim().toUpperCase(),
  name: z.string().min(1, 'Tên không được để trống').max(120),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.coerce.boolean().default(true),
})

export type TaxTypeInput = z.infer<typeof taxTypeSchema>
