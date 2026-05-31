import { createClient } from '@/lib/supabase/server'
import type { TaxPlanLine } from './schema'

export interface TaxPlan {
  id:         string
  company_id: string
  project_id: string | null
  year:       number
  plan_data:  { lines: TaxPlanLine[] }
}

export async function getTaxPlan(companyId: string, year: number): Promise<TaxPlan | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tax_plans')
    .select('id, company_id, project_id, year, plan_data')
    .eq('company_id', companyId)
    .eq('year', year)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TaxPlan | null
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
