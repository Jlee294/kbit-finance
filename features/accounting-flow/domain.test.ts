import { describe, expect, it } from 'vitest'
import {
  classifySalesDocument,
  comparePostingEvents,
  computeCashBalance,
  openingDebtNet,
} from './domain'

describe('classifySalesDocument', () => {
  it('quà tặng có mã hàng: kê thuế, vào nhật ký và xuất kho nhưng không có doanh thu/công nợ', () => {
    expect(classifySalesDocument({ isGift: true, hasStockItems: true })).toEqual({
      includeInTaxListing: true,
      includeInInventoryJournal: true,
      recognizeRevenue: false,
      createReceivable: false,
      postInventory: true,
      recognizeCogs: true,
    })
  })

  it('quà tặng dịch vụ: kê thuế nhưng không chạy kho', () => {
    expect(classifySalesDocument({ isGift: true, hasStockItems: false })).toEqual({
      includeInTaxListing: true,
      includeInInventoryJournal: false,
      recognizeRevenue: false,
      createReceivable: false,
      postInventory: false,
      recognizeCogs: false,
    })
  })

  it('bán hàng thông thường có mã hàng: ghi doanh thu, công nợ và kho', () => {
    expect(classifySalesDocument({ isGift: false, hasStockItems: true })).toEqual({
      includeInTaxListing: true,
      includeInInventoryJournal: true,
      recognizeRevenue: true,
      createReceivable: true,
      postInventory: true,
      recognizeCogs: true,
    })
  })
})

describe('openingDebtNet', () => {
  it('phải thu lấy Nợ trừ Có', () => {
    expect(openingDebtNet('customer', 10_000_000, 2_000_000)).toBe(8_000_000)
  })

  it('phải trả lấy Có trừ Nợ', () => {
    expect(openingDebtNet('supplier', 2_000_000, 10_000_000)).toBe(8_000_000)
  })
})

describe('comparePostingEvents', () => {
  it('cùng ngày thì tồn đầu trước, nhập trước và xuất sau', () => {
    const events = [
      { date: '2026-01-02', kind: 'issue' as const, sourceIndex: 0 },
      { date: '2026-01-02', kind: 'receipt' as const, sourceIndex: 1 },
      { date: '2026-01-02', kind: 'opening' as const, sourceIndex: 2 },
    ]
    expect([...events].sort(comparePostingEvents).map((event) => event.kind))
      .toEqual(['opening', 'receipt', 'issue'])
  })

  it('ưu tiên ngày trước, sau đó giữ thứ tự nguồn trong cùng loại', () => {
    const events = [
      { date: '2026-01-03', kind: 'receipt' as const, sourceIndex: 0 },
      { date: '2026-01-02', kind: 'receipt' as const, sourceIndex: 4 },
      { date: '2026-01-02', kind: 'receipt' as const, sourceIndex: 2 },
    ]
    expect([...events].sort(comparePostingEvents).map((event) => event.sourceIndex))
      .toEqual([2, 4, 0])
  })
})

describe('computeCashBalance', () => {
  it('cuối kỳ bằng đầu kỳ cộng thu trừ chi', () => {
    expect(computeCashBalance(20_000_000, 7_000_000, 4_500_000)).toBe(22_500_000)
  })
})
