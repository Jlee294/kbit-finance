/**
 * tests/alerts.rules.test.ts
 *
 * Unit tests cho alert message formatting.
 * Không cần network — test các hàm pure trong alerts.ts.
 *
 * Dùng vi.spyOn để mock sendTelegram + sendEmail và xác nhận
 * dispatchAlert gọi đúng kênh với đúng content.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock các lib phụ thuộc ────────────────────────────────────────────────────
vi.mock('@/lib/notify', () => ({
  sendTelegram: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  txnApprovedHtml: vi.fn().mockReturnValue('<html>txn</html>'),
  taxDueSoonHtml:  vi.fn().mockReturnValue('<html>tax</html>'),
}))

import { dispatchAlert } from '@/features/integrations/alerts'
import { sendTelegram }  from '@/lib/notify'
import { sendEmail }     from '@/lib/email'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── txn_approved ──────────────────────────────────────────────────────────────

describe('dispatchAlert — txn_approved', () => {
  it('gọi sendTelegram với nội dung có "Thu tiền đã duyệt"', async () => {
    await dispatchAlert({
      type: 'txn_approved',
      kind: 'income',
      companyName: 'KBIT Corp',
      amount: 10_000_000,
      txnDate: '2025-06-01',
    })
    expect(sendTelegram).toHaveBeenCalledOnce()
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Thu tiền đã duyệt')
    expect(text).toContain('KBIT Corp')
  })

  it('gọi sendTelegram với "Chi phí đã duyệt" cho expense', async () => {
    await dispatchAlert({
      type: 'txn_approved',
      kind: 'expense',
      companyName: 'KBIT Corp',
      amount: 5_000_000,
      txnDate: '2025-06-02',
    })
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Chi phí đã duyệt')
  })

  it('gửi email nếu ALERT_EMAIL_RECIPIENTS được set', async () => {
    vi.stubEnv('ALERT_EMAIL_RECIPIENTS', 'test@kbit.com')
    await dispatchAlert({
      type: 'txn_approved',
      kind: 'income',
      companyName: 'KBIT',
      amount: 1_000,
      txnDate: '2025-01-01',
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    vi.unstubAllEnvs()
  })

  it('KHÔNG gửi email nếu ALERT_EMAIL_RECIPIENTS không set', async () => {
    vi.stubEnv('ALERT_EMAIL_RECIPIENTS', '')
    await dispatchAlert({
      type: 'txn_approved',
      kind: 'income',
      companyName: 'KBIT',
      amount: 1_000,
      txnDate: '2025-01-01',
    })
    expect(sendEmail).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('bao gồm ghi chú khi có note', async () => {
    await dispatchAlert({
      type: 'txn_approved',
      kind: 'income',
      companyName: 'X',
      amount: 100,
      txnDate: '2025-01-01',
      note: 'Thanh toán hợp đồng 001',
    })
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Thanh toán hợp đồng 001')
  })
})

// ── tax_due_soon ──────────────────────────────────────────────────────────────

describe('dispatchAlert — tax_due_soon', () => {
  it('gọi sendTelegram với nội dung có "Thuế đến hạn sớm"', async () => {
    await dispatchAlert({
      type: 'tax_due_soon',
      companyName: 'KBIT',
      items: [{ tax_type: 'VAT', period: '2025-05', due_date: '2025-06-20' }],
    })
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Thuế đến hạn sớm')
    expect(text).toContain('VAT')
    expect(text).toContain('2025-06-20')
  })

  it('gửi email cho tax_due_soon nếu recipients có', async () => {
    vi.stubEnv('ALERT_EMAIL_RECIPIENTS', 'cfo@kbit.com')
    await dispatchAlert({
      type: 'tax_due_soon',
      companyName: 'KBIT',
      items: [{ tax_type: 'CIT', period: '2025-Q1', due_date: '2025-04-30' }],
    })
    expect(sendEmail).toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

// ── risk_red ──────────────────────────────────────────────────────────────────

describe('dispatchAlert — risk_red', () => {
  it('gọi sendTelegram với "Cảnh báo rủi ro tài chính"', async () => {
    await dispatchAlert({
      type: 'risk_red',
      companyName: 'KBIT',
      indicators: ['Công nợ KH quá hạn', 'Dòng tiền thuần âm'],
    })
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Cảnh báo rủi ro tài chính')
    expect(text).toContain('Công nợ KH quá hạn')
  })

  it('KHÔNG gửi email cho risk_red', async () => {
    vi.stubEnv('ALERT_EMAIL_RECIPIENTS', 'cfo@kbit.com')
    await dispatchAlert({
      type: 'risk_red',
      companyName: 'KBIT',
      indicators: ['Chỉ tiêu X'],
    })
    expect(sendEmail).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

// ── sheetsync_done ────────────────────────────────────────────────────────────

describe('dispatchAlert — sheetsync_done', () => {
  it('gọi sendTelegram với số liệu sync', async () => {
    await dispatchAlert({ type: 'sheetsync_done', incomeCount: 12, expenseCount: 5 })
    const text = vi.mocked(sendTelegram).mock.calls[0][0]
    expect(text).toContain('Google Sheets đã đồng bộ')
    expect(text).toContain('12')
    expect(text).toContain('5')
  })
})
