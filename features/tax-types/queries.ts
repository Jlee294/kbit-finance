import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface TaxType {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

/** Danh sách loại thuế. activeOnly=true: chỉ loại đang dùng (cho dropdown nhập liệu). */
export const listTaxTypes = cache(async (activeOnly = false): Promise<TaxType[]> => {
  const supabase = await createClient()
  let q = supabase.from('tax_types').select('id, code, name, sort_order, is_active')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q.order('sort_order')
  if (error) { console.error('[listTaxTypes]', error.message); return [] }
  return (data ?? []) as TaxType[]
})

/** Map code -> tên loại thuế, để hiển thị nhãn ở bảng/báo cáo. */
export function taxTypeLabelMap(rows: TaxType[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const r of rows) m[r.code] = r.name
  return m
}
