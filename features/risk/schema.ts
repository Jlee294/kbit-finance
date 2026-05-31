import { z } from 'zod'
import { INDICATORS_BY_CODE } from './indicators'

export const thresholdSchema = z.object({
  company_id:     z.string().uuid().nullable(),
  indicator_code: z.string().refine(c => c in INDICATORS_BY_CODE, 'Chỉ tiêu không hợp lệ'),
  yellow_at:      z.coerce.number().nullable(),
  red_at:         z.coerce.number().nullable(),
}).refine(
  v => v.yellow_at != null || v.red_at != null,
  'Phải nhập ít nhất 1 ngưỡng',
)

export type ThresholdInput = z.infer<typeof thresholdSchema>
