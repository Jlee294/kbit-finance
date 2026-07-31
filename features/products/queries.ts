import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'

// ── Lightweight row for dropdowns (existing callers) ──────────────────────────

export interface ProductOption {
  id:   string
  code: string
  name: string
  unit: string
}

export const listProducts = cache(async (): Promise<ProductOption[]> => {
  if (isDemoMode()) {
    return GLA_DATA.products.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
    }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, code, name, unit')
    .eq('is_active', true)
    .order('code')
  if (error) { console.error('[listProducts]', error.message); return [] }
  return (data ?? []) as ProductOption[]
})

// ── Detailed row for catalog page ─────────────────────────────────────────────

export interface ProductRow extends ProductOption {
  is_active:           boolean
  brand_id:            string | null
  brand:               { id: string; code: string; name: string } | null
  manufacturer_id:     string | null
  manufacturer:        string | null
  cost_material:       number | null
  cost_material_curr:  string
  cost_bottle:         number | null
  cost_bottle_curr:    string
  cost_packaging:      number | null
  cost_packaging_curr: string
  cost_shipping:       number | null
  cost_shipping_curr:  string
  price_list_kr:       number | null
  price_list_vn:       number | null
}

export const listProductsDetail = cache(async (): Promise<ProductRow[]> => {
  if (isDemoMode()) {
    return GLA_DATA.products.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      is_active: row.isActive,
      brand_id: null,
      brand: null,
      manufacturer_id: null,
      manufacturer: null,
      cost_material: null,
      cost_material_curr: 'VND',
      cost_bottle: null,
      cost_bottle_curr: 'VND',
      cost_packaging: null,
      cost_packaging_curr: 'VND',
      cost_shipping: null,
      cost_shipping_curr: 'VND',
      price_list_kr: null,
      price_list_vn: null,
    }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, code, name, unit, is_active,
      brand_id, manufacturer_id, manufacturer,
      brands!brand_id ( id, code, name ),
      cost_material, cost_material_curr,
      cost_bottle,   cost_bottle_curr,
      cost_packaging, cost_packaging_curr,
      cost_shipping,  cost_shipping_curr,
      price_list_kr, price_list_vn
    `)
    .eq('is_active', true)
    .order('code')
  if (error) { console.error('[listProductsDetail]', error.message); return [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    ...r,
    brand:        r.brands ?? null,
    brands:       undefined,
    manufacturer: r.manufacturer ?? null,
  })) as ProductRow[]
})

// ── Latest exchange rates (VND base) ─────────────────────────────────────────

export type ExchangeRates = Record<string, number>  // { KRW: 17.5, USD: 25200, VND: 1 }

export async function getLatestRates(): Promise<ExchangeRates> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('exchange_rates')
    .select('currency_from, rate, rate_date')
    .eq('currency_to', 'VND')
    .order('rate_date', { ascending: false })
    .limit(100)

  const rates: ExchangeRates = { VND: 1 }
  const seen = new Set<string>()
  for (const r of data ?? []) {
    const key = r.currency_from as string
    if (!seen.has(key)) {
      rates[key] = Number(r.rate)
      seen.add(key)
    }
  }
  return rates
}
