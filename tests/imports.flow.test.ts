import { createClient } from '@supabase/supabase-js'
import { test, expect, afterAll } from 'vitest'

/**
 * Integration test: kiểm tra DB tự tính cost_total và outstanding đúng.
 * Xác nhận app KHÔNG cần gửi generated columns.
 * Số thật đề bài: lô 1.000 SP → cost_total = 112tr, outstanding = 123tr.
 */

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ids: string[] = []
const tag = Date.now()

test('setup: đăng nhập kế toán', async () => {
  const { error } = await sb.auth.signInWithPassword({
    email: 'kt@kbit.vn',
    password: process.env.TEST_KT_PW!,
  })
  expect(error).toBeNull()
})

test('insert đơn import VND → DB tự tính cost_total=112tr, outstanding=123tr', async () => {
  const companyId  = process.env.TEST_COMPANY_ID!
  const supplierId = process.env.TEST_SUPPLIER_ID!

  const { data: order, error } = await sb
    .from('supplier_orders')
    .insert({
      company_id:   companyId,
      supplier_id:  supplierId,
      order_code:   `IMP-TEST-VND-${tag}`,
      order_type:   'import',
      order_date:   '2026-05-30',
      currency:     'VND',
      goods_value:  100_000_000,
      import_duty:   10_000_000,
      vat_import:    11_000_000,
      other_fees:     2_000_000,
      amount_paid:            0,
    })
    .select('id, cost_total, outstanding')
    .single()

  expect(error).toBeNull()
  ids.push(order!.id)

  // cost_total = goods + duty + other (KHÔNG gồm vat_import)
  expect(Number(order!.cost_total)).toBe(112_000_000)
  // outstanding = 100+10+11+2 - 0 = 123tr
  expect(Number(order!.outstanding)).toBe(123_000_000)
})

test('trả NCC 50tr → outstanding còn 73tr', async () => {
  const id = ids[0]
  const { data, error } = await sb
    .from('supplier_orders')
    .update({ amount_paid: 50_000_000 })
    .eq('id', id)
    .select('outstanding')
    .single()

  expect(error).toBeNull()
  expect(Number(data!.outstanding)).toBe(73_000_000)
})

test('insert đơn import KRW → exchange_rate ghi đúng; cost_total/outstanding ở KRW (C3/C4)', async () => {
  const companyId  = process.env.TEST_COMPANY_ID!
  const supplierId = process.env.TEST_SUPPLIER_ID!

  const { data: order, error } = await sb
    .from('supplier_orders')
    .insert({
      company_id:   companyId,
      supplier_id:  supplierId,
      order_code:   `IMP-TEST-KRW-${tag}`,
      order_type:   'import',
      order_date:   '2026-05-30',
      currency:     'KRW',
      exchange_rate: 18,
      goods_value:  1_000_000,
      import_duty:    100_000,
      vat_import:     110_000,
      other_fees:      20_000,
      amount_paid:          0,
    })
    .select('id, exchange_rate, cost_total, outstanding')
    .single()

  expect(error).toBeNull()
  ids.push(order!.id)

  // C4/D4: exchange_rate ghi đúng
  expect(Number(order!.exchange_rate)).toBe(18)
  // cost_total = 1.000.000 + 100.000 + 20.000 (KRW, KHÔNG gồm vat_import 110.000)
  expect(Number(order!.cost_total)).toBe(1_120_000)
  // outstanding = 1.000.000 + 100.000 + 110.000 + 20.000 (KRW)
  expect(Number(order!.outstanding)).toBe(1_230_000)
})

afterAll(async () => {
  if (ids.length > 0) {
    await sb.from('supplier_order_items').delete().in('order_id', ids)
    await sb.from('supplier_orders').delete().in('id', ids)
  }
})
