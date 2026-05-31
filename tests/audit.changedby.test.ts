import { createClient } from '@supabase/supabase-js'
import { test, expect } from 'vitest'

/**
 * Integration test: Phase 7 — Audit trigger ghi đúng changed_by.
 * Kịch bản: KTT tạo expense → audit_log có dòng INSERT
 *   với changed_by = ktt.users.id đúng.
 */

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test('insert expense → audit_log có dòng INSERT với changed_by đúng', async () => {
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })

  const me      = (await ktt.from('users').select('id').eq('email', 'ktt@kbit.vn').single()).data!
  const company = (await ktt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  const bank    = (await ktt.from('bank_accounts').select('id').eq('company_id', company.id).limit(1).single()).data!

  const ins = await ktt
    .from('expense_transactions')
    .insert({
      company_id:      company.id,
      bank_account_id: bank.id,
      region:          'VN',
      amount_vnd:      2_000_000,
      txn_date:        '2026-06-15',
      status:          'draft',
    })
    .select('id')
    .single()
  expect(ins.error).toBeNull()

  // Đọc audit_log: dòng INSERT cho record_id này
  const log = await ktt
    .from('audit_log')
    .select('action, changed_by, record_id')
    .eq('table_name', 'expense_transactions')
    .eq('record_id', ins.data!.id)
    .eq('action', 'INSERT')
    .single()
  expect(log.error).toBeNull()
  expect(log.data!.changed_by).toBe(me.id)  // ✅ đúng người

  // dọn
  await ktt.from('expense_transactions').delete().eq('id', ins.data!.id)
})
