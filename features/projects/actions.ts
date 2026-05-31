'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { projectSchema } from './schema'

export async function createProject(input: unknown) {
  const data = projectSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('projects').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/du-an')
  revalidateTag('projects', {})
}

export async function updateProject(id: string, input: unknown) {
  const data = projectSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/du-an')
  revalidateTag('projects', {})
}
