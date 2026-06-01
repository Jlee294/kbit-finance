'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { parseInvoiceTT78, type ParsedInvoice } from '@/lib/xml/invoice-tt78'
import { parseBankTechcomXml, type ParsedBankStatement } from '@/lib/xml/bank-techcom'
import { parseBankExcelBuffer, parseBankCsvText } from '@/lib/xml/bank-techcom-table'

export interface ActionResult<T = void> { error?: string; data?: T }

// ════════════════════════════════════════════════════════════════════
//  PHẦN A — HÓA ĐƠN MUA VÀO (TT 78/2021)
// ════════════════════════════════════════════════════════════════════

export interface InvoiceParseResult extends ParsedInvoice {
  // Diagnostic sau lookup DB
  supplier_match: { id: string; code: string; name: string } | null
  product_matches: { product_id: string | null; product_name: string | null }[]
}

/** Parse 1 hoặc nhiều file XML hóa đơn. Trả về preview (chưa lưu DB). */
export async function parseInvoiceFiles(
  formData: FormData,
): Promise<ActionResult<InvoiceParseResult[]>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }

    const files = formData.getAll('files') as File[]
    if (files.length === 0) return { error: 'Vui lòng chọn ít nhất 1 file XML' }

    const supabase = await createClient()
    const results: InvoiceParseResult[] = []

    for (const file of files) {
      const xml = await file.text()
      const parsed = parseInvoiceTT78(xml, file.name)

      // Tìm NCC theo MST
      let supplierMatch: InvoiceParseResult['supplier_match'] = null
      if (parsed.supplier_tax_code) {
        const { data } = await supabase
          .from('suppliers')
          .select('id, code, name')
          .eq('tax_code', parsed.supplier_tax_code)
          .maybeSingle()
        if (data) supplierMatch = data
      }

      // Tìm products theo tên
      const productMatches = await Promise.all(parsed.items.map(async (it) => {
        const { data } = await supabase
          .from('products')
          .select('id, name')
          .ilike('name', `%${it.name.slice(0, 50)}%`)
          .limit(1)
          .maybeSingle()
        return data
          ? { product_id: data.id, product_name: data.name }
          : { product_id: null, product_name: null }
      }))

      results.push({
        ...parsed,
        supplier_match: supplierMatch,
        product_matches: productMatches,
      })
    }

    return { data: results }
  } catch (err) {
    console.error('[parseInvoiceFiles]', err)
    return { error: err instanceof Error ? err.message : 'Lỗi parse XML' }
  }
}

export interface CommitInvoiceInput {
  parsed: ParsedInvoice
  company_id: string
  project_id?: string | null
  warehouse_id?: string | null
  nhan_su_thuc_hien?: string | null
  // Mapping cho từng item: product_id manual (hoặc null = description-only)
  item_product_ids: (string | null)[]
  // Nếu NCC chưa có (supplier_match=null), tạo mới với:
  create_supplier?: {
    code: string
    name: string
    tax_code: string
    country?: 'VN' | 'KR'
  } | null
  existing_supplier_id?: string | null
}

