import { z } from 'zod'

export const bankAccountSchema = z.object({
  company_id: z.string().uuid('Bắt buộc chọn công ty'),
  name: z.string().min(1, 'Bắt buộc'),
  currency: z.enum(['VND', 'KRW']),
  account_no: z.string().optional().nullable(),
})

export type BankAccountInput = z.infer<typeof bankAccountSchema>
