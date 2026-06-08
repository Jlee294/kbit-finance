import { describe, it, expect } from 'vitest'
import { yearMonthRange, resolveRange } from './date-range'

describe('yearMonthRange — Năm (global) + Tháng (per-sheet)', () => {
  it('không tháng → cả năm', () => {
    expect(yearMonthRange('2026', '')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(yearMonthRange('2026', null)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(yearMonthRange('2026')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
  it('tháng giữa năm → đúng ngày đầu/cuối tháng', () => {
    expect(yearMonthRange('2026', '3')).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })
  it('tháng có 30 ngày', () => {
    expect(yearMonthRange('2026', '4')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })
  it('tháng 2 năm thường (28) và năm nhuận (29)', () => {
    expect(yearMonthRange('2026', '2')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(yearMonthRange('2024', '2')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
  it('tháng 12', () => {
    expect(yearMonthRange('2026', '12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('resolveRange — ưu tiên from/to người dùng, không thì năm+tháng', () => {
  it('không from/to → theo năm+tháng', () => {
    expect(resolveRange('2026', '', '', '')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(resolveRange('2026', '5', null, null)).toEqual({ from: '2026-05-01', to: '2026-05-31' })
  })
  it('có from/to → dùng nguyên', () => {
    expect(resolveRange('2026', '5', '2026-03-10', '2026-04-20')).toEqual({ from: '2026-03-10', to: '2026-04-20' })
  })
  it('chỉ from → to lấy cuối năm; chỉ to → from lấy đầu năm', () => {
    expect(resolveRange('2026', '', '2026-06-15', '')).toEqual({ from: '2026-06-15', to: '2026-12-31' })
    expect(resolveRange('2026', '', '', '2026-06-15')).toEqual({ from: '2026-01-01', to: '2026-06-15' })
  })
})
