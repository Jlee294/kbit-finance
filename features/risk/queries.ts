import { createClient } from '@/lib/supabase/server'
import type { Light }    from './lights'
import type { RiskGroup } from './indicators'

export interface ThresholdRow {
  id:             string
  company_id:     string | null
  indicator_code: string
  yellow_at:      number | null
  red_at:         number | null
}

export interface AssessmentRow {
  id:          string
  company_id:  string
  assessed_at: string
  overall:     Light
  scores:      {
    indicators: Array<{
      code:       string
      group:      RiskGroup
      value:      number
      yellow_at:  number | null
      red_at:     number | null
      light:      Light
      configured: boolean
    }>
    groups: Record<RiskGroup, Light>
  }
}

export async function listThresholds(): Promise<ThresholdRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('risk_thresholds')
    .select('id, company_id, indicator_code, yellow_at, red_at')
    .order('indicator_code')
  if (error) throw new Error(error.message)
  return (data ?? []) as ThresholdRow[]
}

export async function getLatestAssessment(companyId: string): Promise<AssessmentRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('risk_assessments')
    .select('id, company_id, assessed_at, overall, scores')
    .eq('company_id', companyId)
    .order('assessed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as AssessmentRow | null
}

export async function listAssessments(companyId: string): Promise<AssessmentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('risk_assessments')
    .select('id, company_id, assessed_at, overall, scores')
    .eq('company_id', companyId)
    .order('assessed_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as AssessmentRow[]
}
