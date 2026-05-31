import { createClient } from '@/lib/supabase/server'
import type { ReportFilter, ConsolidatedFilter } from './schema'

export interface CompanyReportRow {
  total_income:   number
  total_expense:  number
  net_cash_flow:  number
  ar_outstanding: number
  ap_outstanding: number
  currency:       string
}

export interface ConsolidatedReportRow {
  total_income_vnd:   number
  total_expense_vnd:  number
  net_cash_flow_vnd:  number
  ar_outstanding_vnd: number
  ap_outstanding_vnd: number
  missing_rate:       boolean
}

export async function getCompanyReport(f: ReportFilter): Promise<CompanyReportRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_report_company', {
    p_company_id: f.companyId,
    p_project_id: f.projectId ?? null,
    p_from:       f.from       ?? null,
    p_to:         f.to         ?? null,
  })
  if (error) throw new Error(error.message)
  // RPC returns array of 1 row
  const row = (data as CompanyReportRow[])[0]
  return row ?? {
    total_income: 0, total_expense: 0, net_cash_flow: 0,
    ar_outstanding: 0, ap_outstanding: 0, currency: 'VND',
  }
}

export async function getConsolidatedReport(f: ConsolidatedFilter): Promise<ConsolidatedReportRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_report_consolidated', {
    p_from: f.from ?? null,
    p_to:   f.to   ?? null,
  })
  if (error) throw new Error(error.message)
  const row = (data as ConsolidatedReportRow[])[0]
  return row ?? {
    total_income_vnd: 0, total_expense_vnd: 0, net_cash_flow_vnd: 0,
    ar_outstanding_vnd: 0, ap_outstanding_vnd: 0, missing_rate: false,
  }
}
