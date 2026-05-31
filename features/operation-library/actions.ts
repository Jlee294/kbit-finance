'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { operationSchema } from './schema'

export async function createOperation(input: unknown): Promise<string> {
  const data = operationSchema.parse(input)
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('operation_library')
    .insert({
      code: data.code,
      name: data.name,
      group_name: data.group_name ?? null,
      tax_gtgt: data.tax_gtgt ?? null,
      tax_tndn_deductible: data.tax_tndn_deductible,
      tax_tncn: data.tax_tncn ?? null,
      tax_fct: data.tax_fct ?? null,
      required_doc_type_ids: data.required_doc_type_ids,
      recommended_doc_type_ids: data.recommended_doc_type_ids,
      notes: data.notes ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error(`Mã "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }

  revalidatePath('/danh-muc/thu-vien-nghiep-vu')
  return row.id as string
}

export async function updateOperation(id: string, input: unknown): Promise<void> {
  const data = operationSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase
    .from('operation_library')
    .update({
      code: data.code,
      name: data.name,
      group_name: data.group_name ?? null,
      tax_gtgt: data.tax_gtgt ?? null,
      tax_tndn_deductible: data.tax_tndn_deductible,
      tax_tncn: data.tax_tncn ?? null,
      tax_fct: data.tax_fct ?? null,
      required_doc_type_ids: data.required_doc_type_ids,
      recommended_doc_type_ids: data.recommended_doc_type_ids,
      notes: data.notes ?? null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') throw new Error(`Mã "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }

  revalidatePath('/danh-muc/thu-vien-nghiep-vu')
}
