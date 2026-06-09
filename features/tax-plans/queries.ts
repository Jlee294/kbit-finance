import { createClient } from '@/lib/supabase/server'
import type { TaxPlanLine } from './schema'

export interface TaxPlan {
  id:         string
  company_id: string
  project_id: string | null
  year:       number
  // Có thể là shape cũ (lines) hoặc mới (template 16 chỉ tiêu)
  plan_data:  { lines: TaxPlanLine[] } | { template: 'kht_v1'; rows: any[]; meta?: any }
}

export async function getTaxPlan(companyId: string, year: number, projectId?: string | null): Promise<TaxPlan | null> {
  const supabase = await createClient()
  let q = supabase
    .from('tax_plans')
    .select('id, company_id, project_id, year, plan_data')
    .eq('company_id', companyId)
    .eq('year', year)
  q = projectId ? q.eq('project_id', projectId) : q.is('project_id', null)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(error.message)
  return data as TaxPlan | null
}

/** List tất cả tax_plans (KTT C1: nhiều plan/cty/dự án/năm) */
export interface TaxPlanListRow {
  id:           string
  company_id:   string
  company_name: string | null
  project_id:   string | null
  project_name: string | null
  year:         number
  has_template: boolean       // true = đã dùng template mẫu mới
}

export async function listTaxPlans(companyId?: string): Promise<TaxPlanListRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('tax_plans')
    .select('id, company_id, project_id, year, plan_data, companies!company_id ( name ), projects!project_id ( name )')
    .order('year', { ascending: false })
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) { console.error('[listTaxPlans]', error.message); return [] }
  return ((data ?? []) as any[]).map((r) => ({
    id:           r.id,
    company_id:   r.company_id,
    company_name: r.companies?.name ?? null,
    project_id:   r.project_id,
    project_name: r.projects?.name ?? null,
    year:         r.year,
    has_template: r.plan_data?.template === 'kht_v1',
  }))
}

// Thực tế GTGT: tổng vat_amount của expense_transactions confirmed/approved trong năm.
// Các loại khác (TNDN/TNCN/FCT/BHXH) chưa có nguồn dữ liệu → trả null.
export async function computeActualTax(
  companyId: string,
  year:      number,
): Promise<Partial<Record<string, number | null>>> {
  const supabase = await createClient()
  const from = `${year}-01-01`
  const to   = `${year}-12-31`

  // GTGT thực = tổng vat_amount expense confirmed/approved có has_vat=true
  const { data, error } = await supabase
    .from('expense_transactions')
    .select('vat_amount')
    .eq('company_id', companyId)
    .eq('has_vat', true)
    .in('status', ['confirmed', 'approved'])
    .gte('txn_date', from)
    .lte('txn_date', to)
  if (error) throw new Error(error.message)

  const gtgt = (data ?? []).reduce((s, r) => s + Number((r as any).vat_amount ?? 0), 0)

  return {
    GTGT: gtgt,
    TNDN: null, // chưa có nguồn
    TNCN: null,
    FCT:  null,
    BHXH: null,
  }
}
