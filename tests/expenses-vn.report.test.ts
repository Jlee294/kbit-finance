import { createClient } from '@supabase/supabase-js'
import { beforeAll, test, expect, afterAll } from 'vitest'

/**
 * Kiểm tra logic báo cáo chi phí:
 * - chi công ty CÓ VAT 11tr → chi phí công ty
 * - chi công ty KHÔNG VAT 2tr → chi phí công ty
 * - chi hộ anh A 5tr → KHÔNG tính vào chi phí công ty
 * → chi phí công ty = 13tr (không phải 18tr)
 */

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sb: any
let companyId: string, bankId: string
const ids: string[] = []
const tag = Date.now()

beforeAll(async () => {
  sb = createClient(url, anon)
  await sb.auth.signInWithPassword({ email: 'kt@kbit.vn', password: process.env.TEST_KT_PW! })

  companyId = (await sb.from('companies').select('id').eq('code', 'KBIT').single()).data!.id
  bankId = (
    await sb.from('bank_accounts').select('id')
      .eq('company_id', companyId).eq('currency', 'VND').limit(1).single()
  ).data!.id
})

test('Chi công ty CÓ VAT 11tr ghi được và trả UUID', async () => {
  const { data, error } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-01',
    p_amount_vnd:      11_000_000,
    p_note:            `test-vat-${tag}`,
    p_has_vat:         true,
    p_vat_amount:      1_000_000,
    p_is_chi_ho:       false,
  })
  expect(error).toBeNull()
  expect(typeof data).toBe('string')
  ids.push(data)
})

test('Chi công ty KHÔNG VAT 2tr ghi được', async () => {
  const { data, error } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-02',
    p_amount_vnd:      2_000_000,
    p_note:            `test-no-vat-${tag}`,
    p_has_vat:         false,
    p_is_chi_ho:       false,
  })
  expect(error).toBeNull()
  ids.push(data)
})

test('Chi hộ anh A 5tr ghi được + tạo internal_receivable', async () => {
  const { data, error } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-03',
    p_amount_vnd:      5_000_000,
    p_note:            `test-chi-ho-${tag}`,
    p_has_vat:         false,
    p_is_chi_ho:       true,
    p_chi_ho_person:   'Anh A (test)',
  })
  expect(error).toBeNull()
  ids.push(data)

  // Kiểm tra internal_receivable được tạo
  const { data: rec } = await sb
    .from('internal_receivables')
    .select('person, amount, status')
    .eq('expense_id', data)
    .single()
  expect(rec).not.toBeNull()
  expect(rec.person).toBe('Anh A (test)')
  expect(Number(rec.amount)).toBe(5_000_000)
  expect(rec.status).toBe('outstanding')
})

test('sumCompanyExpenseVN: tổng 3 phiếu vừa tạo — chi phí công ty = 13tr (không tính chi hộ)', async () => {
  // Lấy tổng từ DB: is_chi_ho=false, status in (confirmed, approved)
  // NOTE: các phiếu vừa tạo ở trạng thái 'draft' nên sẽ không vào tổng confirmed.
  // Cập nhật status = confirmed để test đúng business rule.
  if (ids.length >= 3) {
    await sb
      .from('expense_transactions')
      .update({ status: 'confirmed' })
      .in('id', ids)
  }

  const companyRows = await sb
    .from('expense_transactions')
    .select('amount_vnd')
    .eq('region', 'VN')
    .eq('is_chi_ho', false)
    .in('status', ['confirmed', 'approved'])
    .in('id', ids)

  const chiHoRows = await sb
    .from('expense_transactions')
    .select('amount_vnd')
    .eq('region', 'VN')
    .eq('is_chi_ho', true)
    .in('status', ['confirmed', 'approved'])
    .in('id', ids)

  const companyTotal = (companyRows.data ?? []).reduce(
    (s: number, r: { amount_vnd: number }) => s + Number(r.amount_vnd), 0
  )
  const chiHoTotal = (chiHoRows.data ?? []).reduce(
    (s: number, r: { amount_vnd: number }) => s + Number(r.amount_vnd), 0
  )

  expect(companyTotal).toBe(13_000_000)   // 11tr + 2tr (chi hộ bị loại)
  expect(chiHoTotal).toBe(5_000_000)      // chỉ chi hộ
})

test('Chi hộ KHÔNG có person → lỗi', async () => {
  const { error } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-04',
    p_amount_vnd:      1_000_000,
    p_is_chi_ho:       true,
    p_chi_ho_person:   null,
  })
  expect(error).not.toBeNull()
})

afterAll(async () => {
  // Cleanup test data
  if (ids.length > 0) {
    await sb.from('internal_receivables').delete().in('expense_id', ids)
    await sb.from('expense_transactions').delete().in('id', ids)
  }
})
