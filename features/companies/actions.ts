'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { companySchema } from './schema'

export async function createCompany(input: unknown) {
  const data = companySchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('companies').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/cong-ty')
  revalidateTag('companies', {})
}

export async function updateCompany(id: string, input: unknown) {
  const data = companySchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('companies').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/cong-ty')
  revalidateTag('companies', {})
}
