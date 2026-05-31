'use server'

import { revalidatePath }   from 'next/cache'
import { createClient }     from '@/lib/supabase/server'
import { taxPlanSchema }    from './schema'

export async function upsertTaxPlan(raw: unknown) {
  const parsed = taxPlanSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((e: any) => e.message).join('; '))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tax_plans')
    .upsert(
      {
        company_id: parsed.data.company_id,
        project_id: parsed.data.project_id ?? null,
        year:       parsed.data.year,
        plan_data:  parsed.data.plan_data,
      },
      { onConflict: 'company_id,year' },
    )
  if (error) throw new Error(error.message)
  revalidatePath('/ke-hoach-thue')
}

export async function deleteTaxPlanLine(
  companyId: string,
  year:      number,
  taxType:   string,
  period:    string,
) {
  const supabase = await createClient()
  const { data: plan, error: re } = await supabase
    .from('tax_plans')
    .select('id, plan_data')
    .eq('company_id', companyId)
    .eq('year', year)
    .maybeSingle()
  if (re) throw new Error(re.message)
  if (!plan) return

  const newLines = (plan.plan_data as any).lines?.filter(
    (l: any) => !(l.tax_type === taxType && l.period === period),
  ) ?? []
  const { error } = await supabase
    .from('tax_plans')
    .update({ plan_data: { lines: newLines } })
    .eq('id', plan.id)
  if (error) throw new Error(error.message)
  revalidatePath('/ke-hoach-thue')
}
