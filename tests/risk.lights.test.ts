/**
 * Unit tests — Phase 9 logic đèn (THUẦN, không DB).
 * Task 9.8 Step 1 — npx vitest run tests/risk.lights.test.ts
 */

import { test, expect } from 'vitest'
import { lightForIndicator, rollupGroup, rollupOverall } from '@/features/risk/lights'
import type { RiskGroup } from '@/features/risk/indicators'

// ── lightForIndicator ─────────────────────────────────────────────────────────

test('higher_worse: 120tr >= red 100tr → red', () => {
  const r = lightForIndicator(120_000_000, 'higher_worse', { yellow_at: 50_000_000, red_at: 100_000_000 })
  expect(r.light).toBe('red')
  expect(r.configured).toBe(true)
})

test('higher_worse: 80tr < red 100tr, >= yellow 50tr → yellow', () => {
  const r = lightForIndicator(80_000_000, 'higher_worse', { yellow_at: 50_000_000, red_at: 100_000_000 })
  expect(r.light).toBe('yellow')
})

test('higher_worse: 40tr < yellow 50tr → green', () => {
  const r = lightForIndicator(40_000_000, 'higher_worse', { yellow_at: 50_000_000, red_at: 100_000_000 })
  expect(r.light).toBe('green')
})

test('higher_worse: bằng ngưỡng yellow → yellow (đúng biên)', () => {
  const r = lightForIndicator(50_000_000, 'higher_worse', { yellow_at: 50_000_000, red_at: 100_000_000 })
  expect(r.light).toBe('yellow')
})

test('lower_worse: số dư 0 <= red 10tr → red', () => {
  const r = lightForIndicator(0, 'lower_worse', { yellow_at: 50_000_000, red_at: 10_000_000 })
  expect(r.light).toBe('red')
})

test('lower_worse: 30tr trong vùng yellow (≤50tr, >10tr) → yellow', () => {
  const r = lightForIndicator(30_000_000, 'lower_worse', { yellow_at: 50_000_000, red_at: 10_000_000 })
  expect(r.light).toBe('yellow')
})

test('lower_worse: 100tr > yellow 50tr → green', () => {
  const r = lightForIndicator(100_000_000, 'lower_worse', { yellow_at: 50_000_000, red_at: 10_000_000 })
  expect(r.light).toBe('green')
})

test('thiếu ngưỡng (undefined) → green + configured=false', () => {
  const r = lightForIndicator(999_999, 'higher_worse', undefined)
  expect(r.light).toBe('green')
  expect(r.configured).toBe(false)
})

test('ngưỡng rỗng (null/null) → green + configured=false', () => {
  const r = lightForIndicator(999_999, 'higher_worse', { yellow_at: null, red_at: null })
  expect(r.light).toBe('green')
  expect(r.configured).toBe(false)
})

test('chỉ có yellow_at, không red_at → vẫn tính đúng', () => {
  const r = lightForIndicator(60_000_000, 'higher_worse', { yellow_at: 50_000_000, red_at: null })
  expect(r.light).toBe('yellow')
})

// ── rollupGroup ───────────────────────────────────────────────────────────────

test('rollupGroup: có đỏ → đỏ', () => {
  expect(rollupGroup(['green', 'yellow', 'red'])).toBe('red')
})

test('rollupGroup: không đỏ, có vàng → vàng', () => {
  expect(rollupGroup(['green', 'yellow', 'green'])).toBe('yellow')
})

test('rollupGroup: tất cả xanh → xanh', () => {
  expect(rollupGroup(['green', 'green'])).toBe('green')
})

test('rollupGroup: rỗng → xanh', () => {
  expect(rollupGroup([])).toBe('green')
})

// ── rollupOverall (A6 — "có đỏ là đỏ") ───────────────────────────────────────

const allGreen: Record<RiskGroup, import('@/features/risk/lights').Light> = {
  finance: 'green', debt: 'green', tax: 'green', documents: 'green', operations: 'green',
}

test('A6: có đỏ (nhóm debt) → overall red', () => {
  expect(rollupOverall({ ...allGreen, debt: 'red' })).toBe('red')
})

test('A6: không đỏ, có vàng (documents) → overall yellow', () => {
  expect(rollupOverall({ ...allGreen, documents: 'yellow' })).toBe('yellow')
})

test('A6: tất cả xanh → overall green', () => {
  expect(rollupOverall(allGreen)).toBe('green')
})

test('A6: nhiều nhóm đỏ → vẫn red', () => {
  expect(rollupOverall({ ...allGreen, debt: 'red', tax: 'red' })).toBe('red')
})
