import { z } from 'zod'

export const brandSchema = z.object({
  code:       z.string().min(1, 'Bắt buộc'),
  name:       z.string().min(1, 'Bắt buộc'),
  sort_order: z.coerce.number().int().min(0).default(0),
})

export type BrandInput = z.infer<typeof brandSchema>
