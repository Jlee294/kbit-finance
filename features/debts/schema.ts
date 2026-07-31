import { z } from 'zod'

export const debtOpeningSchema = z.object({
  partner_type:  z.enum(['customer', 'supplier']),
  partner_id:    z.string().uuid('Chon doi tuong'),
  year:          z.coerce.number().int().min(2020).max(2099),
  debit_amount:  z.coerce.number().nonnegative('So Nợ >= 0'),
  credit_amount: z.coerce.number().nonnegative('So Có >= 0'),
  note:          z.string().optional(),
}).refine(
  (value) => !(value.debit_amount > 0 && value.credit_amount > 0),
  {
    message: 'Một đối tượng chỉ được có dư Nợ hoặc dư Có tại cùng thời điểm',
    path: ['credit_amount'],
  },
)
