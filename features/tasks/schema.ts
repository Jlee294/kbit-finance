import { z } from 'zod'

export const TASK_STATUSES = ['open', 'in_progress', 'done', 'overdue'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open:        'Chờ xử lý',
  in_progress: 'Đang làm',
  done:        'Hoàn thành',
  overdue:     'Quá hạn',
}

export const createTaskSchema = z.object({
  title:       z.string().min(1, 'Tiêu đề không được để trống'),
  due_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  assigned_to: z.string().uuid().optional().nullable(),
  note:        z.string().optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
