import { describe, it, expect } from 'vitest'
import { formatLocalDate } from './format'

// FIX ngày lệch múi giờ: trước đây dùng new Date().toISOString().slice(0,10) = giờ UTC.
// VN là UTC+7 → nhập lúc 0–7h sáng bị ghi NGÀY HÔM TRƯỚC. formatLocalDate dùng
// timeZone 'Asia/Ho_Chi_Minh' để luôn ra đúng ngày theo giờ Việt Nam.
describe('formatLocalDate — ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh)', () => {
  it('06:30 sáng giờ VN (23:30 UTC hôm trước): KHÔNG bị lùi về hôm trước', () => {
    expect(formatLocalDate(new Date('2026-06-04T23:30:00Z'))).toBe('2026-06-05')
  })

  it('ban ngày (10:00 UTC = 17:00 VN): đúng ngày', () => {
    expect(formatLocalDate(new Date('2026-06-04T10:00:00Z'))).toBe('2026-06-04')
  })

  it('cuối ngày VN (16:59 UTC = 23:59 VN cùng ngày)', () => {
    expect(formatLocalDate(new Date('2026-06-04T16:59:00Z'))).toBe('2026-06-04')
  })

  it('đầu ngày VN (17:00 UTC = 00:00 VN hôm sau)', () => {
    expect(formatLocalDate(new Date('2026-06-04T17:00:00Z'))).toBe('2026-06-05')
  })

  it('khớp định dạng YYYY-MM-DD (tháng/ngày 2 chữ số)', () => {
    expect(formatLocalDate(new Date('2026-01-09T05:00:00Z'))).toBe('2026-01-09')
  })
})
