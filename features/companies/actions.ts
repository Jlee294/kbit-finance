'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { companySchema } from './schema'

export interface ActionResult { error?: string }

export async function createCompany(input: unknown): Promise<ActionResult> {
  try {
    const data = companySchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('companies').insert(data)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/cong-ty')
    revalidateTag('companies', {})
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateCompany(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = companySchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('companies').update(data).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/cong-ty')
    revalidateTag('companies', {})
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
