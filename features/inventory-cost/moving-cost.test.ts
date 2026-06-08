import { describe, it, expect } from 'vitest'
import { applyReceipt, applyIssue, type MovingState } from './moving-cost'

describe('applyReceipt — bình quân liên hoàn khi nhập', () => {
  it('lần đầu (tồn 0): avg = giá lô', () => {
    const r = applyReceipt({ qty: 0, avg: 0 }, 10, 100)
    expect(r.state).toEqual({ qty: 10, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
  it('nhập lô thứ hai: bình quân lại (10@100 + 10@120 → 110)', () => {
    const r = applyReceipt({ qty: 10, avg: 100 }, 10, 120)
    expect(r.state).toEqual({ qty: 20, avg: 110 })
    expect(r.lineUnitCost).toBe(120)
  })
  it('nhập lô thứ ba sau khi xuất (15@110 + 5@140 → 117.5)', () => {
    const r = applyReceipt({ qty: 15, avg: 110 }, 5, 140)
    expect(r.state).toEqual({ qty: 20, avg: 117.5 })
  })
  it('không nhập đơn giá → dùng avg hiện hành (BQ không đổi)', () => {
    const r = applyReceipt({ qty: 10, avg: 100 }, 10, null)
    expect(r.state).toEqual({ qty: 20, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
  it('tồn ≤ 0 (kho âm) → lấy giá lô mới làm avg', () => {
    const r = applyReceipt({ qty: -5, avg: 100 }, 10, 200)
    expect(r.state).toEqual({ qty: 5, avg: 200 })
  })
})

describe('applyIssue — xuất theo avg hiện hành', () => {
  it('xuất lấy avg hiện hành, avg KHÔNG đổi', () => {
    const r = applyIssue({ qty: 20, avg: 110 }, 5)
    expect(r.state).toEqual({ qty: 15, avg: 110 })
    expect(r.lineUnitCost).toBe(110)
  })
  it('xuất quá tồn → qty âm, avg giữ nguyên', () => {
    const r = applyIssue({ qty: 10, avg: 100 }, 15)
    expect(r.state).toEqual({ qty: -5, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
})
