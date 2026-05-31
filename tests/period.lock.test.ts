import { createClient } from '@supabase/supabase-js'
import { test, expect, afterAll } from 'vitest'

/**
 * Integration test: Phase 7 — Trigger khóa kỳ chặn sửa giao dịch.
 * Kịch bản:
 *   - KTT khóa kỳ 2026-05 của KBIT
 *   - Insert expense txn_date 2026-05 → bị chặn KY_DA_KHOA
 *   - Insert expense txn_date 2026-06 → OK
 *   - D10/I2: Insert supplier_order order_date 2026-05 → bị chặn
 *   - Insert supplier_order order_date 2026-06 → OK
 *   Dọn: xóa giao dịch tạo + mở lại kỳ
 */

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const createdIds: { table: string; id: string }[] = []

test('khóa kỳ 2026-05: expense T5 bị chặn; expense T6 OK', async () => {
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })

  const company = (await ktt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  const bank    = (await ktt.from('bank_accounts').select('id').eq('company_id', company.id).limit(1).single()).data!

  // Đảm bảo có kỳ 2026-05 (open trước)
  await ktt.from('accounting_periods').upsert(
    [{ company_id: company.id, period: '2026-05', status: 'open' },
     { company_id: company.id, period: '2026-06', status: 'open' }],
    { onConflict: 'company_id,period' },
  )

  // KTT khóa kỳ 2026-05
  await ktt.from('accounting_periods')
    .update({ status: 'locked', locked_at: new Date().toISOString() })
    .eq('company_id', company.id).eq('period', '2026-05')

  // 1) Insert expense txn_date 2026-05 → bị chặn
  const blocked = await ktt.from('expense_transactions').insert({
    company_id: company.id, bank_account_id: bank.id,
    region: 'VN', amount_vnd: 1_000_000, txn_date: '2026-05-20', status: 'draft',
  })
  expect(blocked.error).not.toBeNull()
  expect(blocked.error!.message).toContain('KY_DA_KHOA')

  // 2) Insert expense txn_date 2026-06 → OK
  const ok = await ktt.from('expense_transactions').insert({
    company_id: company.id, bank_account_id: bank.id,
    region: 'VN', amount_vnd: 1_000_000, txn_date: '2026-06-20', status: 'draft',
  }).select('id').single()
  expect(ok.error).toBeNull()
  createdIds.push({ table: 'expense_transactions', id: ok.data!.id })
})

test('D10/I2: supplier_order order_date T5 bị chặn; T6 OK', async () => {
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })

  const company  = (await ktt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  const supplier = (await ktt.from('suppliers').select('id').limit(1).single()).data!

  // Kỳ 2026-05 đã khóa từ test trên — thử insert supplier_order order_date 2026-05
  const blocked = await ktt.from('supplier_orders').insert({
    company_id: company.id, supplier_id: supplier.id,
    order_code: `TEST-LOCK-${Date.now()}`,
    order_type: 'import', order_date: '2026-05-15',
    currency: 'VND', goods_value: 1_000_000,
    import_duty: 0, vat_import: 0, other_fees: 0, amount_paid: 0,
  })
  expect(blocked.error).not.toBeNull()
  expect(blocked.error!.message).toContain('KY_DA_KHOA')

  // order_date 2026-06 → OK
  const ok = await ktt.from('supplier_orders').insert({
    company_id: company.id, supplier_id: supplier.id,
    order_code: `TEST-OPEN-${Date.now()}`,
    order_type: 'import', order_date: '2026-06-15',
    currency: 'VND', goods_value: 1_000_000,
    import_duty: 0, vat_import: 0, other_fees: 0, amount_paid: 0,
  }).select('id').single()
  expect(ok.error).toBeNull()
  createdIds.push({ table: 'supplier_orders', id: ok.data!.id })
})

afterAll(async () => {
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })

  // Dọn giao dịch đã tạo
  for (const { table, id } of createdIds) {
    await ktt.from(table).delete().eq('id', id)
  }

  // Mở lại kỳ 2026-05
  const company = (await ktt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  await ktt.from('accounting_periods')
    .update({ status: 'open', locked_at: null, locked_by: null })
    .eq('company_id', company.id).eq('period', '2026-05')
})
