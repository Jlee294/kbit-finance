import { describe, it, expect } from 'vitest'
import { computeLedger } from './ledger'

const Y0 = '2025-01-01', Y1 = '2025-12-31'

describe('computeLedger (Bảng tổng hợp công nợ)', () => {
  it('khớp mẫu Excel — KH Phương Anh: Nợ 9.900.000, Có 9.900.000, cuối kỳ 0', () => {
    const r = computeLedger(
      [{ order_date: '2025-03-10', total: 9_900_000, paid: 9_900_000 }],
      Y0, Y1,
    )
    expect(r.opening).toBe(0)
    expect(r.incurred).toBe(9_900_000)
    expect(r.settled).toBe(9_900_000)
    expect(r.closing).toBe(0)
  })

  it('khớp mẫu Excel — KH FIXX: Nợ 437.644.200, Có 164.664.000, cuối kỳ Nợ 272.980.200', () => {
    const r = computeLedger(
      [
        { order_date: '2025-02-01', total: 200_000_000, paid: 100_000_000 },
        { order_date: '2025-06-01', total: 237_644_200, paid: 64_664_000 },
      ],
      Y0, Y1,
    )
    expect(r.incurred).toBe(437_644_200)
    expect(r.settled).toBe(164_664_000)
    expect(r.closing).toBe(272_980_200)
  })

  it('số dư đầu kỳ mang sang từ đơn năm trước', () => {
    const r = computeLedger(
      [
        { order_date: '2024-11-01', total: 5_000_000, paid: 2_000_000 }, // đầu kỳ = 3tr
        { order_date: '2025-04-01', total: 1_000_000, paid: 0 },
      ],
      Y0, Y1,
    )
    expect(r.opening).toBe(3_000_000)
    expect(r.incurred).toBe(1_000_000)
    expect(r.settled).toBe(0)
    expect(r.closing).toBe(4_000_000)
  })

  it('thanh toán thừa → cuối kỳ âm (ghi sang cột đối ứng)', () => {
    const r = computeLedger(
      [{ order_date: '2025-05-01', total: 1_000_000, paid: 1_500_000 }],
      Y0, Y1,
    )
    expect(r.closing).toBe(-500_000)
  })

  it('bỏ qua đơn ở kỳ tương lai (order_date > yearEnd)', () => {
    const r = computeLedger(
      [{ order_date: '2026-01-05', total: 9_000_000, paid: 0 }],
      Y0, Y1,
    )
    expect(r).toEqual({ opening: 0, incurred: 0, settled: 0, closing: 0 })
  })
})
