import { z } from 'zod'

export const debtOpeningSchema = z.object({
  partner_type:  z.enum(['customer', 'supplier']),
  partner_id:    z.string().uuid('Chon doi tuong'),
  year:          z.coerce.number().int().min(2020).max(2099),
  debit_amount:  z.coerce.number().nonnegative('So Nợ >= 0'),
  credit_amount: z.coerce.number().nonnegative('So Có >= 0'),
  note:          z.string().optional(),
})
