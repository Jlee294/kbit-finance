import { describe, expect, it } from 'vitest'
import { calculateLandedCostVnd, allocateLandedCost } from './landed-cost'

describe('calculateLandedCostVnd', () => {
  it('quy đổi riêng từng khoản và loại VAT nhập khẩu được khấu trừ', () => {
    const result = calculateLandedCostVnd([
      { kind: 'goods', amount: 1_000_000, exchangeRate: 18, capitalizable: true },
      { kind: 'import_duty', amount: 10_000_000, exchangeRate: 1, capitalizable: true },
      { kind: 'freight', amount: 2_000_000, exchangeRate: 1, capitalizable: true },
      { kind: 'import_vat', amount: 11_000_000, exchangeRate: 1, capitalizable: false },
    ])

    expect(result).toEqual({
      landedCostVnd: 30_000_000,
      recoverableTaxVnd: 11_000_000,
      payableVnd: 41_000_000,
    })
  })
})

describe('allocateLandedCost', () => {
  it('phân bổ đúng tổng giá nhập kho theo tỷ trọng tiền hàng', () => {
    const result = allocateLandedCost([
      { quantity: 100, goodsValueVnd: 30_000_000 },
      { quantity: 100, goodsValueVnd: 10_000_000 },
    ], 48_000_000)

    expect(result).toEqual([
      { allocatedValueVnd: 36_000_000, unitCostVnd: 360_000 },
      { allocatedValueVnd: 12_000_000, unitCostVnd: 120_000 },
    ])
    expect(result.reduce((sum, row) => sum + row.allocatedValueVnd, 0)).toBe(48_000_000)
  })
})
