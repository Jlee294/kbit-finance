import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/demo'

export type AccountingTreatment =
  | 'inventory'
  | 'expense'
  | 'prepaid'
  | 'tool'
  | 'fixed_asset'
  | 'tax_fee'
  | 'pass_through'
  | 'contract_penalty'
  | 'other'

export interface AccountingCategory {
  id: string
  company_id: string | null
  code: string
  name: string
  treatment: AccountingTreatment
  is_active: boolean
}

const DEFAULT_ACCOUNTING_CATEGORIES: AccountingCategory[] = [
  { id: 'system-expense', company_id: null, code: 'CHI_PHI', name: 'Chi phí trong kỳ', treatment: 'expense', is_active: true },
  { id: 'system-prepaid', company_id: null, code: 'TRA_TRUOC', name: 'Chi phí trả trước', treatment: 'prepaid', is_active: true },
  { id: 'system-tool', company_id: null, code: 'CCDC', name: 'Công cụ dụng cụ', treatment: 'tool', is_active: true },
  { id: 'system-fixed-asset', company_id: null, code: 'TSCĐ', name: 'Tài sản cố định', treatment: 'fixed_asset', is_active: true },
  { id: 'system-tax-fee', company_id: null, code: 'THUE_PHI', name: 'Thuế, phí', treatment: 'tax_fee', is_active: true },
  { id: 'system-pass-through', company_id: null, code: 'THU_CHI_HO', name: 'Thu hộ / chi hộ', treatment: 'pass_through', is_active: true },
  { id: 'system-penalty', company_id: null, code: 'PHAT_HD', name: 'Phạt hợp đồng', treatment: 'contract_penalty', is_active: true },
  { id: 'system-other', company_id: null, code: 'KHAC', name: 'Khác', treatment: 'other', is_active: true },
]

export async function listAccountingCategories(companyId?: string): Promise<AccountingCategory[]> {
  if (isDemoMode()) return DEFAULT_ACCOUNTING_CATEGORIES
  const supabase = await createClient()
  let query = supabase
    .from('accounting_categories')
    .select('id, company_id, code, name, treatment, is_active')
    .eq('is_active', true)
    .order('company_id', { ascending: true, nullsFirst: true })
    .order('code')
  if (companyId) query = query.or(`company_id.is.null,company_id.eq.${companyId}`)
  const { data, error } = await query
  if (error) {
    console.error('[listAccountingCategories]', error.message)
    return []
  }
  return (data ?? []) as AccountingCategory[]
}
