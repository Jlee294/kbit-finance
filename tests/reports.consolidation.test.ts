/**
 * Integration tests — Phase 8 báo cáo hợp nhất.
 *
 * Kiểm tra:
 *   1. Giao dịch nội bộ (is_intercompany=true) bị LOẠI khỏi báo cáo hợp nhất.
 *   2. Thu KRW được quy đổi VND theo tỷ giá ngày giao dịch (kbit_rate_on).
 *   3. Net cash flow = Tổng thu VND − Tổng chi VND.
 *   4. missing_rate = true khi thiếu tỷ giá cho giao dịch ngoại tệ.
 *
 * Yêu cầu: biến môi trường SUPABASE_URL + SUPABASE_SERVICE_KEY
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL        ?? ''
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

const supabase = createClient(url, key)

// ── seed IDs (deterministic, easy to clean up) ──────────────────────────────
const CO_ID  = '11111111-0000-0000-0000-000000000001'   // VN company  (VND)
const CO_KR  = '22222222-0000-0000-0000-000000000002'   // KR company  (KRW)
const INC_EXT = '33333333-0000-0000-0000-000000000001'  // thu bên ngoài VND
const INC_INT = '44444444-0000-0000-0000-000000000002'  // thu nội bộ   VND (loại trừ)
const INC_KRW = '55555555-0000-0000-0000-000000000003'  // thu KRW (quy đổi)
const EXP_EXT = '66666666-0000-0000-0000-000000000001'  // chi bên ngoài
const EXP_INT = '77777777-0000-0000-0000-000000000002'  // chi nội bộ (loại trừ)
const INC_NO_RATE = '88888888-0000-0000-0000-000000000004' // thu ngoại tệ thiếu tỷ giá

const TEST_DATE      = '2099-01-15'   // xa hiện tại để không xung đột
const RATE_DATE      = '2099-01-01'
const RATE_KRW_VND   = 18             // 1 KRW = 18 VND (test fixture)

describe('kbit_report_consolidated — inter-company exclusion + FX', () => {
  beforeAll(async () => {
    if (!url || !key) return

    // --- Tỷ giá test ---
    await supabase.from('exchange_rates').upsert({
      id:            'eeeeeeee-0000-0000-0000-000000000001',
      currency_from: 'KRW',
      currency_to:   'VND',
      rate:          RATE_KRW_VND,
      rate_date:     RATE_DATE,
    })

    // --- Thu bên ngoài: 100 VND ---
    await supabase.from('income_transactions').upsert({
      id:               INC_EXT,
      company_id:       CO_ID,
      txn_date:         TEST_DATE,
      amount:           100,
      currency:         'VND',
      status:           'confirmed',
      is_intercompany:  false,
      is_chi_ho:        false,
    })

    // --- Thu nội bộ: 999 VND (phải bị loại) ---
    await supabase.from('income_transactions').upsert({
      id:               INC_INT,
      company_id:       CO_ID,
      txn_date:         TEST_DATE,
      amount:           999,
      currency:         'VND',
      status:           'confirmed',
      is_intercompany:  true,
      is_chi_ho:        false,
    })

    // --- Thu KRW: 10 KRW → 10 × 18 = 180 VND ---
    await supabase.from('income_transactions').upsert({
      id:               INC_KRW,
      company_id:       CO_KR,
      txn_date:         TEST_DATE,
      amount:           10,
      currency:         'KRW',
      status:           'confirmed',
      is_intercompany:  false,
      is_chi_ho:        false,
    })

    // --- Chi bên ngoài: 50 VND ---
    await supabase.from('expense_transactions').upsert({
      id:               EXP_EXT,
      company_id:       CO_ID,
      txn_date:         TEST_DATE,
      amount_vnd:       50,
      status:           'confirmed',
      is_intercompany:  false,
      is_chi_ho:        false,
    })

    // --- Chi nội bộ: 777 VND (phải bị loại) ---
    await supabase.from('expense_transactions').upsert({
      id:               EXP_INT,
      company_id:       CO_ID,
      txn_date:         TEST_DATE,
      amount_vnd:       777,
      status:           'confirmed',
      is_intercompany:  true,
      is_chi_ho:        false,
    })
  })

  afterAll(async () => {
    if (!url || !key) return
    await supabase.from('income_transactions').delete().in('id', [INC_EXT, INC_INT, INC_KRW, INC_NO_RATE])
    await supabase.from('expense_transactions').delete().in('id', [EXP_EXT, EXP_INT])
    await supabase.from('exchange_rates').delete().eq('id', 'eeeeeeee-0000-0000-0000-000000000001')
  })

  it('skip nếu không có env vars', () => {
    if (!url || !key) {
      console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY không có — bỏ qua integration test')
      return
    }
    expect(url).toBeTruthy()
  })

  it('loại trừ nội bộ: tổng thu = 100 + 180, KHÔNG cộng 999 nội bộ', async () => {
    if (!url || !key) return

    const { data, error } = await supabase.rpc('kbit_report_consolidated', {
      p_from: TEST_DATE,
      p_to:   TEST_DATE,
    })
    expect(error).toBeNull()
    const row = (data as any)[0]

    // 100 (VND) + 10 × 18 (KRW→VND) = 280
    expect(row.total_income_vnd).toBe(280)
    // 999 nội bộ bị loại trừ hoàn toàn
    expect(row.total_income_vnd).not.toBe(1279)
  })

  it('loại trừ nội bộ: tổng chi = 50, KHÔNG cộng 777 nội bộ', async () => {
    if (!url || !key) return

    const { data, error } = await supabase.rpc('kbit_report_consolidated', {
      p_from: TEST_DATE,
      p_to:   TEST_DATE,
    })
    expect(error).toBeNull()
    const row = (data as any)[0]
    expect(row.total_expense_vnd).toBe(50)
  })

  it('net_cash_flow = tổng_thu_vnd − tổng_chi_vnd = 280 − 50 = 230', async () => {
    if (!url || !key) return

    const { data, error } = await supabase.rpc('kbit_report_consolidated', {
      p_from: TEST_DATE,
      p_to:   TEST_DATE,
    })
    expect(error).toBeNull()
    const row = (data as any)[0]
    expect(row.net_cash_flow_vnd).toBe(row.total_income_vnd - row.total_expense_vnd)
    expect(row.net_cash_flow_vnd).toBe(230)
  })

  it('missing_rate = false khi đủ tỷ giá', async () => {
    if (!url || !key) return

    const { data, error } = await supabase.rpc('kbit_report_consolidated', {
      p_from: TEST_DATE,
      p_to:   TEST_DATE,
    })
    expect(error).toBeNull()
    const row = (data as any)[0]
    expect(row.missing_rate).toBe(false)
  })

  it('missing_rate = true khi có thu ngoại tệ thiếu tỷ giá', async () => {
    if (!url || !key) return

    // Thêm thu KRW vào ngày 2099-12-31 — KHÔNG có tỷ giá cho ngày này
    await supabase.from('income_transactions').upsert({
      id:               INC_NO_RATE,
      company_id:       CO_KR,
      txn_date:         '2099-12-31',
      amount:           5,
      currency:         'KRW',
      status:           'confirmed',
      is_intercompany:  false,
      is_chi_ho:        false,
    })

    const { data, error } = await supabase.rpc('kbit_report_consolidated', {
      p_from: '2099-01-01',
      p_to:   '2099-12-31',
    })
    expect(error).toBeNull()
    const row = (data as any)[0]
    expect(row.missing_rate).toBe(true)

    // Cleanup ngay trong test này
    await supabase.from('income_transactions').delete().eq('id', INC_NO_RATE)
  })
})
