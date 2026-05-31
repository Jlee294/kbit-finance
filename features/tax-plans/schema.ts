import { z } from 'zod'

export const TAX_TYPES = ['GTGT', 'TNDN', 'TNCN', 'FCT', 'BHXH'] as const
export type TaxType = (typeof TAX_TYPES)[number]

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  GTGT: 'Thuế GTGT',
  TNDN: 'Thuế TNDN',
  TNCN: 'Thuế TNCN',
  FCT:  'Thuế nhà thầu (FCT)',
  BHXH: 'BHXH',
}

export const taxPlanLineSchema = z.object({
  tax_type:       z.enum(TAX_TYPES),
  period:         z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/, 'Định dạng YYYY-MM hoặc YYYY-Qx'),
  planned_amount: z.coerce.number().min(0),
})

export const taxPlanSchema = z.object({
  company_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  year:       z.coerce.number().int().min(2020).max(2100),
  plan_data:  z.object({ lines: z.array(taxPlanLineSchema) }),
})

export type TaxPlanLine  = z.infer<typeof taxPlanLineSchema>
export type TaxPlanInput = z.infer<typeof taxPlanSchema>
