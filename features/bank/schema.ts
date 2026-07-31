import { z } from 'zod'

export const bankOpeningSchema = z.object({
  company_id: z.string().uuid('Công ty không hợp lệ'),
  bank_account_id: z.string().uuid('Tài khoản ngân hàng không hợp lệ'),
  year: z.coerce.number().int().min(2020).max(2099),
  amount: z.coerce.number()
    .finite('Số dư không hợp lệ')
    .min(-999_999_999_999_999, 'Số dư vượt giới hạn')
    .max(999_999_999_999_999, 'Số dư vượt giới hạn'),
  note: z.string().trim().max(500).optional().nullable(),
})

export const demoBankOpeningSchema = bankOpeningSchema.extend({
  company_id: z.string().trim().min(1).max(100),
  bank_account_id: z.string().trim().min(1).max(100),
})

export type BankOpeningInput = z.infer<typeof bankOpeningSchema>
