'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { parseInvoiceTT78, type ParsedInvoice } from '@/lib/xml/invoice-tt78'
import { parseBankTechcomXml, type ParsedBankStatement } from '@/lib/xml/bank-techcom'
import { parseBankExcelBuffer, parseBankCsvText } from '@/lib/xml/bank-techcom-table'
import { parseBankTechcomPdf } from '@/lib/xml/bank-techcom-pdf'

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
//  PHẦN A2 — HÓA ĐƠN BÁN RA (Sales Invoice TT 78)
// ════════════════════════════════════════════════════════════════════
//
// Với hóa đơn bán ra:
//   NBan = công ty mình (KBIT)
//   NMua = khách hàng → lookup `customers` theo MST
// Parser dùng chung parseInvoiceTT78, chỉ khác phần lookup + commit.

export interface SalesInvoiceParseResult extends ParsedInvoice {
  customer_match: { id: string; code: string; name: string } | null
  product_matches: { product_id: string | null; product_name: string | null }[]
}

export async function parseSalesInvoiceFiles(
  formData: FormData,
): Promise<ActionResult<SalesInvoiceParseResult[]>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }

    const files = formData.getAll('files') as File[]
    if (files.length === 0) return { error: 'Vui lòng chọn ít nhất 1 file XML' }

    const supabase = await createClient()
    const results: SalesInvoiceParseResult[] = []

    for (const file of files) {
      const xml = await file.text()
      const parsed = parseInvoiceTT78(xml, file.name)

      // Tìm KH theo MST (lưu trong NMua / buyer_tax_code)
      let customerMatch: SalesInvoiceParseResult['customer_match'] = null
      if (parsed.buyer_tax_code) {
        const { data } = await supabase
          .from('customers')
          .select('id, code, name')
          .eq('tax_code', parsed.buyer_tax_code)
          .maybeSingle()
        if (data) customerMatch = data
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
        customer_match: customerMatch,
        product_matches: productMatches,
      })
    }

    return { data: results }
  } catch (err) {
    console.error('[parseSalesInvoiceFiles]', err)
    return { error: err instanceof Error ? err.message : 'Lỗi parse XML' }
  }
}

export interface CommitSalesInvoiceInput {
  parsed: ParsedInvoice
  company_id: string
  project_id?: string | null
  warehouse_id?: string | null      // kho xuất hàng (sẽ tự trừ kho nếu có)
  nhan_su_thuc_hien?: string | null
  item_product_ids: (string | null)[]
  create_customer?: {
    code: string
    name: string
    tax_code: string
  } | null
  existing_customer_id?: string | null
}

