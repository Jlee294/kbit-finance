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
  // Manual upsert vì unique constraint dùng expression coalesce(project_id, ...)
  const { company_id, project_id, year, plan_data } = parsed.data

  let q = supabase.from('tax_plans').select('id').eq('company_id', company_id).eq('year', year)
  q = project_id ? q.eq('project_id', project_id) : q.is('project_id', null)
  const { data: existing } = await q.maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('tax_plans')
      .update({ plan_data, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('tax_plans').insert({
      company_id, project_id: project_id ?? null, year, plan_data,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath('/ke-hoach-thue')
}

/** Xóa 1 kế hoạch thuế (theo company + project + year). */
export async function deleteTaxPlan(companyId: string, projectId: string | null, year: number) {
  const supabase = await createClient()
  let q = supabase.from('tax_plans').delete().eq('company_id', companyId).eq('year', year)
  q = projectId ? q.eq('project_id', projectId) : q.is('project_id', null)
  const { error } = await q
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
