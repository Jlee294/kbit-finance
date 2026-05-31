import { test, expect } from 'vitest'
import { reconcileDocs } from '@/features/documents/reconcile'

/**
 * Unit test: Phase 7 — D11/I3: cổng hồ sơ khi rời draft/duyệt.
 *
 * Verify reconcileDocs (pure function) đúng với mọi combo → transitionTxn
 * sẽ throw THIEU_HO_SO khi isComplete = false.
 *
 * Integration test thật (với DB + operation CHI_VAT) → phase6.flow.test.ts.
 */

const VAT_ID  = 'aaaaaaaa-0000-0000-0000-000000000001'
const SLIP_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const required = [VAT_ID, SLIP_ID]

test('0 verified → isComplete false, action phải từ chối', () => {
  const r = reconcileDocs(required, [])
  expect(r.isComplete).toBe(false)
  expect(r.missing).toHaveLength(2)
  // app sẽ throw: `THIEU_HO_SO:${missingCodes}` → mapDbError → tiếng Việt thân thiện
  expect(r.missing).toContain(VAT_ID)
  expect(r.missing).toContain(SLIP_ID)
})

test('1/2 verified → vẫn isComplete false, đúng loại còn thiếu', () => {
  const r = reconcileDocs(required, [SLIP_ID])
  expect(r.isComplete).toBe(false)
  expect(r.missing).toContain(VAT_ID)
  expect(r.present).toContain(SLIP_ID)
})

test('đủ 2/2 verified → isComplete true, action cho qua', () => {
  const r = reconcileDocs(required, [VAT_ID, SLIP_ID])
  expect(r.isComplete).toBe(true)
  expect(r.missing).toHaveLength(0)
})

test('required rỗng (operation không có checklist) → luôn complete', () => {
  const r = reconcileDocs([], [])
  expect(r.isComplete).toBe(true)
})

test('extra verified không nằm trong required → vẫn complete', () => {
  const extraId = 'cccccccc-0000-0000-0000-000000000003'
  const r = reconcileDocs(required, [VAT_ID, SLIP_ID, extraId])
  expect(r.isComplete).toBe(true)
})
