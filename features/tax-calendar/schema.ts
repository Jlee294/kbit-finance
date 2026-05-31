import { z } from 'zod'
import { TAX_TYPES } from '@/features/tax-plans/schema'

export const calendarItemSchema = z.object({
  company_id: z.string().uuid(),
  tax_type:   z.enum(TAX_TYPES),
  period:     z.string().min(1),
  due_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hạn nộp định dạng YYYY-MM-DD'),
  status:     z.enum(['pending', 'filed', 'overdue']).default('pending'),
  note:       z.string().optional(),
})

export type CalendarItemInput = z.infer<typeof calendarItemSchema>
