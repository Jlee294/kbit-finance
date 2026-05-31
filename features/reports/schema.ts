import { z } from 'zod'

export const reportFilterSchema = z.object({
  companyId:  z.string().uuid(),
  projectId:  z.string().uuid().optional(),
  from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const consolidatedFilterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type ReportFilter      = z.infer<typeof reportFilterSchema>
export type ConsolidatedFilter = z.infer<typeof consolidatedFilterSchema>
