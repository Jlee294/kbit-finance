import { test, expect } from 'vitest'
import { orderDateToMMYY, orderCodePrefix, buildOrderCode } from '@/features/orders/order-code'

test('MMYY lấy theo order_date, không theo ngày hệ thống', () => {
  expect(orderDateToMMYY('2026-05-15')).toBe('0526')
  expect(orderDateToMMYY('2026-12-01')).toBe('1226')
})

test('prefix theo khách + tháng', () => {
  expect(orderCodePrefix('FEMI', '2026-05-15')).toBe('FEMI-0526-')
})

test('mã đơn FEMI tháng 5/2026: số thứ tự 1->01, 2->02', () => {
  expect(buildOrderCode('FEMI', '2026-05-15', 1)).toBe('FEMI-0526-01')
  expect(buildOrderCode('FEMI', '2026-05-20', 2)).toBe('FEMI-0526-02')
})

test('số thứ tự >= 10 vẫn đúng', () => {
  expect(buildOrderCode('FEMI', '2026-05-01', 10)).toBe('FEMI-0526-10')
})
