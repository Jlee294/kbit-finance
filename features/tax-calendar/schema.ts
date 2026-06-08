import { z } from 'zod'

export const calendarItemSchema = z.object({
  company_id: z.string().uuid(),
  tax_type:   z.string().min(1, 'Chọn loại thuế'),
  period:     z.string().min(1),
  due_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hạn nộp định dạng YYYY-MM-DD'),
  status:     z.enum(['pending', 'filed', 'overdue']).default('pending'),
  note:       z.string().optional(),
})

export type CalendarItemInput = z.infer<typeof calendarItemSchema>
