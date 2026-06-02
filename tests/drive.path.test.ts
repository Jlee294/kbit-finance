/**
 * tests/drive.path.test.ts
 *
 * Unit tests cho buildFolderPath() — hàm pure, không I/O.
 * Cấu trúc 5 segments: [company, year, "Tháng MM", project, category]
 */

import { describe, it, expect } from 'vitest'
import { buildFolderPath } from '@/lib/drive'

describe('buildFolderPath', () => {
  it('income → Ngân hàng', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 5, entityType: 'income' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Tháng 05', 'Chung', 'Ngân hàng'])
  })

  it('expense → Ngân hàng', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 3, entityType: 'expense' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Tháng 03', 'Chung', 'Ngân hàng'])
  })

  it('customer_order → Bán ra', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 12, entityType: 'customer_order' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Tháng 12', 'Chung', 'Bán ra'])
  })

  it('supplier_order → Mua vào', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 1, entityType: 'supplier_order' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Tháng 01', 'Chung', 'Mua vào'])
  })

  it('cash_book → Khác', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 6, entityType: 'cash_book' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Tháng 06', 'Chung', 'Khác'])
  })

  it('projectName thay thế Chung', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, month: 5, projectName: 'Dự án ABC', entityType: 'customer_order' })
    expect(path[3]).toBe('Dự án ABC')
  })

  it('year là số → chuyển thành chuỗi', () => {
    const path = buildFolderPath({ companyName: 'Cty A', year: 2024, month: 1, entityType: 'income' })
    expect(path[1]).toBe('2024')
    expect(typeof path[1]).toBe('string')
  })

  it('year là chuỗi → giữ nguyên', () => {
    const path = buildFolderPath({ companyName: 'Cty A', year: '2024', month: 2, entityType: 'expense' })
    expect(path[1]).toBe('2024')
  })

  it('luôn có đúng 5 segments', () => {
    const path = buildFolderPath({ companyName: 'X', year: 2025, month: 1, entityType: 'income' })
    expect(path).toHaveLength(5)
  })

  it('company name với ký tự đặc biệt được giữ nguyên', () => {
    const path = buildFolderPath({ companyName: 'KBIT & Associates', year: 2025, month: 7, entityType: 'income' })
    expect(path[0]).toBe('KBIT & Associates')
  })

  it('month pad 1 chữ số', () => {
    const path = buildFolderPath({ companyName: 'X', year: 2025, month: 9, entityType: 'income' })
    expect(path[2]).toBe('Tháng 09')
  })
})
