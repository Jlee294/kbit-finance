import { describe, it, expect } from 'vitest'
import { computePeriodCost, summarizeGrossProfit } from './avg-cost'

describe('computePeriodCost — bình quân gia quyền cuối kỳ', () => {
  it('ví dụ chuẩn: đầu 100@10, nhập 50@16, xuất 120', () => {
    const r = computePeriodCost({ qtyOpen: 100, valueOpen: 1000, qtyIn: 50, valueIn: 800, qtyOut: 120 })
    expect(r.avgUnitCost).toBe(12)       // (1000+800)/(100+50)
    expect(r.valueOut).toBe(1440)        // 120*12
    expect(r.qtyClose).toBe(30)
    expect(r.valueClose).toBe(360)       // 1000+800-1440
  })

  it('không có tồn đầu, chỉ nhập rồi xuất hết', () => {
    const r = computePeriodCost({ qtyOpen: 0, valueOpen: 0, qtyIn: 10, valueIn: 1000, qtyOut: 10 })
    expect(r.avgUnitCost).toBe(100)
    expect(r.valueOut).toBe(1000)
    expect(r.qtyClose).toBe(0)
    expect(r.valueClose).toBe(0)
  })

  it('không phát sinh nhập/xuất → BQ = giá trị đầu / SL đầu, tồn cuối = tồn đầu', () => {
    const r = computePeriodCost({ qtyOpen: 20, valueOpen: 240, qtyIn: 0, valueIn: 0, qtyOut: 0 })
    expect(r.avgUnitCost).toBe(12)
    expect(r.valueClose).toBe(240)
    expect(r.qtyClose).toBe(20)
  })

  it('tổng SL khả dụng = 0 → BQ = 0 (tránh chia 0)', () => {
    const r = computePeriodCost({ qtyOpen: 0, valueOpen: 0, qtyIn: 0, valueIn: 0, qtyOut: 0 })
    expect(r.avgUnitCost).toBe(0)
    expect(r.valueOut).toBe(0)
  })

  it('tồn âm: đầu 10@10, xuất 15 → tồn cuối âm, vẫn theo BQ', () => {
    const r = computePeriodCost({ qtyOpen: 10, valueOpen: 100, qtyIn: 0, valueIn: 0, qtyOut: 15 })
    expect(r.avgUnitCost).toBe(10)
    expect(r.valueOut).toBe(150)
    expect(r.qtyClose).toBe(-5)
    expect(r.valueClose).toBe(-50)
  })
})

describe('summarizeGrossProfit — lãi gộp 3 mức', () => {
  it('gộp 2 mã / 2 đơn: tổng + nhóm đúng', () => {
    const s = summarizeGrossProfit([
      { product_id: 'A', qty: 10, unit_price: 20, cost_price: 12, product_code: 'A1', product_name: 'Áo', order_code: 'D1' },
      { product_id: 'B', qty: 5,  unit_price: 30, cost_price: 10, product_code: 'B1', product_name: 'Quần', order_code: 'D2' },
    ])
    expect(s.total.revenue).toBe(350)   // 200 + 150
    expect(s.total.cogs).toBe(170)      // 120 + 50
    expect(s.total.profit).toBe(180)
    expect(s.byProduct).toHaveLength(2)
    expect(s.byOrder).toHaveLength(2)
    expect(s.byProduct.find(x => x.key === 'A')!.profit).toBe(80)  // 200-120
  })

  it('cùng đơn 2 dòng → gộp 1 dòng byOrder', () => {
    const s = summarizeGrossProfit([
      { product_id: 'A', qty: 1, unit_price: 100, cost_price: 60, order_code: 'D1' },
      { product_id: 'B', qty: 1, unit_price: 50,  cost_price: 20, order_code: 'D1' },
    ])
    expect(s.byOrder).toHaveLength(1)
    expect(s.byOrder[0].profit).toBe(70)   // (100-60)+(50-20)
  })

  it('cost_price null → cogs = 0', () => {
    const s = summarizeGrossProfit([{ product_id: 'A', qty: 1, unit_price: 100, cost_price: null }])
    expect(s.total.cogs).toBe(0)
    expect(s.total.profit).toBe(100)
  })
})
