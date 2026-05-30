import { createClient } from '@supabase/supabase-js'
import { test, expect } from 'vitest'

// Chạy SAU payments.rpc.test.ts (đã thu 120tr + 40tr = 160tr vào cùng 1 TK).
test('VIEW số dư: tài khoản tăng đúng tổng các phiếu thu (120tr + 40tr = 160tr)', async () => {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  await sb.auth.signInWithPassword({ email: 'kt@kbit.vn', password: process.env.TEST_KT_PW! })

  const companyId = (await sb.from('companies').select('id').eq('code', 'KBIT').single()).data!.id
  const bankId = (await sb.from('bank_accounts').select('id')
    .eq('company_id', companyId).eq('currency', 'VND').limit(1).single()).data!.id

  const row = (await sb.from('v_bank_balances').select('currency, balance')
    .eq('bank_account_id', bankId).single()).data!
  expect(row.currency).toBe('VND')
  expect(Number(row.balance)).toBeGreaterThanOrEqual(160_000_000)

  // Kiểm VIEW khớp công thức: tổng thu - tổng chi (amount_vnd)
  const ins = (await sb.from('income_transactions').select('amount')
    .eq('bank_account_id', bankId).in('status', ['confirmed', 'approved'])).data ?? []
  const exp = (await sb.from('expense_transactions').select('amount_vnd')
    .eq('bank_account_id', bankId).in('status', ['confirmed', 'approved'])).data ?? []
  const totalIn  = ins.reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
  const totalOut = exp.reduce((s: number, r: { amount_vnd: number | null }) => s + Number(r.amount_vnd ?? 0), 0)
  expect(Number(row.balance)).toBe(totalIn - totalOut)
})
