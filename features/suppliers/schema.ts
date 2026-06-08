import { z } from 'zod'

export const supplierSchema = z.object({
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  country: z.enum(['VN', 'KR']),
  tax_code: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export type SupplierInput = z.infer<typeof supplierSchema>
