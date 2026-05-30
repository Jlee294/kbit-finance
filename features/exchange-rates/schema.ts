import { z } from 'zod'

export const exchangeRateSchema = z.object({
  currency_from: z.enum(['VND', 'KRW']),
  currency_to: z.enum(['VND', 'KRW']),
  rate: z.number().positive('Tỷ giá phải lớn hơn 0'),
  rate_date: z.string().min(1, 'Bắt buộc'),
  source: z.string().optional().nullable(),
})

export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>
