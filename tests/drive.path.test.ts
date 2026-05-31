/**
 * tests/drive.path.test.ts
 *
 * Unit tests cho buildFolderPath() — hàm pure, không I/O.
 * Kiểm tra cấu trúc thư mục Drive được tạo đúng theo entity type.
 */

import { describe, it, expect } from 'vitest'
import { buildFolderPath } from '@/lib/drive'

describe('buildFolderPath', () => {
  it('income → Thu tiền', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, entityType: 'income' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Thu tiền'])
  })

  it('expense → Chi phí', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, entityType: 'expense' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Chi phí'])
  })

  it('customer_order → Đơn hàng KH', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, entityType: 'customer_order' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Đơn hàng KH'])
  })

  it('supplier_order → Đơn hàng NCC', () => {
    const path = buildFolderPath({ companyName: 'KBIT Corp', year: 2025, entityType: 'supplier_order' })
    expect(path).toEqual(['KBIT Corp', '2025', 'Đơn hàng NCC'])
  })

  it('year là số → chuyển thành chuỗi', () => {
    const path = buildFolderPath({ companyName: 'Cty A', year: 2024, entityType: 'income' })
    expect(path[1]).toBe('2024')
    expect(typeof path[1]).toBe('string')
  })

  it('year là chuỗi → giữ nguyên', () => {
    const path = buildFolderPath({ companyName: 'Cty A', year: '2024', entityType: 'expense' })
    expect(path[1]).toBe('2024')
  })

  it('luôn có đúng 3 segments', () => {
    const path = buildFolderPath({ companyName: 'X', year: 2025, entityType: 'income' })
    expect(path).toHaveLength(3)
  })

  it('company name với ký tự đặc biệt được giữ nguyên', () => {
    const path = buildFolderPath({ companyName: 'KBIT & Associates', year: 2025, entityType: 'income' })
    expect(path[0]).toBe('KBIT & Associates')
  })
})
