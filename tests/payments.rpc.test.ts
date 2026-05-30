import { createClient } from '@supabase/supabase-js'
import { beforeAll, test, expect } from 'vitest'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signedInAccountant() {
  const sb = createClient(url, anon)
  const { error } = await sb.auth.signInWithPassword({
    email: 'kt@kbit.vn',
    password: process.env.TEST_KT_PW!,
  })
  if (error) throw error
  return sb
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sb: any
let companyId: string, customerId: string, bankId: string
let orderA: string, orderB: string
const tag = Date.now()

beforeAll(async () => {
  sb = await signedInAccountant()

  companyId = (await sb.from('companies').select('id').eq('code', 'KBIT').single()).data!.id
  customerId = (await sb.from('customers').select('id').limit(1).single()).data!.id
  bankId = (await sb.from('bank_accounts').select('id')
    .eq('company_id', companyId).eq('currency', 'VND').limit(1).single()).data!.id

  orderA = (await sb.from('customer_orders').insert({
    company_id: companyId, customer_id: customerId,
    order_code: `T2A-${tag}`, order_date: '2026-05-01', grand_total: 100_000_000,
  }).select('id').single()).data!.id

  orderB = (await sb.from('customer_orders').insert({
    company_id: companyId, customer_id: customerId,
    order_code: `T2B-${tag}`, order_date: '2026-05-01', grand_total: 50_000_000,
  }).select('id').single()).data!.id
})

test('Phiếu thu 120tr phân bổ A:100tr B:20tr → A outstanding=0(paid), B=30tr(partial)', async () => {
  const { error } = await sb.rpc('kbit_record_income', {
    p_company_id: companyId, p_bank_account_id: bankId, p_customer_id: customerId,
    p_amount: 120_000_000, p_txn_date: '2026-05-10', p_note: 'thu 2 đơn',
    p_allocations: [
      { customer_order_id: orderA, allocated_amount: 100_000_000 },
      { customer_order_id: orderB, allocated_amount:  20_000_000 },
    ],
  })
  expect(error).toBeNull()

  const a = (await sb.from('customer_orders').select('outstanding, payment_status').eq('id', orderA).single()).data!
  const b = (await sb.from('customer_orders').select('outstanding, payment_status').eq('id', orderB).single()).data!
  expect(Number(a.outstanding)).toBe(0)
  expect(a.payment_status).toBe('paid')
  expect(Number(b.outstanding)).toBe(30_000_000)
  expect(b.payment_status).toBe('partial')
})

test('Thu tiếp B 40tr (thừa 10tr) → B=0(paid), prepaid_balance += 10tr', async () => {
  const before = Number((await sb.from('customers').select('prepaid_balance').eq('id', customerId).single()).data!.prepaid_balance)

  const { error } = await sb.rpc('kbit_record_income', {
    p_company_id: companyId, p_bank_account_id: bankId, p_customer_id: customerId,
    p_amount: 40_000_000, p_txn_date: '2026-05-11', p_note: 'thu thừa B',
    p_allocations: [{ customer_order_id: orderB, allocated_amount: 30_000_000 }],
  })
  expect(error).toBeNull()

  const b = (await sb.from('customer_orders').select('outstanding, payment_status').eq('id', orderB).single()).data!
  expect(Number(b.outstanding)).toBe(0)
  expect(b.payment_status).toBe('paid')

  const after = Number((await sb.from('customers').select('prepaid_balance').eq('id', customerId).single()).data!.prepaid_balance)
  expect(after - before).toBe(10_000_000)
})

test('ATOMIC: phân bổ vào đơn không tồn tại → rollback, KHÔNG ghi income nào', async () => {
  const cntBefore = (await sb.from('income_transactions').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count!

  const { error } = await sb.rpc('kbit_record_income', {
    p_company_id: companyId, p_bank_account_id: bankId, p_customer_id: customerId,
    p_amount: 5_000_000, p_txn_date: '2026-05-12', p_note: 'lỗi cố ý',
    p_allocations: [{ customer_order_id: '00000000-0000-0000-0000-000000000000', allocated_amount: 5_000_000 }],
  })
  expect(error).not.toBeNull()

  const cntAfter = (await sb.from('income_transactions').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count!
  expect(cntAfter).toBe(cntBefore)
})

test('RLS: viewer KHÔNG gọi được RPC ghi thu', async () => {
  const v = createClient(url, anon)
  await v.auth.signInWithPassword({ email: 'viewer@kbit.vn', password: process.env.TEST_VIEWER_PW! })
  const { error } = await v.rpc('kbit_record_income', {
    p_company_id: companyId, p_bank_account_id: bankId, p_customer_id: customerId,
    p_amount: 1_000_000, p_txn_date: '2026-05-12', p_note: 'viewer thử',
    p_allocations: [],
  })
  expect(error).not.toBeNull()
})
