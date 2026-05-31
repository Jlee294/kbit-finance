import { test, expect } from 'vitest'
import { krwToVnd, fxGainLoss } from '@/features/expenses-kr/fx'

test('chi 1.000.000 KRW @ tỷ giá 18 = 18.000.000đ', () => {
  expect(krwToVnd(1_000_000, 18)).toBe(18_000_000)
})

test('ghi nợ NCC 1.000.000 KRW @18, trả @18,5 → lỗ 500.000đ', () => {
  expect(fxGainLoss(1_000_000, 18, 18.5)).toBe(-500_000) // âm = lỗ
})

test('tỷ giá giảm → lãi (dương)', () => {
  expect(fxGainLoss(1_000_000, 18.5, 18)).toBe(500_000)
})

test('tỷ giá không đổi → chênh lệch = 0', () => {
  expect(fxGainLoss(1_000_000, 18, 18)).toBe(0)
})

test('làm tròn VND đúng', () => {
  // 100 KRW × 18.123456 = 1812.3456 → làm tròn = 1812
  expect(krwToVnd(100, 18.123456)).toBe(1812)
})

test('chặn input phi lý', () => {
  expect(() => krwToVnd(0, 18)).toThrow()
  expect(() => krwToVnd(-1, 18)).toThrow()
  expect(() => krwToVnd(1_000_000, 0)).toThrow()
  expect(() => krwToVnd(1_000_000, -1)).toThrow()
  expect(() => fxGainLoss(0, 18, 18.5)).toThrow()
  expect(() => fxGainLoss(1_000_000, 0, 18.5)).toThrow()
  expect(() => fxGainLoss(1_000_000, 18, 0)).toThrow()
})
