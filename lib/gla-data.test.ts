import { describe, expect, it } from 'vitest'
import { GLA_DATA, getGlaSourceChecks } from './gla-data'

const sum = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0)

describe('GLA 6 tháng đầu năm 2026', () => {
  it('chỉ chứa một công ty GLA và đủ tám file nguồn, gồm SPNH', () => {
    expect(GLA_DATA.company.code).toBe('GLA')
    expect(GLA_DATA.company.taxCode).toBe('0315226378')
    expect(GLA_DATA.sourceFiles).toHaveLength(8)
  })

  it('khớp bảng kê bán ra và chỉ đưa hóa đơn có mã hàng vào nhật ký bán', () => {
    expect(GLA_DATA.salesInvoices).toHaveLength(19)
    expect(GLA_DATA.salesJournal).toHaveLength(17)
    expect(sum(GLA_DATA.salesInvoices, (row) => row.subtotal)).toBe(337_106_617)
    expect(sum(GLA_DATA.salesInvoices, (row) => row.vatAmount)).toBe(26_968_529)
    expect(sum(GLA_DATA.salesInvoices, (row) => row.grandTotal)).toBe(364_075_146)
    expect(sum(GLA_DATA.salesJournal, (row) => row.items.length)).toBe(120)
    expect(sum(GLA_DATA.salesJournal, (row) => sum(row.items, (item) => item.qty))).toBe(9_565)
    expect(sum(GLA_DATA.salesJournal, (row) => row.subtotal)).toBe(337_106_617)
    expect(GLA_DATA.salesJournal.every((row) => row.items.every((item) => item.productCode))).toBe(true)
  })

  it('khớp bảng kê mua vào và chỉ đưa nhóm có mã hàng vào nhật ký mua', () => {
    expect(GLA_DATA.purchaseInvoices).toHaveLength(49)
    expect(GLA_DATA.purchaseJournal).toHaveLength(15)
    expect(sum(GLA_DATA.purchaseInvoices, (row) => row.subtotal)).toBe(493_665_397)
    expect(sum(GLA_DATA.purchaseInvoices, (row) => row.vatAmount)).toBe(39_341_416)
    expect(sum(GLA_DATA.purchaseInvoices, (row) => row.grandTotal)).toBe(533_006_813)
    expect(sum(GLA_DATA.purchaseJournal, (row) => row.items.length)).toBe(37)
    expect(sum(GLA_DATA.purchaseJournal, (row) => sum(row.items, (item) => item.qty))).toBe(112_424)
    expect(sum(GLA_DATA.purchaseJournal, (row) => row.subtotal)).toBe(431_917_083)
  })

  it('khớp nhập-xuất-tồn và cân từng mã hàng', () => {
    expect(GLA_DATA.inventorySummary).toHaveLength(85)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.qtyOpen)).toBe(492_424)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.qtyIn)).toBe(112_424)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.qtyOut)).toBe(9_565)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.qtyClose)).toBe(595_283)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.valueOpen)).toBeCloseTo(2_032_775_766.2586827, 5)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.valueIn)).toBeCloseTo(431_917_083, 5)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.valueOut)).toBeCloseTo(172_215_123.0065818, 5)
    expect(sum(GLA_DATA.inventorySummary, (row) => row.valueClose)).toBeCloseTo(2_292_477_726.2521005, 5)
    expect(
      sum(GLA_DATA.inventorySummary, (row) => row.valueOut)
      - sum(GLA_DATA.sourceReferences.inventorySummary, (row) => row.valueOut),
    ).toBeCloseTo(506_694.4128496647, 5)

    for (const row of GLA_DATA.inventorySummary) {
      expect(row.qtyOpen + row.qtyIn - row.qtyOut - row.qtyClose).toBeCloseTo(0, 8)
      expect(row.valueOpen + row.valueIn - row.valueOut - row.valueClose).toBeCloseTo(0, 5)
    }
  })

  it('khớp công nợ phải thu/phải trả và công thức cuối kỳ', () => {
    expect(GLA_DATA.receivables).toHaveLength(7)
    expect(GLA_DATA.payables).toHaveLength(17)

    const ar = GLA_DATA.receivables
    expect(sum(ar, (row) => row.openingDebit)).toBe(150_687_432)
    expect(sum(ar, (row) => row.openingCredit)).toBe(18_944_555)
    expect(sum(ar, (row) => row.periodDebit)).toBe(354_175_146)
    expect(sum(ar, (row) => row.periodCredit)).toBe(247_970_646)
    expect(sum(ar, (row) => row.closingDebit)).toBe(256_891_932)
    expect(sum(ar, (row) => row.closingCredit)).toBe(18_944_555)

    const ap = GLA_DATA.payables
    expect(sum(ap, (row) => row.openingDebit)).toBe(10_200_000)
    expect(sum(ap, (row) => row.openingCredit)).toBe(1_753_511_919)
    expect(sum(ap, (row) => row.periodDebit)).toBe(369_994_022)
    expect(sum(ap, (row) => row.periodCredit)).toBe(515_395_751)
    expect(sum(ap, (row) => row.closingDebit)).toBe(10_201_422)
    expect(sum(ap, (row) => row.closingCredit)).toBe(1_898_915_070)

    for (const row of [...ar, ...ap]) {
      expect(
        row.openingDebit - row.openingCredit + row.periodDebit - row.periodCredit
          - row.closingDebit + row.closingCredit,
      ).toBeCloseTo(0, 8)
    }

    expect(ar.map((row) => row.partyCode)).toEqual(
      GLA_DATA.sourceReferences.receivables.map((row) => row.partyCode),
    )
    expect(ap.map((row) => row.partyCode)).toEqual(
      GLA_DATA.sourceReferences.payables.map((row) => row.partyCode),
    )
  })

  it('dùng đúng mã Quyên, lấy tiền từ SPNH và tính lãi lỗ không ghi doanh thu quà tặng', () => {
    const checks = getGlaSourceChecks()
    expect(checks.every((check) => check.status === 'pass')).toBe(true)

    const nonStockExpense =
      sum(GLA_DATA.purchaseInvoices, (row) => row.subtotal)
      - sum(GLA_DATA.purchaseJournal, (row) => row.subtotal)
    const cogs = sum(GLA_DATA.inventorySummary, (row) => row.valueOut)
    const revenue = sum(
      GLA_DATA.salesInvoices.filter((row) => row.recognizeRevenue),
      (row) => row.subtotal,
    )
    const profit = revenue - nonStockExpense - cogs

    expect(nonStockExpense).toBe(61_748_314)
    expect(profit).toBeCloseTo(93_976_512.99341819, 5)
    expect(GLA_DATA.salesInvoices.filter((row) => row.isGift)).toHaveLength(3)
    expect(GLA_DATA.bankTransactions).toHaveLength(48)
    expect(GLA_DATA.bankTransactions.filter((row) => row.affectsDebt)).toHaveLength(28)
    expect(GLA_DATA.bankAccount.openingBalance).toBe(198_445_880)
    expect(GLA_DATA.bankAccount.closingBalance).toBe(35_618_383)

    const productCodes = new Set(GLA_DATA.sourceReferences.inventorySummary.map((row) => row.code))
    expect(GLA_DATA.products.every((row) => productCodes.has(row.code))).toBe(true)
    expect(GLA_DATA.salesJournal.every(
      (order) => order.items.every((item) => productCodes.has(item.productCode)),
    )).toBe(true)
    expect(GLA_DATA.purchaseJournal.every(
      (order) => order.items.every((item) => productCodes.has(item.productCode)),
    )).toBe(true)
  })
})
