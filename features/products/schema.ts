import { z } from 'zod'

export const productSchema = z.object({
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  unit: z.string().min(1, 'Bắt buộc'),
})

export type ProductInput = z.infer<typeof productSchema>
