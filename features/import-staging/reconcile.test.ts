import { describe, expect, it } from 'vitest'
import {
  buildInvoiceKey,
  normalizeHeader,
  reconcileInvoiceJournal,
} from './reconcile'

describe('normalizeHeader', () => {
  it('chuẩn hóa dấu, khoảng trắng và ký hiệu để nhận diện cột linh hoạt', () => {
    expect(normalizeHeader('  Mã HH, DV,TP ')).toBe('ma hh dv tp')
    expect(normalizeHeader('Số dư đầu kỳ (Nợ)')).toBe('so du dau ky no')
  })
})

describe('buildInvoiceKey', () => {
  it('chuẩn hóa số hóa đơn nhưng giữ ngày làm một phần khóa', () => {
    expect(buildInvoiceKey({ invoiceNo: '000001', invoiceDate: '2026-01-17' }))
      .toBe('1|2026-01-17')
  })
})

describe('reconcileInvoiceJournal', () => {
  it('chấp nhận nhật ký là tập con của bảng kê', () => {
    const result = reconcileInvoiceJournal(
      [
        { invoiceNo: '1', invoiceDate: '2026-01-17', amount: 10_000_000 },
        { invoiceNo: '2', invoiceDate: '2026-01-18', amount: 5_000_000 },
      ],
      [
        { invoiceNo: '1', invoiceDate: '2026-01-17', productCode: 'MH01', amount: 10_000_000 },
      ],
    )

    expect(result.ok).toBe(true)
    expect(result.listingCount).toBe(2)
    expect(result.journalInvoiceCount).toBe(1)
    expect(result.errors).toEqual([])
  })

  it('chặn dòng nhật ký không có hóa đơn trong bảng kê', () => {
    const result = reconcileInvoiceJournal(
      [{ invoiceNo: '1', invoiceDate: '2026-01-17', amount: 10_000_000 }],
      [{ invoiceNo: '9', invoiceDate: '2026-01-19', productCode: 'MH09', amount: 1_000_000 }],
    )

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatchObject({
      code: 'JOURNAL_WITHOUT_INVOICE',
      invoiceKey: '9|2026-01-19',
    })
  })

  it('chặn hóa đơn trùng trong bảng kê', () => {
    const result = reconcileInvoiceJournal(
      [
        { invoiceNo: '1', invoiceDate: '2026-01-17', amount: 10_000_000 },
        { invoiceNo: '000001', invoiceDate: '2026-01-17', amount: 10_000_000 },
      ],
      [],
    )

    expect(result.ok).toBe(false)
    expect(result.errors[0].code).toBe('DUPLICATE_INVOICE')
  })
})
