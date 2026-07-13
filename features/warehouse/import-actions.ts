'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canApprove } from '@/lib/auth'
import * as XLSX from 'xlsx'

export interface ImportRow {
  idx: number
  product_code: string
  product_name: string
  unit: string
  brand: string
  manufacturer: string
  lot_no: string
  production_date: string
  expiry_date: string
  warehouse_code: string
  warehouse_name: string
  company_name: string
  period: string
  qty: number
  cost_production: number
  cost_production_curr: string
  cost_import: number
  price_brand: number
  price_list: number
  // resolved IDs (filled during validation)
  product_id?: string
  warehouse_id?: string
  brand_id?: string
  company_id?: string
  // validation
  status: 'ok' | 'error'
  errors: string[]
}

export interface ParseResult {
  rows: ImportRow[]
  summary: { total: number; ok: number; error: number }
}

export interface CommitResult {
  processed: number
  skipped: number
  errors: { idx: number; msg: string }[]
}

function parseDate(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/')
    return `${yyyy}-${mm}-${dd}`
  }
  return s
}

function str(v: any): string {
  return v == null ? '' : String(v).trim()
}

function num(v: any): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export async function parseInventoryExcel(formData: FormData): Promise<ParseResult> {
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) throw new Error('Không có quyền import')

  const file = formData.get('file') as File
  if (!file || !file.name) throw new Error('Không tìm thấy file')

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('File Excel trống')

  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })
  if (raw.length < 2) throw new Error('File phải có ít nhất 1 dòng dữ liệu (ngoài header)')

  const supabase = await createClient()

  const [{ data: products }, { data: warehouses }, { data: brands }, { data: companies }] = await Promise.all([
    supabase.from('products').select('id, code, name, unit').eq('is_active', true),
    supabase.from('warehouses').select('id, code, name, company_id').eq('is_active', true),
    supabase.from('brands').select('id, code, name').eq('is_active', true),
    supabase.from('companies').select('id, code, name'),
  ])

  const productMap = new Map((products ?? []).map(p => [p.code.toLowerCase(), p]))
  const warehouseMap = new Map((warehouses ?? []).map(w => [w.code.toLowerCase(), w]))
  const brandMap = new Map((brands ?? []).map(b => [b.name.toLowerCase(), b]))
  const companyMap = new Map((companies ?? []).map(c => [c.name.toLowerCase(), c]))

  const rows: ImportRow[] = []

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as any[]
    if (!r || r.length === 0) continue
    const productCode = str(r[1])
    if (!productCode) continue

    const errors: string[] = []

    const row: ImportRow = {
      idx: i,
      product_code:       productCode,
      product_name:       str(r[2]),
      unit:               str(r[3]),
      brand:              str(r[4]),
      manufacturer:       str(r[5]),
      lot_no:             str(r[6]),
      production_date:    parseDate(r[7]),
      expiry_date:        parseDate(r[8]),
      warehouse_code:     str(r[9]),
      warehouse_name:     str(r[10]),
      company_name:       str(r[11]),
      period:             str(r[12]),
      qty:                num(r[13]),
      cost_production:    num(r[14]),
      cost_production_curr: str(r[15]) || 'KRW',
      cost_import:        num(r[16]),
      price_brand:        num(r[17]),
      price_list:         num(r[18]),
      status: 'ok',
      errors: [],
    }

    // Validate product
    const prod = productMap.get(row.product_code.toLowerCase())
    if (!prod) {
      errors.push(`Mã hàng "${row.product_code}" không tìm thấy`)
    } else {
      row.product_id = prod.id
    }

    // Validate warehouse
    const wh = warehouseMap.get(row.warehouse_code.toLowerCase())
    if (!wh) {
      errors.push(`Mã kho "${row.warehouse_code}" không tìm thấy`)
    } else {
      row.warehouse_id = wh.id
    }

    // Validate brand (optional but recommended)
    if (row.brand) {
      const br = brandMap.get(row.brand.toLowerCase())
      if (br) row.brand_id = br.id
    }

    // Validate company
    if (row.company_name) {
      const co = companyMap.get(row.company_name.toLowerCase())
      if (co) row.company_id = co.id
      else errors.push(`Công ty "${row.company_name}" không tìm thấy`)
    }

    // Validate period
    if (!/^\d{4}-\d{2}$/.test(row.period)) {
      errors.push(`Kỳ "${row.period}" không đúng định dạng YYYY-MM`)
    }

    // Validate qty
    if (row.qty <= 0) {
      errors.push('Số lượng phải > 0')
    }

    // cost_import không bắt buộc — có thể cập nhật sau

    // Validate dates
    if (row.production_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.production_date)) {
      errors.push(`Ngày SX "${row.production_date}" không hợp lệ`)
    }
    if (row.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiry_date)) {
      errors.push(`HSD "${row.expiry_date}" không hợp lệ`)
    }

    row.errors = errors
    row.status = errors.length > 0 ? 'error' : 'ok'
    rows.push(row)
  }

  return {
    rows,
    summary: {
      total: rows.length,
      ok: rows.filter(r => r.status === 'ok').length,
      error: rows.filter(r => r.status === 'error').length,
    },
  }
}

export async function commitInventoryImport(rows: ImportRow[]): Promise<CommitResult> {
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) throw new Error('Không có quyền import')

  const supabase = await createClient()
  const validRows = rows.filter(r => r.status === 'ok' && r.product_id && r.warehouse_id)

  let processed = 0
  let skipped = 0
  const errors: { idx: number; msg: string }[] = []

  for (const row of validRows) {
    try {
      // 1. Update product manufacturer + brand if provided
      const updates: Record<string, any> = {}
      if (row.manufacturer) updates.manufacturer = row.manufacturer
      if (row.brand_id) updates.brand_id = row.brand_id
      if (row.cost_production > 0) {
        updates.cost_material = row.cost_production
        updates.cost_material_curr = row.cost_production_curr
      }
      if (row.price_brand > 0) updates.price_list_kr = row.price_brand
      if (row.price_list > 0) updates.price_list_vn = row.price_list

      if (Object.keys(updates).length > 0) {
        await supabase.from('products').update(updates).eq('id', row.product_id!)
      }

      // 2. Set opening stock with lot/dates
      const { error } = await supabase.rpc('kbit_set_opening_stock_v2', {
        p_product_id:      row.product_id!,
        p_warehouse_id:    row.warehouse_id!,
        p_period:          row.period,
        p_qty:             row.qty,
        p_unit_cost:       row.cost_import,
        p_lot_no:          row.lot_no || null,
        p_production_date: row.production_date || null,
        p_expiry_date:     row.expiry_date || null,
      })

      if (error) {
        errors.push({ idx: row.idx, msg: error.message })
        skipped++
      } else {
        processed++
      }
    } catch (err: any) {
      errors.push({ idx: row.idx, msg: err.message ?? 'Lỗi không xác định' })
      skipped++
    }
  }

  revalidatePath('/kho')
  revalidatePath('/kho/so-du-dau-ky')
  revalidatePath('/kho/lich-su')
  revalidatePath('/kho/gia-von')
  revalidatePath('/danh-muc/ma-hang')

  return { processed, skipped, errors }
}
