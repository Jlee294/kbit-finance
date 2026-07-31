import { describe, expect, it } from 'vitest'
import { calculateProfitLoss } from './profit-loss'

describe('báo cáo lãi lỗ', () => {
  it('không ghi doanh thu quà tặng nhưng vẫn giữ giá vốn xuất kho', () => {
    const result = calculateProfitLoss({
      recognizedRevenue: 1_000,
      giftDeclaredValue: 300,
      cogs: 450,
      purchases: [],
    })
    expect(result.revenue).toBe(1_000)
    expect(result.giftDeclaredValue).toBe(300)
    expect(result.cogs).toBe(450)
    expect(result.profit).toBe(550)
  })

  it('chỉ đưa chi phí trong kỳ vào lãi lỗ, không đưa hàng tồn kho và tài sản chờ phân bổ', () => {
    const result = calculateProfitLoss({
      recognizedRevenue: 10_000,
      giftDeclaredValue: 0,
      cogs: 3_000,
      purchases: [
        { amount: 4_000, treatment: 'inventory' },
        { amount: 700, treatment: 'expense' },
        { amount: 100, treatment: 'tax_fee' },
        { amount: 200, treatment: 'contract_penalty' },
        { amount: 500, treatment: 'prepaid' },
        { amount: 600, treatment: 'tool' },
        { amount: 1_000, treatment: 'fixed_asset' },
        { amount: 300, treatment: 'pass_through' },
      ],
    })
    expect(result.operatingExpenses).toBe(1_000)
    expect(result.profit).toBe(6_000)
    expect(result.inventoryPurchases).toBe(4_000)
    expect(result.prepaid).toBe(500)
    expect(result.tools).toBe(600)
    expect(result.fixedAssets).toBe(1_000)
    expect(result.passThrough).toBe(300)
  })
})
