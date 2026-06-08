import { describe, it, expect } from 'vitest'
import { cashEntryToLedgerSource, computeLedger } from './ledger'

describe('cashEntryToLedgerSource (Chứng từ khác → Công nợ)', () => {
  it('KH (AR) Thu → giảm phải thu (paid)', () => {
    expect(cashEntryToLedgerSource({ txn_date: '2025-05-01', so_tien: 1_000_000, direction: 'thu' }, 'AR'))
      .toEqual({ order_date: '2025-05-01', total: 0, paid: 1_000_000 })
  })
  it('KH (AR) Chi → tăng phải thu (total)', () => {
    expect(cashEntryToLedgerSource({ txn_date: '2025-05-01', so_tien: 1_000_000, direction: 'chi' }, 'AR'))
      .toEqual({ order_date: '2025-05-01', total: 1_000_000, paid: 0 })
  })
  it('NCC (AP) Chi → giảm phải trả (paid)', () => {
    expect(cashEntryToLedgerSource({ txn_date: '2025-05-01', so_tien: 2_000_000, direction: 'chi' }, 'AP'))
      .toEqual({ order_date: '2025-05-01', total: 0, paid: 2_000_000 })
  })
  it('NCC (AP) Thu → tăng phải trả (total)', () => {
    expect(cashEntryToLedgerSource({ txn_date: '2025-05-01', so_tien: 2_000_000, direction: 'thu' }, 'AP'))
      .toEqual({ order_date: '2025-05-01', total: 2_000_000, paid: 0 })
  })

  it('gộp với computeLedger: KH có 1 đơn bán 10tr + thu tiền mặt CTK 4tr → còn nợ 6tr', () => {
    const sources = [
      { order_date: '2025-02-01', total: 10_000_000, paid: 0 }, // đơn bán
      cashEntryToLedgerSource({ txn_date: '2025-03-01', so_tien: 4_000_000, direction: 'thu' }, 'AR'),
    ]
    const r = computeLedger(sources, '2025-01-01', '2025-12-31')
    expect(r.incurred).toBe(10_000_000)
    expect(r.settled).toBe(4_000_000)
    expect(r.closing).toBe(6_000_000)
  })
})
