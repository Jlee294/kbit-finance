import { describe, expect, it } from 'vitest'
import { bankOpeningSchema } from './schema'
import { calculateBankSummary } from './summary'

describe('số dư đầu kỳ ngân hàng', () => {
  it('tính đầu kỳ của khoảng lọc từ khai báo năm và giao dịch trước khoảng', () => {
    const result = calculateBankSummary({
      declaredOpening: 1_000,
      year: 2026,
      from: '2026-03-01',
      to: '2026-03-31',
      movements: [
        { txnDate: '2025-12-31', direction: 'thu', amount: 999 },
        { txnDate: '2026-01-15', direction: 'thu', amount: 500 },
        { txnDate: '2026-02-20', direction: 'chi', amount: 100 },
        { txnDate: '2026-03-10', direction: 'thu', amount: 300 },
        { txnDate: '2026-03-20', direction: 'chi', amount: 250 },
        { txnDate: '2026-04-01', direction: 'thu', amount: 777 },
      ],
    })

    expect(result).toEqual({
      declaredOpening: 1_000,
      opening: 1_400,
      receipts: 300,
      payments: 250,
      closing: 1_450,
    })
  })

  it('cho phép số dư âm khi tài khoản ngân hàng bị thấu chi', () => {
    const parsed = bankOpeningSchema.parse({
      company_id: '11111111-1111-4111-8111-111111111111',
      bank_account_id: '22222222-2222-4222-8222-222222222222',
      year: '2026',
      amount: '-500000',
      note: 'Thấu chi đầu năm',
    })
    expect(parsed.amount).toBe(-500_000)
    expect(parsed.year).toBe(2026)
  })

  it('từ chối năm và mã tài khoản không hợp lệ', () => {
    expect(() => bankOpeningSchema.parse({
      company_id: 'khong-phai-uuid',
      bank_account_id: 'sai',
      year: 1900,
      amount: 0,
    })).toThrow()
  })
})
