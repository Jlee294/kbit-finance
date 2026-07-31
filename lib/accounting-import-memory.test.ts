import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('bộ nhớ bắt buộc cho AI khi import dữ liệu kế toán', () => {
  const instructions = readFileSync(path.resolve(process.cwd(), 'AGENTS.md'), 'utf8')

  it('buộc AI đọc và tuân thủ đúng trình tự nhập liệu', () => {
    expect(instructions).toContain('## KBIT accounting import operating memory')
    expect(instructions).toContain('Tồn kho và công nợ đầu kỳ')
    expect(instructions).toContain('Bảng kê bán ra + Nhật ký bán hàng')
    expect(instructions).toContain('Bảng kê mua vào + Nhật ký mua hàng')
    expect(instructions).toContain('SPNH và sổ tiền mặt')
  })

  it('cấm chép số cuối kỳ hoặc tự tạo bút toán bù để ép khớp', () => {
    expect(instructions).toContain('không được chép số phát sinh hoặc số cuối kỳ')
    expect(instructions).toContain('không tạo bút toán bù')
    expect(instructions).toContain('0 chênh lệch chưa giải trình')
  })

  it('giữ đúng nguồn hình thành NXT, công nợ và giá vốn', () => {
    expect(instructions).toContain('Nhật ký mua hàng → Nhập NXT')
    expect(instructions).toContain('Nhật ký bán hàng → Xuất NXT')
    expect(instructions).toContain('bình quân liên hoàn')
    expect(instructions).toContain('Bảng kê bán ra → Phát sinh Nợ phải thu')
    expect(instructions).toContain('Bảng kê mua vào → Phát sinh Có phải trả')
  })

  it('không cho AI tự sáng tạo mã trong bộ file Quyên', () => {
    expect(instructions).toContain('giữ nguyên chính xác mã hàng và mã công nợ từ file nguồn')
    expect(instructions).toContain('dừng import và báo thiếu mapping')
  })

  it('chỉ đúng nơi lưu số dư đầu kỳ ngân hàng, không tạo giao dịch giả', () => {
    expect(instructions).toContain('bank_opening_balances')
    expect(instructions).toContain('Số dư đầu kỳ ngân hàng')
    expect(instructions).toContain('never manufacture an income/expense row')
  })
})
