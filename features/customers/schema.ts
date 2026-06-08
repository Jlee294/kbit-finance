import { z } from 'zod'

export const customerSchema = z.object({
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  tax_code: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export type CustomerInput = z.infer<typeof customerSchema>
