import { describe, it, expect } from 'vitest'
import {
  isActive, canSeeItem, filterItemsByRole,
  activeGroupLabel, resolveOpenGroups, parseSaved, navGroups,
} from './nav'

describe('isActive', () => {
  it('khớp đúng route', () => expect(isActive('/kho', '/kho')).toBe(true))
  it('khớp route con', () => expect(isActive('/kho/nhap', '/kho')).toBe(true))
  it('KHÔNG khớp nhầm tiền tố', () => expect(isActive('/khoa', '/kho')).toBe(false))
  it('route khác hẳn', () => expect(isActive('/bao-cao', '/kho')).toBe(false))
})

describe('canSeeItem — quyền COST_ROUTES (Sản phẩm)', () => {
  it('admin xem được', () => expect(canSeeItem('/danh-muc/san-pham', 'admin')).toBe(true))
  it('ceo xem được', () => expect(canSeeItem('/danh-muc/san-pham', 'ceo')).toBe(true))
  it('chief_accountant KHÔNG xem', () => expect(canSeeItem('/danh-muc/san-pham', 'chief_accountant')).toBe(false))
  it('accountant KHÔNG xem', () => expect(canSeeItem('/danh-muc/san-pham', 'accountant')).toBe(false))
  it('route thường: ai cũng xem', () => expect(canSeeItem('/bao-cao', 'viewer')).toBe(true))
})

describe('filterItemsByRole — regression: ẩn Sản phẩm', () => {
  const danhMuc = navGroups.find((g) => g.label === 'Danh mục')!.items
  it('accountant không thấy Sản phẩm', () =>
    expect(filterItemsByRole(danhMuc, 'accountant').map((i) => i.href)).not.toContain('/danh-muc/san-pham'))
  it('admin thấy Sản phẩm', () =>
    expect(filterItemsByRole(danhMuc, 'admin').map((i) => i.href)).toContain('/danh-muc/san-pham'))
})

describe('activeGroupLabel', () => {
  it('trả nhóm chứa route active', () => expect(activeGroupLabel(navGroups, '/kho/nhap')).toBe('Kho hàng'))
  it('null khi không khớp', () => expect(activeGroupLabel(navGroups, '/khong-co')).toBe(null))
})

describe('resolveOpenGroups', () => {
  it('lần đầu (saved=null) → chỉ mở nhóm active', () =>
    expect([...resolveOpenGroups('Tổng quan', null)]).toEqual(['Tổng quan']))
  it('có saved → gộp saved và ép mở active', () => {
    const r = resolveOpenGroups('Tổng quan', ['Danh mục'])
    expect(r.has('Danh mục')).toBe(true)
    expect(r.has('Tổng quan')).toBe(true)
  })
  it('không có active → dùng đúng saved', () =>
    expect([...resolveOpenGroups(null, ['Kho hàng'])]).toEqual(['Kho hàng']))
  it('active luôn ép mở dù saved bỏ nó', () =>
    expect(resolveOpenGroups('Kho hàng', []).has('Kho hàng')).toBe(true))
})

describe('parseSaved', () => {
  it('null khi rỗng', () => expect(parseSaved(null)).toBe(null))
  it('parse mảng string', () => expect(parseSaved('["A","B"]')).toEqual(['A', 'B']))
  it('null khi JSON hỏng', () => expect(parseSaved('{hỏng')).toBe(null))
  it('lọc phần tử không phải string', () => expect(parseSaved('["A",1,null]')).toEqual(['A']))
})