/** Commit 1 hóa đơn đã parse + reviewed → tạo supplier_orders + items */
export async function commitInvoiceImport(input: CommitInvoiceInput): Promise<ActionResult<{ orderId: string }>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }
    const supabase = await createClient()

    // 1. Resolve supplier_id (tạo mới nếu cần)
    let supplierId = input.existing_supplier_id ?? null
    if (!supplierId && input.create_supplier) {
      const { data: newSup, error: supErr } = await supabase
        .from('suppliers')
        .insert({
          code:     input.create_supplier.code,
          name:     input.create_supplier.name,
          tax_code: input.create_supplier.tax_code,
          country:  input.create_supplier.country ?? 'VN',
          is_active: true,
        })
        .select('id')
        .single()
      if (supErr) return { error: 'Không tạo được NCC: ' + supErr.message }
      supplierId = newSup.id
    }
    if (!supplierId) return { error: 'Chưa có NCC cho hóa đơn này' }

    // 2. Insert supplier_order
    const goodsValue = input.parsed.subtotal
    const orderCode = `HD-${input.parsed.invoice_symbol ?? ''}-${input.parsed.invoice_no ?? Date.now()}`.slice(0, 60)
    const { data: order, error: oErr } = await supabase
      .from('supplier_orders')
      .insert({
        company_id:  input.company_id,
        project_id:  input.project_id ?? null,
        supplier_id: supplierId,
        order_code:  orderCode,
        order_date:  input.parsed.invoice_date ?? new Date().toISOString().slice(0,10),
        order_type:  'domestic',     // Hóa đơn VN mặc định là domestic
        currency:    'VND',
        goods_value: goodsValue,
        import_duty: 0,
        vat_import:  0,
        other_fees:  0,
        // Invoice fields
        invoice_template:  input.parsed.invoice_template,
        invoice_symbol:    input.parsed.invoice_symbol,
        invoice_no:        input.parsed.invoice_no,
        invoice_date:      input.parsed.invoice_date,
        supplier_tax_code: input.parsed.supplier_tax_code,
        vat_amount:        input.parsed.vat_amount,
        warehouse_id:      input.warehouse_id ?? null,
        nhan_su_thuc_hien: input.nhan_su_thuc_hien ?? null,
      })
      .select('id')
      .single()
    if (oErr) return { error: 'Không tạo được đơn: ' + oErr.message }

    // 3. Insert items với unit_cost được tính sẵn (= unit_price vì domestic VND)
    const items = input.parsed.items.map((it, i) => ({
      order_id:    order.id,
      product_id:  input.item_product_ids[i] ?? null,
      description: it.name,
      qty:         it.qty,
      unit_price:  it.unit_price,
      unit_cost:   it.unit_price,  // VND đơn → cost = price
    }))
    const { error: itemErr } = await supabase.from('supplier_order_items').insert(items)
    if (itemErr) {
      await supabase.from('supplier_orders').delete().eq('id', order.id)
      return { error: 'Không tạo được dòng hàng: ' + itemErr.message }
    }

    // 4. Auto nhập kho nếu có warehouse
    if (input.warehouse_id) {
      for (let i = 0; i < input.parsed.items.length; i++) {
        const it    = input.parsed.items[i]
        const pid   = input.item_product_ids[i]
        if (!pid) continue
        const { error: stockErr } = await supabase.rpc('kbit_adjust_stock', {
          p_warehouse_id: input.warehouse_id,
          p_product_id:   pid,
          p_delta:        it.qty,
        })
        if (stockErr) {
          console.error('[stock add]', stockErr.message)
          continue
        }
        await supabase.from('warehouse_transactions').insert({
          txn_type:     'receipt',
          warehouse_id: input.warehouse_id,
          product_id:   pid,
          qty:          it.qty,
          txn_date:     input.parsed.invoice_date ?? new Date().toISOString().slice(0,10),
          note:         `Nhập từ XML ${input.parsed.invoice_no ?? ''}`,
        })
      }
      await supabase.from('supplier_orders').update({ stock_added: true }).eq('id', order.id)
    }

    revalidatePath('/nhap-khau')
    revalidatePath('/bang-ke-mua-vao')
    revalidatePath('/kho')
    return { data: { orderId: order.id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

// ════════════════════════════════════════════════════════════════════
//  PHẦN B — SAO KÊ NGÂN HÀNG (Techcombank XML)
// ════════════════════════════════════════════════════════════════════

export interface BankParseResult extends ParsedBankStatement {
  // Match account
  bank_account_match: { id: string; name: string; company_id: string } | null
  duplicate_count: number    // số txn có thể trùng (cùng date + amount + ref)
}

export async function parseBankXmlFile(
  formData: FormData,
): Promise<ActionResult<BankParseResult>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }

    const file = formData.get('file') as File | null
    if (!file) return { error: 'Vui lòng chọn file sao kê' }

    const supabase = await createClient()
    const name = file.name.toLowerCase()

    // Dispatch theo loại file
    let parsed: ParsedBankStatement
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await file.arrayBuffer()
      parsed = parseBankExcelBuffer(buf, file.name)
    } else if (name.endsWith('.csv')) {
      const text = await file.text()
      parsed = parseBankCsvText(text, file.name)
    } else if (name.endsWith('.xml')) {
      const xml = await file.text()
      parsed = parseBankTechcomXml(xml, file.name)
    } else {
      return { error: 'Chỉ hỗ trợ file .xlsx / .xls / .csv / .xml' }
    }

    // Tìm tài khoản ngân hàng theo số tk
    let bankMatch: BankParseResult['bank_account_match'] = null
    if (parsed.account_number) {
      const { data } = await supabase
        .from('bank_accounts')
        .select('id, name, company_id, account_no')
        .ilike('account_no', `%${parsed.account_number.slice(-8)}%`)
        .maybeSingle()
      if (data) bankMatch = { id: data.id, name: data.name, company_id: data.company_id }
    }

    // Đếm số txn có thể bị trùng (date + amount cùng tồn tại trong DB)
    let dupCount = 0
    if (bankMatch && parsed.txns.length > 0) {
      const dates = Array.from(new Set(parsed.txns.map(t => t.txn_date)))
      const { data: existing } = await supabase
        .from('income_transactions')
        .select('txn_date, amount')
        .eq('bank_account_id', bankMatch.id)
        .in('txn_date', dates)
      const expSet = new Set((existing ?? []).map((e: any) => `${e.txn_date}|${Number(e.amount)}`))
      for (const t of parsed.txns) {
        if (t.credit > 0 && expSet.has(`${t.txn_date}|${t.credit}`)) dupCount++
      }
    }

    return {
      data: {
        ...parsed,
        bank_account_match: bankMatch,
        duplicate_count: dupCount,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi parse XML' }
  }
}

