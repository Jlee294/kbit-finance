import { createClient } from '@supabase/supabase-js'
import { test, expect, afterAll } from 'vitest'

/**
 * Integration test: Phase 6 — Documents & Reconciliation flow.
 * Scenario: expense với operation CHI_VAT (required: VAT_INVOICE + BANK_SLIP)
 *   1. Tạo document_type VAT_INVOICE, BANK_SLIP
 *   2. Tạo operation CHI_VAT với required_doc_type_ids = [VAT_INVOICE, BANK_SLIP]
 *   3. Insert expense với operation_id = CHI_VAT
 *   4. Insert + verify chỉ BANK_SLIP → reconcileEntity → isComplete = false, missing = [VAT_INVOICE]
 *   5. Insert + verify VAT_INVOICE → reconcileEntity → isComplete = true
 */

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const tag = Date.now()
const ids = { doctypes: [] as string[], operation: '', expense: '', docs: [] as string[] }

test('setup: đăng nhập kế toán', async () => {
  const { error } = await sb.auth.signInWithPassword({
    email: 'kt@kbit.vn',
    password: process.env.TEST_KT_PW!,
  })
  expect(error).toBeNull()
})

test('tạo 2 loại chứng từ VAT_INVOICE và BANK_SLIP', async () => {
  const { data, error } = await sb
    .from('document_types')
    .insert([
      { code: `VAT_INVOICE_${tag}`, name: 'Hóa đơn VAT (test)' },
      { code: `BANK_SLIP_${tag}`,   name: 'Ủy nhiệm chi (test)' },
    ])
    .select('id, code')
  expect(error).toBeNull()
  expect(data).toHaveLength(2)
  ids.doctypes = data!.map((d) => d.id)
})

test('tạo operation CHI_VAT với required = cả 2 loại chứng từ', async () => {
  const { data, error } = await sb
    .from('operation_library')
    .insert({
      code: `CHI_VAT_${tag}`,
      name: 'Chi phí có hóa đơn VAT (test)',
      required_doc_type_ids: ids.doctypes,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  ids.operation = data!.id
})

test('tạo expense với operation_id → status = draft', async () => {
  const companyId     = process.env.TEST_COMPANY_ID!
  const bankAccountId = process.env.TEST_BANK_ACCOUNT_ID!

  const { data, error } = await sb
    .from('expense_transactions')
    .insert({
      company_id:      companyId,
      bank_account_id: bankAccountId,
      txn_date:        '2026-05-30',
      amount_vnd:      10_000_000,
      expense_kind:    'service',
      operation_id:    ids.operation,
    })
    .select('id, status')
    .single()
  expect(error).toBeNull()
  expect(data!.status).toBe('draft')
  ids.expense = data!.id
})

test('đính kèm + xác nhận BANK_SLIP → vẫn thiếu VAT_INVOICE', async () => {
  const bankSlipTypeId = ids.doctypes[1] // second = BANK_SLIP

  // Insert doc
  const { data: doc, error: insErr } = await sb
    .from('documents')
    .insert({
      document_type_id: bankSlipTypeId,
      entity_type:     'expense',
      entity_id:       ids.expense,
      file_name:       'bank-slip-test.pdf',
    })
    .select('id')
    .single()
  expect(insErr).toBeNull()
  ids.docs.push(doc!.id)

  // Verify it
  const { error: verErr } = await sb
    .from('documents')
    .update({ is_verified: true })
    .eq('id', doc!.id)
  expect(verErr).toBeNull()

  // Check verified docs for entity
  const { data: verDocs } = await sb
    .from('documents')
    .select('document_type_id, is_verified')
    .eq('entity_type', 'expense')
    .eq('entity_id', ids.expense)
    .eq('is_verified', true)
  const verifiedTypeIds = (verDocs ?? []).map((d) => d.document_type_id)

  // reconcile
  const { reconcileDocs } = await import('@/features/documents/reconcile')
  const result = reconcileDocs(ids.doctypes, verifiedTypeIds)
  expect(result.isComplete).toBe(false)
  expect(result.missing).toContain(ids.doctypes[0]) // VAT_INVOICE still missing
})

test('đính kèm + xác nhận VAT_INVOICE → đủ hồ sơ', async () => {
  const vatTypeId = ids.doctypes[0] // first = VAT_INVOICE

  const { data: doc, error: insErr } = await sb
    .from('documents')
    .insert({
      document_type_id: vatTypeId,
      entity_type:     'expense',
      entity_id:       ids.expense,
      file_name:       'vat-invoice-test.pdf',
    })
    .select('id')
    .single()
  expect(insErr).toBeNull()
  ids.docs.push(doc!.id)

  const { error: verErr } = await sb
    .from('documents')
    .update({ is_verified: true })
    .eq('id', doc!.id)
  expect(verErr).toBeNull()

  // Now all required types verified
  const { data: verDocs } = await sb
    .from('documents')
    .select('document_type_id, is_verified')
    .eq('entity_type', 'expense')
    .eq('entity_id', ids.expense)
    .eq('is_verified', true)
  const verifiedTypeIds = (verDocs ?? []).map((d) => d.document_type_id)

  const { reconcileDocs } = await import('@/features/documents/reconcile')
  const result = reconcileDocs(ids.doctypes, verifiedTypeIds)
  expect(result.isComplete).toBe(true)
  expect(result.missing).toHaveLength(0)
})

afterAll(async () => {
  // Clean up in order: documents, expense, operation, document_types
  if (ids.docs.length)   await sb.from('documents').delete().in('id', ids.docs)
  if (ids.expense)       await sb.from('expense_transactions').delete().eq('id', ids.expense)
  if (ids.operation)     await sb.from('operation_library').delete().eq('id', ids.operation)
  if (ids.doctypes.length) await sb.from('document_types').delete().in('id', ids.doctypes)
})
