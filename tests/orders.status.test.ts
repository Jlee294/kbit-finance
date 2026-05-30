import { test, expect } from 'vitest'
import { derivePaymentStatus, computeGrandTotal } from '@/features/orders/status'

test('chưa thu -> unpaid', () => {
  expect(derivePaymentStatus(100_000_000, 0)).toBe('unpaid')
})
test('thu một phần -> partial', () => {
  expect(derivePaymentStatus(100_000_000, 40_000_000)).toBe('partial')
})
test('thu đủ/dư -> paid', () => {
  expect(derivePaymentStatus(100_000_000, 100_000_000)).toBe('paid')
  expect(derivePaymentStatus(100_000_000, 120_000_000)).toBe('paid')
})
test('đơn 0đ -> unpaid', () => {
  expect(derivePaymentStatus(0, 0)).toBe('unpaid')
})
test('tổng tiền = tổng các dòng', () => {
  expect(computeGrandTotal([{ qty: 2, unit_price: 50_000_000 }, { qty: 1, unit_price: 0 }])).toBe(100_000_000)
})
