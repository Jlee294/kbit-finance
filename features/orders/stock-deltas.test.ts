import { describe, it, expect } from 'vitest'
import { computeStockDeltas } from './stock-deltas'

const W1 = 'wh-1'
const W2 = 'wh-2'
const A = 'prod-a'
const B = 'prod-b'

describe('computeStockDeltas — điều chỉnh tồn khi sửa đơn đã trừ kho', () => {
  it('cùng kho, giảm số lượng → hoàn vào kho (delta > 0)', () => {
    expect(computeStockDeltas([{ product_id: A, qty: 10 }], [{ product_id: A, qty: 5 }], W1, W1))
      .toEqual([{ warehouse_id: W1, product_id: A, delta: 5 }])
  })

  it('cùng kho, tăng số lượng → trừ thêm kho (delta < 0)', () => {
    expect(computeStockDeltas([{ product_id: A, qty: 5 }], [{ product_id: A, qty: 10 }], W1, W1))
      .toEqual([{ warehouse_id: W1, product_id: A, delta: -5 }])
  })

  it('cùng kho, không đổi → không điều chỉnh', () => {
    expect(computeStockDeltas([{ product_id: A, qty: 10 }], [{ product_id: A, qty: 10 }], W1, W1))
      .toEqual([])
  })

  it('cùng kho, đổi mã hàng → hoàn A, trừ B', () => {
    const r = computeStockDeltas([{ product_id: A, qty: 10 }], [{ product_id: B, qty: 8 }], W1, W1)
    expect(r).toContainEqual({ warehouse_id: W1, product_id: A, delta: 10 })
    expect(r).toContainEqual({ warehouse_id: W1, product_id: B, delta: -8 })
    expect(r).toHaveLength(2)
  })

  it('gộp dòng trùng mã hàng trước khi tính', () => {
    expect(computeStockDeltas(
      [{ product_id: A, qty: 5 }, { product_id: A, qty: 5 }],
      [{ product_id: A, qty: 8 }], W1, W1,
    )).toEqual([{ warehouse_id: W1, product_id: A, delta: 2 }])
  })

  it('đổi kho → hoàn hết kho cũ, trừ hết kho mới', () => {
    const r = computeStockDeltas([{ product_id: A, qty: 10 }], [{ product_id: A, qty: 10 }], W1, W2)
    expect(r).toContainEqual({ warehouse_id: W1, product_id: A, delta: 10 })
    expect(r).toContainEqual({ warehouse_id: W2, product_id: A, delta: -10 })
    expect(r).toHaveLength(2)
  })

  it('bỏ chọn kho (kho mới = null) → chỉ hoàn hết kho cũ', () => {
    expect(computeStockDeltas([{ product_id: A, qty: 10 }], [{ product_id: A, qty: 10 }], W1, null))
      .toEqual([{ warehouse_id: W1, product_id: A, delta: 10 }])
  })

  it('bỏ qua dòng không có mã hàng (product_id null)', () => {
    expect(computeStockDeltas(
      [{ product_id: null, qty: 3 }, { product_id: A, qty: 10 }],
      [{ product_id: A, qty: 10 }, { product_id: null, qty: 99 }], W1, W1,
    )).toEqual([])
  })
})