export async function commitSalesInvoiceImport(
  input: CommitSalesInvoiceInput,
): Promise<ActionResult<{ orderId: string }>> {
  try {
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) return { error: 'Không có quyền' }
    const supabase = await createClient()

    // 1. Resolve customer_id
    let customerId = input.existing_customer_id ?? null
    if (!customerId && input.create_customer) {
      const { data: newCust, error: cErr } = await supabase
        .from('customers')
        .insert({
          code:     input.create_customer.code,
          name:     input.create_customer.name,
          tax_code: input.create_customer.tax_code,
          is_active: true,
        })
        .select('id')
        .single()
      if (cErr) return { error: 'Không tạo được KH: ' + cErr.message }
      customerId = newCust.id
    }
    if (!customerId) return { error: 'Chưa có KH cho hóa đơn này' }

    // 2. Build items với product_id (nếu có)
    const items = input.parsed.items.map((it, i) => ({
      product_id:  input.item_product_ids[i] ?? null,
      description: it.name,
      qty:         it.qty,
      unit_price:  it.unit_price,
      lot_no:      null,
      expiry_date: null,
    }))

    // 3. Tính totals
    const grandTotal = input.parsed.grand_total
    const vatPct = input.parsed.subtotal > 0
      ? Math.round((input.parsed.vat_amount / input.parsed.subtotal) * 1000) / 10
      : 0

    // 4. Lấy customer code để build order_code
    const { data: cust } = await supabase
      .from('customers').select('code').eq('id', customerId).single()
    if (!cust) return { error: 'KH không tồn tại' }

    const orderCode = `HD-${input.parsed.invoice_symbol ?? ''}-${input.parsed.invoice_no ?? ''}`.replace(/--/g, '-').slice(0, 60) || `HD-${Date.now()}`

    // 5. Insert customer_orders
    const { data: order, error: oErr } = await supabase
      .from('customer_orders')
      .insert({
        company_id:  input.company_id,
        project_id:  input.project_id ?? null,
        customer_id: customerId,
        order_code:  orderCode,
        order_date:  input.parsed.invoice_date ?? new Date().toISOString().slice(0,10),
        delivery_date: input.parsed.invoice_date ?? null,
        grand_total: grandTotal,
        amount_paid: 0,
        fulfillment_status: 'delivered',  // import từ XML thường là đã giao
        payment_status:     'unpaid',
        vat_pct:     vatPct,
        // Invoice fields
        invoice_template:  input.parsed.invoice_template,
        invoice_symbol:    input.parsed.invoice_symbol,
        invoice_no:        input.parsed.invoice_no,
        invoice_date:      input.parsed.invoice_date,
        customer_tax_code: input.parsed.buyer_tax_code,
        vat_amount:        input.parsed.vat_amount,
        warehouse_id:      input.warehouse_id ?? null,
        nhan_su_thuc_hien: input.nhan_su_thuc_hien ?? null,
        created_by:        me.id,
      })
      .select('id')
      .single()
    if (oErr) return { error: 'Không tạo được đơn: ' + oErr.message }

    // 6. Insert items
    const { error: iErr } = await supabase
      .from('customer_order_items')
      .insert(items.map(it => ({ ...it, order_id: order.id })))
    if (iErr) {
      await supabase.from('customer_orders').delete().eq('id', order.id)
      return { error: 'Không tạo được dòng hàng: ' + iErr.message }
    }

    // 7. Tự trừ kho nếu có warehouse_id
    if (input.warehouse_id) {
      const stockItems = items
        .filter(it => !!it.product_id)
        .map(it => ({ product_id: it.product_id!, quantity: it.qty }))
      if (stockItems.length > 0) {
        for (const si of stockItems) {
          const { error: rpcErr } = await supabase.rpc('kbit_adjust_stock', {
            p_warehouse_id: input.warehouse_id,
            p_product_id:   si.product_id,
            p_delta:        -si.quantity,    // âm = xuất kho
          })
          if (rpcErr) {
            console.error('[stock deduct]', rpcErr.message)
            continue
          }
          await supabase.from('warehouse_transactions').insert({
            txn_type:     'order_deduction',
            warehouse_id: input.warehouse_id,
            product_id:   si.product_id,
            qty:          si.quantity,
            txn_date:     input.parsed.invoice_date ?? new Date().toISOString().slice(0,10),
            ref_order_id: order.id,
            note:         `Xuất từ XML HĐ ${input.parsed.invoice_no ?? ''}`,
          })
        }
        await supabase.from('customer_orders').update({ stock_deducted: true }).eq('id', order.id)
      }
    }

    revalidatePath('/don-hang')
    revalidatePath('/bang-ke-ban-ra')
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
    } else if (name.endsWith('.pdf')) {
      const buf = await file.arrayBuffer()
      parsed = await parseBankTechcomPdf(buf, file.name)
    } else {
      return { error: 'Chỉ hỗ trợ file .xlsx / .xls / .csv / .xml / .pdf' }
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
    direction:     'thu' | 'chi' | ''   // empty = unassigned, lưu nhưng chưa rõ loại
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
      // Auto-detect direction nếu trống (KTT: cho phép lưu chưa gắn)
      const dir: 'thu' | 'chi' = t.direction || (t.credit > 0 ? 'thu' : 'chi')

      if (dir === 'thu') {
        if (t.credit <= 0) { skipped++; continue }
        // Cho phép customer_id NULL (migration 0019 đã drop NOT NULL)
        const { error } = await supabase.from('income_transactions').insert({
          company_id:      input.company_id,
          bank_account_id: input.bank_account_id,
          customer_id:     t.customer_id || null,
          amount:          t.credit,
          amount_vnd:      t.credit,
          txn_date:        t.txn_date,
          is_unassigned:   true,    // chưa phân bổ vào đơn — gán sau
          note:            t.note ?? t.description.slice(0, 200),
          status:          'draft',
          created_by:      me.id,
        })
        if (error) { console.error('[import income]', error.message); skipped++; continue }
        created++
      } else {
        if (t.debit <= 0) { skipped++; continue }
        // supplier_id nullable trong schema gốc — OK
        const { error } = await supabase.from('expense_transactions').insert({
          company_id:      input.company_id,
          bank_account_id: input.bank_account_id,
          supplier_id:     t.supplier_id || null,
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
