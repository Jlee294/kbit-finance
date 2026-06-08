import { describe, it, expect } from 'vitest'
import { pickLatestPeriod } from './avg-cost'

describe('pickLatestPeriod — kỳ mặc định trang Lãi gộp', () => {
  it('rỗng → null', () => {
    expect(pickLatestPeriod([])).toBeNull()
  })
  it('chỉ toàn ngày trống/không hợp lệ → null', () => {
    expect(pickLatestPeriod(['', null, undefined, 'abc'])).toBeNull()
  })
  it('chọn kỳ LỚN NHẤT, không phụ thuộc thứ tự', () => {
    expect(pickLatestPeriod(['2026-01-15', '2026-03-02', '2026-02-20'])).toBe('2026-03')
  })
  it('1 ngày → đúng kỳ của ngày đó', () => {
    expect(pickLatestPeriod(['2026-01-15'])).toBe('2026-01')
  })
  it('bỏ qua ngày trống, lấy kỳ của ngày hợp lệ', () => {
    expect(pickLatestPeriod(['', '2026-05-01'])).toBe('2026-05')
  })
  it('so sánh đúng qua ranh giới năm', () => {
    expect(pickLatestPeriod(['2025-12-31', '2026-01-01'])).toBe('2026-01')
  })
})
