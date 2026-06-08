import { describe, it, expect } from 'vitest'
import { shouldDeductOrderStock } from './stock-sync'

// Điều kiện trừ kho đơn bán (1 nguồn sự thật cho create/update/đổi-trạng-thái):
//   trừ ⇔ chưa trừ & KHÔNG nháp & có dòng mã hàng & có kho & (đơn mới HOẶC vừa rời Nháp).
const base = { fulfillmentStatus: 'confirmed', stockDeducted: false, hasItemWithProduct: true, hasWarehouse: true, cameFromDraftOrNew: true }

describe('shouldDeductOrderStock', () => {
  it('đủ điều kiện (confirmed, chưa trừ, có mã hàng, có kho, đơn mới) → trừ', () => {
    expect(shouldDeductOrderStock(base)).toBe(true)
  })
  it('REGRESSION: đơn cũ "không trừ kho" (đã non-draft, chưa trừ) → KHÔNG trừ hồi tố', () => {
    expect(shouldDeductOrderStock({ ...base, cameFromDraftOrNew: false })).toBe(false)
  })
  it('đơn Nháp → KHÔNG trừ', () => {
    expect(shouldDeductOrderStock({ ...base, fulfillmentStatus: 'draft' })).toBe(false)
  })
  it('đã trừ rồi → KHÔNG trừ lại', () => {
    expect(shouldDeductOrderStock({ ...base, stockDeducted: true })).toBe(false)
  })
  it('không có dòng mã hàng (chỉ dịch vụ/phí) → KHÔNG trừ', () => {
    expect(shouldDeductOrderStock({ ...base, hasItemWithProduct: false })).toBe(false)
  })
  it('không có kho (công ty chưa có kho) → KHÔNG trừ', () => {
    expect(shouldDeductOrderStock({ ...base, hasWarehouse: false })).toBe(false)
  })
  it('trạng thái sau Nháp (awaiting_goods, delivered) vẫn trừ nếu chưa trừ', () => {
    expect(shouldDeductOrderStock({ ...base, fulfillmentStatus: 'awaiting_goods' })).toBe(true)
    expect(shouldDeductOrderStock({ ...base, fulfillmentStatus: 'delivered' })).toBe(true)
  })
})
