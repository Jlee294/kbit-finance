import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface ManufacturerRow {
  id:         string
  code:       string
  name:       string
  country:    string
  phone:      string | null
  email:      string | null
  address:    string | null
  note:       string | null
  is_active:  boolean
  product_count: number
}

export interface ManufacturerPriceRow {
  id:                 string
  manufacturer_id:    string
  product_id:         string
  product_code:       string
  product_name:       string
  product_unit:       string
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
    const { data: counts } = await supabase
      .from('manufacturer_prices')
      .select('manufacturer_id')
    const countMap = new Map<string, number>()
    for (const r of counts ?? []) {
      const mid = (r as any).manufacturer_id as string
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1)
    }
    for (const row of rows) {
      row.product_count = countMap.get(row.id) ?? 0
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

export async function listManufacturerPrices(manufacturerId: string): Promise<ManufacturerPriceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manufacturer_prices')
    .select(`
      id, manufacturer_id, product_id, unit_price, currency, moq,
      effective_date, includes_bottle, includes_packaging, note,
      products!product_id ( code, name, unit )
    `)
    .eq('manufacturer_id', manufacturerId)
    .order('effective_date', { ascending: false })

  if (error) { console.error('[listManufacturerPrices]', error.message); return [] }

  return ((data ?? []) as any[]).map(r => ({
    id:                 r.id,
    manufacturer_id:    r.manufacturer_id,
    product_id:         r.product_id,
    product_code:       r.products?.code ?? '',
    product_name:       r.products?.name ?? '',
    product_unit:       r.products?.unit ?? '',
    unit_price:         Number(r.unit_price),
    currency:           r.currency,
    moq:                r.moq,
    effective_date:     r.effective_date,
    includes_bottle:    r.includes_bottle,
    includes_packaging: r.includes_packaging,
    note:               r.note,
  }))
}
