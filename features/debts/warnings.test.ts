import { describe, it, expect } from 'vitest'
import { hasOppositeBalance, depositNeedsAllocation } from './warnings'

// C — số dư bên ngược cần được trình bày đúng bản chất, không tự kết luận ghi trùng.
describe('C — số dư công nợ bên ngược', () => {
  it('closing < 0 → nhận diện số dư bên ngược', () => {
    expect(hasOppositeBalance({ closing: -2_000_000 })).toBe(true)
  })
  it('closing >= 0 → số dư bên thông thường', () => {
    expect(hasOppositeBalance({ closing: 0 })).toBe(false)
    expect(hasOppositeBalance({ closing: 6_000_000 })).toBe(false)
  })
})

// D — phiếu thu cọc chưa gắn đơn nhưng khách ĐANG có công nợ → nên gắn vào đơn.
describe('D — phiếu cọc chưa gắn khi khách đang nợ', () => {
  const ar = [
    { party_id: 'A', closing: 5_000_000 },
    { party_id: 'B', closing: 0 },
  ]
  it('khách có đơn nợ (closing > 0) → nhắc gắn vào đơn', () => {
    expect(depositNeedsAllocation({ customer_id: 'A' }, ar)).toBe(true)
  })
  it('khách hết nợ hoặc không có trong danh sách → không nhắc', () => {
    expect(depositNeedsAllocation({ customer_id: 'B' }, ar)).toBe(false)
    expect(depositNeedsAllocation({ customer_id: 'C' }, ar)).toBe(false)
  })
  it('phiếu cọc không gắn khách (customer_id null) → không nhắc', () => {
    expect(depositNeedsAllocation({ customer_id: null }, ar)).toBe(false)
  })
})
