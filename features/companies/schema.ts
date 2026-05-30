import { z } from 'zod'

export const companySchema = z.object({
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  country: z.enum(['VN', 'KR']),
  base_currency: z.enum(['VND', 'KRW']),
})

export type CompanyInput = z.infer<typeof companySchema>
