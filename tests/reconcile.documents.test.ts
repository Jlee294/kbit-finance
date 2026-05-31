/**
 * Unit tests for reconcileDocs — pure function, no DB needed.
 * All 8 scenarios from the Phase 6 acceptance spec.
 */
import { test, expect } from 'vitest'
import { reconcileDocs } from '@/features/documents/reconcile'

const VAT_ID   = 'aaa00000-0000-0000-0000-000000000001'
const SLIP_ID  = 'bbb00000-0000-0000-0000-000000000002'
const OTHER_ID = 'ccc00000-0000-0000-0000-000000000003'

// 1. No required types → always complete
test('no required types → isComplete = true', () => {
  const r = reconcileDocs([], [VAT_ID])
  expect(r.isComplete).toBe(true)
  expect(r.missing).toHaveLength(0)
  expect(r.present).toHaveLength(0)
})

// 2. Required = [VAT, SLIP], verified = [] → missing both
test('required 2 types, verified 0 → isComplete = false, missing both', () => {
  const r = reconcileDocs([VAT_ID, SLIP_ID], [])
  expect(r.isComplete).toBe(false)
  expect(r.missing).toEqual(expect.arrayContaining([VAT_ID, SLIP_ID]))
  expect(r.present).toHaveLength(0)
})

// 3. Required = [VAT, SLIP], verified = [SLIP] → missing VAT
test('verified only SLIP → missing VAT', () => {
  const r = reconcileDocs([VAT_ID, SLIP_ID], [SLIP_ID])
  expect(r.isComplete).toBe(false)
  expect(r.missing).toContain(VAT_ID)
  expect(r.present).toContain(SLIP_ID)
})

// 4. Both verified → complete
test('both verified → isComplete = true', () => {
  const r = reconcileDocs([VAT_ID, SLIP_ID], [VAT_ID, SLIP_ID])
  expect(r.isComplete).toBe(true)
  expect(r.missing).toHaveLength(0)
  expect(r.present).toHaveLength(2)
})

// 5. Extra verified docs (not in required) → still complete
test('extra verified docs beyond required → still complete', () => {
  const r = reconcileDocs([VAT_ID, SLIP_ID], [VAT_ID, SLIP_ID, OTHER_ID])
  expect(r.isComplete).toBe(true)
  expect(r.present).toEqual(expect.arrayContaining([VAT_ID, SLIP_ID]))
  // OTHER_ID is not in present (it's not in required)
  expect(r.present).not.toContain(OTHER_ID)
})

// 6. Required = [VAT], verified = [OTHER] → missing VAT
test('verified doc is different type from required → isComplete = false', () => {
  const r = reconcileDocs([VAT_ID], [OTHER_ID])
  expect(r.isComplete).toBe(false)
  expect(r.missing).toContain(VAT_ID)
})

// 7. Empty required, empty verified → complete
test('both empty → isComplete = true', () => {
  const r = reconcileDocs([], [])
  expect(r.isComplete).toBe(true)
})

// 8. Duplicate in verifiedTypeIds → no error
test('duplicate verified IDs → handled correctly', () => {
  const r = reconcileDocs([VAT_ID, SLIP_ID], [VAT_ID, VAT_ID, SLIP_ID])
  expect(r.isComplete).toBe(true)
  expect(r.missing).toHaveLength(0)
})
