import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface Brand {
  id:         string
  code:       string
  name:       string
  is_active:  boolean
  sort_order: number
}

export const listBrands = cache(async (): Promise<Brand[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .select('id, code, name, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) { console.error('[listBrands]', error.message); return [] }
  return (data ?? []) as Brand[]
})
