'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { manufacturerSchema, formulaSchema, manufacturerPriceSchema } from './schema'

interface ActionResult { error?: string }

const REVALIDATE_PATHS = ['/danh-muc/nha-may', '/danh-muc/san-pham', '/danh-muc/ma-hang']
function revalidateAll() { REVALIDATE_PATHS.forEach(p => revalidatePath(p)) }

// ── Manufacturers ──────────────────────────────────────────────────────────────

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

// ── Formulas ───────────────────────────────────────────────────────────────────

export async function createFormula(input: unknown): Promise<ActionResult> {
  const data = formulaSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_formulas').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function updateFormula(id: string, input: unknown): Promise<ActionResult> {
  const data = formulaSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_formulas').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function deleteFormula(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_formulas').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

export async function linkProductToFormula(formulaId: string, productId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('formula_products')
    .insert({ formula_id: formulaId, product_id: productId })
  if (error) return { error: error.message }

  const { data: formula } = await supabase
    .from('manufacturer_formulas')
    .select('manufacturer_id')
    .eq('id', formulaId)
    .single()
  if (formula) {
    await syncFormulaToProducts(supabase, formula.manufacturer_id, formulaId)
  }
  revalidateAll()
  return {}
}

export async function unlinkProductFromFormula(formulaId: string, productId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('formula_products')
    .delete()
    .eq('formula_id', formulaId)
    .eq('product_id', productId)
  if (error) return { error: error.message }
  revalidateAll()
  return {}
}

// ── Prices ─────────────────────────────────────────────────────────────────────

export async function createManufacturerPrice(input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').insert(data)
  if (error) return { error: error.message }
  await syncFormulaToProducts(supabase, data.manufacturer_id, data.formula_id)
  revalidateAll()
  return {}
}

export async function updateManufacturerPrice(id: string, input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').update(data).eq('id', id)
  if (error) return { error: error.message }
  await syncFormulaToProducts(supabase, data.manufacturer_id, data.formula_id)
  revalidateAll()
  return {}
}

export async function deleteManufacturerPrice(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('manufacturer_prices')
    .select('manufacturer_id, formula_id')
    .eq('id', id)
    .single()
  const { error } = await supabase.from('manufacturer_prices').delete().eq('id', id)
  if (error) return { error: error.message }
  if (row) await syncFormulaToProducts(supabase, row.manufacturer_id, row.formula_id)
  revalidateAll()
  return {}
}

// ── Sync ───────────────────────────────────────────────────────────────────────

async function syncFormulaToProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  manufacturerId: string,
  formulaId: string,
) {
  const { data: latest } = await supabase
    .from('manufacturer_prices')
    .select('unit_price, currency')
    .eq('formula_id', formulaId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single()

  const { data: links } = await supabase
    .from('formula_products')
    .select('product_id')
    .eq('formula_id', formulaId)

  if (!links?.length) return

  const productIds = links.map(l => l.product_id)

  if (latest) {
    await supabase.from('products').update({
      cost_material: latest.unit_price,
      cost_material_curr: latest.currency,
      manufacturer_id: manufacturerId,
    }).in('id', productIds)
  }
}
