import { createClient } from '@supabase/supabase-js'
import { beforeAll, test, expect, afterAll } from 'vitest'

/**
 * Kiểm tra kbit_collect_receivable:
 * - Thu một phần → status vẫn outstanding
 * - Thu hết → status = collected
 * - Thu quá số còn lại → lỗi
 * - Thu lại khi đã collected → lỗi
 */

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sb: any
let companyId: string, bankId: string
let expenseId: string, receivableId: string
const tag = Date.now()

beforeAll(async () => {
  sb = createClient(url, anon)
  await sb.auth.signInWithPassword({ email: 'kt@kbit.vn', password: process.env.TEST_KT_PW! })

  companyId = (await sb.from('companies').select('id').eq('code', 'KBIT').single()).data!.id
  bankId = (
    await sb.from('bank_accounts').select('id')
      .eq('company_id', companyId).eq('currency', 'VND').limit(1).single()
  ).data!.id

  // Tạo 1 phiếu chi hộ 10tr
  const { data } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-10',
    p_amount_vnd:      10_000_000,
    p_note:            `rcv-test-${tag}`,
    p_is_chi_ho:       true,
    p_chi_ho_person:   'Chị B (test)',
  })
  expenseId = data

  const rec = await sb
    .from('internal_receivables')
    .select('id')
    .eq('expense_id', expenseId)
    .single()
  receivableId = rec.data!.id
})

test('Thu một phần 3tr → collected_amount=3tr, status=outstanding', async () => {
  const { error } = await sb.rpc('kbit_collect_receivable', {
    p_receivable_id:  receivableId,
    p_collect_amount: 3_000_000,
  })
  expect(error).toBeNull()

  const { data } = await sb
    .from('internal_receivables')
    .select('collected_amount, status')
    .eq('id', receivableId)
    .single()
  expect(Number(data.collected_amount)).toBe(3_000_000)
  expect(data.status).toBe('outstanding')
})

test('Thu tiếp 7tr → collected_amount=10tr, status=collected', async () => {
  const { error } = await sb.rpc('kbit_collect_receivable', {
    p_receivable_id:  receivableId,
    p_collect_amount: 7_000_000,
  })
  expect(error).toBeNull()

  const { data } = await sb
    .from('internal_receivables')
    .select('collected_amount, status')
    .eq('id', receivableId)
    .single()
  expect(Number(data.collected_amount)).toBe(10_000_000)
  expect(data.status).toBe('collected')
})

test('Thu thêm khi đã collected → lỗi', async () => {
  const { error } = await sb.rpc('kbit_collect_receivable', {
    p_receivable_id:  receivableId,
    p_collect_amount: 1_000_000,
  })
  expect(error).not.toBeNull()
})

test('ATOMIC: chi hộ với person=null → lỗi, KHÔNG ghi expense', async () => {
  const cntBefore = (
    await sb.from('expense_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
  ).count!

  const { error } = await sb.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-11',
    p_amount_vnd:      1_000_000,
    p_is_chi_ho:       true,
    p_chi_ho_person:   '',   // empty string → fail validation
  })
  expect(error).not.toBeNull()

  const cntAfter = (
    await sb.from('expense_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
  ).count!
  expect(cntAfter).toBe(cntBefore)
})

test('RLS: viewer KHÔNG gọi được kbit_create_expense_vn', async () => {
  const v = createClient(url, anon)
  await v.auth.signInWithPassword({ email: 'viewer@kbit.vn', password: process.env.TEST_VIEWER_PW! })
  const { error } = await v.rpc('kbit_create_expense_vn', {
    p_company_id:      companyId,
    p_bank_account_id: bankId,
    p_txn_date:        '2026-06-12',
    p_amount_vnd:      1_000_000,
    p_is_chi_ho:       false,
  })
  expect(error).not.toBeNull()
})

afterAll(async () => {
  if (expenseId) {
    await sb.from('internal_receivables').delete().eq('expense_id', expenseId)
    await sb.from('expense_transactions').delete().eq('id', expenseId)
  }
})
