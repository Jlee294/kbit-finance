import { describe, it, expect } from 'vitest'
import { computePurchaseInvoiceTotals } from './purchase-total'

describe('computePurchaseInvoiceTotals (Bảng kê mua vào)', () => {
  it('đơn VND: grand_total = tiền hàng + VAT', () => {
    const r = computePurchaseInvoiceTotals({
      goods_value: 10_000_000, vat_import: 0, vat_amount: 1_000_000,
      currency: 'VND', exchange_rate: null,
    })
    expect(r.subtotal).toBe(10_000_000)
    expect(r.vat_amount).toBe(1_000_000)
    expect(r.grand_total).toBe(11_000_000)
  })

  it('đơn VND không nhập vat_amount → dùng vat_import', () => {
    const r = computePurchaseInvoiceTotals({
      goods_value: 5_000_000, vat_import: 400_000, vat_amount: null,
      currency: 'VND', exchange_rate: null,
    })
    expect(r.vat_amount).toBe(400_000)
    expect(r.grand_total).toBe(5_400_000)
  })

  it('đơn KRW: quy đổi VND theo tỷ giá', () => {
    const r = computePurchaseInvoiceTotals({
      goods_value: 1000, vat_import: 100, vat_amount: null,
      currency: 'KRW', exchange_rate: 18,
    })
    expect(r.subtotal).toBe(18_000)
    expect(r.vat_amount).toBe(1_800)
    expect(r.grand_total).toBe(19_800)
  })

  it('thiếu dữ liệu → 0, không vỡ', () => {
    const r = computePurchaseInvoiceTotals({
      goods_value: null, vat_import: null, vat_amount: null,
      currency: null, exchange_rate: null,
    })
    expect(r).toEqual({ subtotal: 0, vat_amount: 0, grand_total: 0 })
  })
})
