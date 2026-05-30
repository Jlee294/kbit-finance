import { z } from 'zod'

export const projectSchema = z.object({
  company_id: z.string().uuid('Bắt buộc chọn công ty'),
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
})

export type ProjectInput = z.infer<typeof projectSchema>
