import { createClient } from '@/lib/supabase/server'

export interface Operation {
  id: string
  code: string
  name: string
  group_name: string | null
  tax_gtgt: string | null
  tax_tndn_deductible: boolean | null
  tax_tncn: string | null
  tax_fct: string | null
  required_doc_type_ids: string[]
  recommended_doc_type_ids: string[]
  notes: string | null
  created_at: string
  updated_at: string
}

export async function listOperations(): Promise<Operation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('operation_library')
    .select('*')
    .order('code')
  if (error) throw new Error(error.message)
  return (data ?? []) as Operation[]
}

export async function getOperation(id: string): Promise<Operation | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('operation_library')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Operation
}
