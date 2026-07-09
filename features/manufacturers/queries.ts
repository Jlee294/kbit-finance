import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface ManufacturerRow {
  id:            string
  code:          string
  name:          string
  country:       string
  phone:         string | null
  email:         string | null
  address:       string | null
  note:          string | null
  is_active:     boolean
  formula_count: number
}

export interface FormulaRow {
  id:              string
  manufacturer_id: string
  code:            string
  name:            string
  note:            string | null
  is_active:       boolean
  products:        { id: string; code: string; name: string; unit: string }[]
}

export interface ManufacturerPriceRow {
  id:                 string
  manufacturer_id:    string
  formula_id:         string
  formula_code:       string
  formula_name:       string
  unit_price:         number
  currency:           string
  moq:                number | null
  effective_date:     string
  includes_bottle:    boolean
  includes_packaging: boolean
  note:               string | null
}

export const listManufacturers = cache(async (): Promise<ManufacturerRow[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manufacturers')
    .select('id, code, name, country, phone, email, address, note, is_active')
    .order('code')
  if (error) { console.error('[listManufacturers]', error.message); return [] }

  const rows = (data ?? []) as ManufacturerRow[]

  if (rows.length > 0) {
    const { data: formulas } = await supabase
      .from('manufacturer_formulas')
      .select('manufacturer_id')
    const countMap = new Map<string, number>()
    for (const r of formulas ?? []) {
      const mid = (r as any).manufacturer_id as string
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1)
    }
    for (const row of rows) {
      row.formula_count = countMap.get(row.id) ?? 0
    }
  }

  return rows
})

export async function getManufacturer(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manufacturers')
    .select('id, code, name, country, phone, email, address, note, is_active')
    .eq('id', id)
    .single()
  if (error) return null
  return data as ManufacturerRow
}

export async function listFormulas(manufacturerId: string): Promise<FormulaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manufacturer_formulas')
    .select('id, manufacturer_id, code, name, note, is_active')
    .eq('manufacturer_id', manufacturerId)
    .order('code')
  if (error) { console.error('[listFormulas]', error.message); return [] }

  const formulas = (data ?? []) as FormulaRow[]

  if (formulas.length > 0) {
    const formulaIds = formulas.map(f => f.id)
    const { data: links } = await supabase
      .from('formula_products')
      .select('formula_id, product_id, products!product_id ( id, code, name, unit )')
      .in('formula_id', formulaIds)

    const linkMap = new Map<string, FormulaRow['products']>()
    for (const l of (links ?? []) as any[]) {
      const fid = l.formula_id as string
      if (!linkMap.has(fid)) linkMap.set(fid, [])
      if (l.products) linkMap.get(fid)!.push(l.products)
    }
    for (const f of formulas) {
      f.products = linkMap.get(f.id) ?? []
    }
  }

  return formulas
}

export async function listManufacturerPrices(manufacturerId: string): Promise<ManufacturerPriceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manufacturer_prices')
    .select(`
      id, manufacturer_id, formula_id, unit_price, currency, moq,
      effective_date, includes_bottle, includes_packaging, note,
      manufacturer_formulas!formula_id ( code, name )
    `)
    .eq('manufacturer_id', manufacturerId)
    .order('effective_date', { ascending: false })

  if (error) { console.error('[listManufacturerPrices]', error.message); return [] }

  return ((data ?? []) as any[]).map(r => ({
    id:                 r.id,
    manufacturer_id:    r.manufacturer_id,
    formula_id:         r.formula_id,
    formula_code:       r.manufacturer_formulas?.code ?? '',
    formula_name:       r.manufacturer_formulas?.name ?? '',
    unit_price:         Number(r.unit_price),
    currency:           r.currency,
    moq:                r.moq,
    effective_date:     r.effective_date,
    includes_bottle:    r.includes_bottle,
    includes_packaging: r.includes_packaging,
    note:               r.note,
  }))
}
