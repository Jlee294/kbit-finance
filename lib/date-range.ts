/**
 * Khoảng ngày [from, to] từ NĂM (+ THÁNG tùy chọn). Hàm THUẦN (test được).
 *   year='2026', month rỗng  → 2026-01-01 .. 2026-12-31 (cả năm)
 *   year='2026', month='3'   → 2026-03-01 .. 2026-03-31 (riêng tháng 3)
 * Dùng cho lọc toàn cục: Năm (global) + Tháng (per-sheet).
 */
export function yearMonthRange(year: string, month?: string | null): { from: string; to: string } {
  const y = Number(year)
  if (month && month !== '') {
    const m = Number(month)
    const mm = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()   // ngày cuối tháng (m tính từ 1)
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` }
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * Khoảng ngày cuối cùng cho 1 sheet: ưu tiên from/to người dùng nhập tay;
 * nếu không thì theo Năm (global) + Tháng (per-sheet).
 */
export function resolveRange(
  year: string,
  month?: string | null,
  from?: string | null,
  to?: string | null,
): { from: string; to: string } {
  if (from || to) {
    return { from: from || `${year}-01-01`, to: to || `${year}-12-31` }
  }
  return yearMonthRange(year, month)
}
