'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { manufacturerSchema, manufacturerPriceSchema } from './schema'

interface ActionResult { error?: string }

export async function createManufacturer(input: unknown): Promise<ActionResult> {
  const data = manufacturerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturers').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function updateManufacturer(id: string, input: unknown): Promise<ActionResult> {
  const data = manufacturerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturers').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function createManufacturerPrice(input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function updateManufacturerPrice(id: string, input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function deleteManufacturerPrice(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}