export interface CommitBankTxnsInput {
  bank_account_id: string
  company_id:      string
  // Mỗi txn user đã review: include + customer/supplier match
  txns: Array<{
    txn_date:      string
    description:   string
    debit:         number
    credit:        number
    reference:     string | null
    direction:     'thu' | 'chi'
    customer_id?:  string | null
    supplier_id?:  string | null
    note?:         string | null
  }>
}

export async function commitBankTxns(input: CommitBankTxnsInput): Promise<ActionResult<{ created: number; skipped: number }>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }
    const supabase = await createClient()

    let created = 0, skipped = 0
    for (const t of input.txns) {
      if (t.direction === 'thu') {
        if (!t.customer_id) { skipped++; continue }
        const { error } = await supabase.from('income_transactions').insert({
          company_id:      input.company_id,
          bank_account_id: input.bank_account_id,
          customer_id:     t.customer_id,
          amount:          t.credit,
          amount_vnd:      t.credit,
          txn_date:        t.txn_date,
          is_unassigned:   true,    // chưa gắn đơn — user phân bổ sau
          note:            t.note ?? t.description.slice(0, 200),
          status:          'draft',
          created_by:      me.id,
        })
        if (error) { console.error('[import income]', error.message); skipped++; continue }
        created++
      } else {
        // 'chi' → expense_transactions
        if (!t.supplier_id) { skipped++; continue }
        const { error } = await supabase.from('expense_transactions').insert({
          company_id:      input.company_id,
          bank_account_id: input.bank_account_id,
          supplier_id:     t.supplier_id,
          region:          'VN',
          txn_date:        t.txn_date,
          amount_vnd:      t.debit,
          note:            t.note ?? t.description.slice(0, 200),
          status:          'draft',
          created_by:      me.id,
        })
        if (error) { console.error('[import expense]', error.message); skipped++; continue }
        created++
      }
    }

    revalidatePath('/ngan-hang')
    revalidatePath('/cong-no')
    return { data: { created, skipped } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
