import { z } from 'zod'

export const operationSchema = z.object({
  code: z
    .string()
    .min(1, 'Mã không được để trống')
    .max(60)
    .trim()
    .toUpperCase(),
  name: z.string().min(1, 'Tên không được để trống').max(160),
  group_name: z.string().max(60).optional().nullable(),
  tax_gtgt: z.string().max(40).optional().nullable(),
  tax_tndn_deductible: z.boolean().default(false),
  tax_tncn: z.string().max(40).optional().nullable(),
  tax_fct: z.string().max(40).optional().nullable(),
  required_doc_type_ids: z.array(z.string().uuid()).default([]),
  recommended_doc_type_ids: z.array(z.string().uuid()).default([]),
  notes: z.string().max(500).optional().nullable(),
})

export type OperationInput = z.infer<typeof operationSchema>
