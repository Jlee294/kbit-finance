import { createClient } from '@supabase/supabase-js'
import { test, expect } from 'vitest'

/**
 * Integration test: Phase 7 — Tách người duyệt (DB enforcement).
 * Kịch bản 1: kế toán nhập chi (created_by THẬT), tự duyệt → bị chặn.
 *             KTT duyệt → approved, approved_by ≠ created_by.
 * Kịch bản 2: dòng khuyết người nhập (created_by null) → KHÔNG được duyệt (THIEU_NGUOI_NHAP).
 */

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test('kế toán nhập, tự duyệt bị chặn; KTT duyệt → approved_by ≠ created_by', async () => {
  const kt = createClient(url, anon)
  await kt.auth.signInWithPassword({ email: 'kt@kbit.vn', password: process.env.TEST_KT_PW! })

  const ktUser  = (await kt.from('users').select('id').eq('email', 'kt@kbit.vn').single()).data!
  const company = (await kt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  const bank    = (await kt.from('bank_accounts').select('id').eq('company_id', company.id).limit(1).single()).data!

  // 1) Kế toán nhập expense draft, txn_date kỳ MỞ (2026-06), created_by THẬT
  const ins = await kt
    .from('expense_transactions')
    .insert({
      company_id:      company.id,
      bank_account_id: bank.id,
      region:          'VN',
      amount_vnd:      5_000_000,
      txn_date:        '2026-06-10',
      status:          'draft',
      note:            'test tách người duyệt',
      created_by:      ktUser.id,
    })
    .select('id, created_by')
    .single()
  expect(ins.error).toBeNull()
  expect(ins.data!.created_by).toBe(ktUser.id)
  const exId = ins.data!.id

  // 2) Kế toán xác nhận (confirmed) → OK
  const confirmRes = await kt
    .from('expense_transactions')
    .update({ status: 'confirmed' })
    .eq('id', exId)
  expect(confirmRes.error).toBeNull()

  // 3) Kế toán tự duyệt → bị chặn (KHONG_DU_QUYEN_DUYET hoặc NGUOI_NHAP_KHONG_DUOC_TU_DUYET)
  const selfApprove = await kt
    .from('expense_transactions')
    .update({ status: 'approved' })
    .eq('id', exId)
  expect(selfApprove.error).not.toBeNull()

  // 4) KTT đăng nhập, duyệt → approved
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })
  const ok = await ktt
    .from('expense_transactions')
    .update({ status: 'approved' })
    .eq('id', exId)
    .select('status, approved_by, created_by')
    .single()
  expect(ok.error).toBeNull()
  expect(ok.data!.status).toBe('approved')
  expect(ok.data!.created_by).toBe(ktUser.id)
  expect(ok.data!.approved_by).not.toBeNull()
  expect(ok.data!.approved_by).not.toBe(ok.data!.created_by)  // ✅ tách người

  // dọn
  await ktt.from('expense_transactions').delete().eq('id', exId)
})

test('dòng khuyết người nhập (created_by null) → duyệt bị chặn THIEU_NGUOI_NHAP', async () => {
  const ktt = createClient(url, anon)
  await ktt.auth.signInWithPassword({ email: 'ktt@kbit.vn', password: process.env.TEST_KTT_PW! })

  const company = (await ktt.from('companies').select('id').eq('code', 'KBIT').single()).data!
  const bank    = (await ktt.from('bank_accounts').select('id').eq('company_id', company.id).limit(1).single()).data!

  // Insert với created_by = null (không set)
  const ins = await ktt
    .from('expense_transactions')
    .insert({
      company_id:      company.id,
      bank_account_id: bank.id,
      region:          'VN',
      amount_vnd:      1_000_000,
      txn_date:        '2026-06-12',
      status:          'confirmed',
    })
    .select('id, created_by')
    .single()
  expect(ins.error).toBeNull()
  expect(ins.data!.created_by).toBeNull()

  // Thử duyệt → phải bị chặn vì created_by null
  const tryApprove = await ktt
    .from('expense_transactions')
    .update({ status: 'approved' })
    .eq('id', ins.data!.id)
  expect(tryApprove.error).not.toBeNull()
  expect(tryApprove.error!.message).toContain('THIEU_NGUOI_NHAP')

  await ktt.from('expense_transactions').delete().eq('id', ins.data!.id)
})
